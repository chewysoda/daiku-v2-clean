import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { extension, loadModel } from "./CadViewer";

/**
 * A small live view of a 3D model: it turns slowly until someone drags it, and stops drawing while
 * it's off screen. The full viewer (measure, section, views) is one click away.
 */
export default function ModelPreview({ url, path, label }: { url: string; path: string; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "step">("loading");
  const ext = extension(path);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (ext === "step" || ext === "stp") {
      setState("step");
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setState("error");
      return;
    }
    let disposed = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotate = !still;
    controls.autoRotateSpeed = 1.6;
    controls.addEventListener("start", () => (controls.autoRotate = false));

    void loadModel(url, ext)
      .then((m) => {
        if (disposed) return;
        scene.add(m);
        const bounds = new THREE.Box3().setFromObject(m);
        const center = bounds.getCenter(new THREE.Vector3());
        const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 1);
        camera.position.copy(center).addScaledVector(new THREE.Vector3(1, 0.8, 1).normalize(), radius * 3);
        camera.near = radius / 50;
        camera.far = radius * 20;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        setState("ready");
      })
      .catch(() => !disposed && setState("error"));

    let visible = true;
    const seen = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    seen.observe(el);
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      controls.update();
      renderer.render(scene, camera);
    };
    tick();
    const sized = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    });
    sized.observe(el);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      seen.disconnect();
      sized.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url, ext]);

  return (
    <div className="model-preview" ref={host} role="img" aria-label={`3D preview of ${label}. Drag to turn it.`}>
      {state === "loading" && <span className="model-preview-note cap">Loading model…</span>}
      {state === "error" && <span className="model-preview-note cap">Couldn't show this model here.</span>}
      {state === "step" && <span className="model-preview-note cap">STEP file: open the full viewer, or convert it to GLB for the web.</span>}
    </div>
  );
}
