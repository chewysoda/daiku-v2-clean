import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { Pill, toast } from "../../design/primitives";
import { mediaUrl } from "../../lib/platform";
import { fetchBytes, saveBytes } from "../../lib/saveFile";
import "../studio.css";

type View = "iso" | "front" | "side" | "top";
const DIRECTIONS: Record<View, [number, number, number]> = { iso: [1, 0.8, 1], front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0] };

interface SceneApi {
  setView: (v: View) => void;
  setSection: (on: boolean) => void;
  png: () => string;
}

export const extension = (path: string) => /\.([a-z0-9]+)(?:$|\?)/i.exec(path)?.[1]?.toLowerCase() ?? "";

export async function loadModel(url: string, ext: string): Promise<THREE.Object3D> {
  const bytes = await fetchBytes(url);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const material = new THREE.MeshStandardMaterial({ color: 0xc9a67d, roughness: 0.7, side: THREE.DoubleSide });
  if (ext === "stl") {
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    // CAD STL files are Z-up; the viewer is Y-up.
    geometry.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geometry, material);
  }
  if (ext === "obj") {
    const obj = new OBJLoader().parse(new TextDecoder().decode(bytes));
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = material;
    });
    return obj;
  }
  if (ext === "glb" || ext === "gltf") {
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    return gltf.scene;
  }
  throw new Error(`Daiku can't open .${ext} files yet`);
}

export default function CadViewer() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const asset = useStore((s) => s.assets.find((a) => a.id === assetId));
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<SceneApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState<[number, number, number] | null>(null);
  const [triangles, setTriangles] = useState(0);
  const [view, setView] = useState<View>("iso");
  const [section, setSection] = useState(false);

  const url = asset ? mediaUrl(asset) : null;
  const ext = extension(asset?.file_path ?? asset?.preview ?? "");
  const isStep = ext === "step" || ext === "stp";

  useEffect(() => {
    if (!url || !host.current || isStep) return;
    const el = host.current;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    } catch (e) {
      setError(`3D graphics aren't available here. ${e}`);
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    let center = new THREE.Vector3();
    let radius = 500;
    let model: THREE.Object3D | null = null;

    const setCamera = (v: View) => {
      const dir = new THREE.Vector3(...DIRECTIONS[v]).normalize();
      camera.position.copy(center).addScaledVector(dir, radius * 3.2);
      camera.near = radius / 50;
      camera.far = radius * 20;
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
    };

    api.current = {
      setView: setCamera,
      setSection: (on) => {
        model?.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).clippingPlanes = on ? [clip] : [];
        });
      },
      png: () => {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
      },
    };

    void loadModel(url, ext)
      .then((m) => {
        if (disposed) return;
        model = m;
        scene.add(m);
        const bounds = new THREE.Box3().setFromObject(m);
        const size = bounds.getSize(new THREE.Vector3());
        center = bounds.getCenter(new THREE.Vector3());
        radius = Math.max(size.length() / 2, 1);
        clip.constant = center.x;
        // Back on CAD axes: X, depth, height.
        setBox([size.x, size.z, size.y]);
        let count = 0;
        m.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const g = o.geometry as THREE.BufferGeometry;
            count += (g.index ? g.index.count : g.attributes.position.count) / 3;
          }
        });
        setTriangles(count);
        setCamera("iso");
      })
      .catch((e) => setError(String(e)));

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();
    const observer = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    });
    observer.observe(el);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [url, ext, isStep]);

  if (!asset) {
    return (
      <main className="page">
        <h1 className="fr page-title">CAD viewer</h1>
        <p>That model isn't in your library.</p>
      </main>
    );
  }

  const exportView = async () => {
    const png = api.current?.png();
    if (!png) return;
    const bytes = Uint8Array.from(atob(png.split(",")[1]), (c) => c.charCodeAt(0));
    if (await saveBytes(`${asset.title} ${view}.png`, bytes, "PNG image", ["png"], "image/png")) toast("View exported");
  };

  return (
    <main className="reader" aria-label="CAD viewer">
      <header className="reader-head">
        <button type="button" className="ib" aria-label="Back" onClick={() => navigate(-1)}>
          <Icon name="arrow-right" size={18} />
        </button>
        <h1 className="fr reader-title">{asset.title}</h1>
        <span className="cap">.{ext || "model"}{asset.is_sample ? " · sample" : ""}</span>
        <div className="reader-gap" />
        <Pill disabled={!box} onClick={() => void exportView()}>
          Export view
        </Pill>
      </header>
      <div className="reader-body cad-body">
        <div className="cad-stage">
          {isStep ? (
            <div className="cad-note" role="status">
              <b>STEP files can't open yet.</b>
              <p>The candidate loader, occt-import-js (LGPL-2.1), is waiting on your OK before it's installed. STL, OBJ and glTF open today, so an export from your CAD tool works in the meantime.</p>
            </div>
          ) : (
            <div ref={host} className="cad-canvas" data-testid="cad-canvas" />
          )}
          {error && (
            <p className="fail-text cad-error" role="alert">
              {error}
            </p>
          )}
          {!isStep && (
            <div className="seg-group cad-views" role="group" aria-label="View">
              {(Object.keys(DIRECTIONS) as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`seg ${view === v ? "on" : ""}`}
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v);
                    api.current?.setView(v);
                  }}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
              <button
                type="button"
                className={`seg ${section ? "on" : ""}`}
                aria-pressed={section}
                onClick={() => {
                  api.current?.setSection(!section);
                  setSection(!section);
                }}
              >
                Section
              </button>
            </div>
          )}
        </div>
        <aside className="reader-side" aria-label="Properties">
          <span className="cap">Properties</span>
          <div className="kv">
            <span>Bounding box</span>
            <span className="mono" data-testid="cad-box">
              {box ? box.map((n) => Math.round(n)).join(" × ") : "–"}
            </span>
          </div>
          <div className="kv">
            <span>Triangles</span>
            <span className="mono">{triangles ? triangles.toLocaleString() : "–"}</span>
          </div>
          <p className="cap">STL and OBJ have no units. Sizes are the file's numbers, normally millimetres, so check them against your CAD tool before using them as evidence.</p>
          <p className="cap">Viewer only. Editing stays in your CAD tool. Mass needs materials, so it comes from the BOM, not from here.</p>
        </aside>
      </div>
    </main>
  );
}
