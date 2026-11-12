import type cytoscape from "cytoscape";

/** How far a node wanders from home, in graph units. Small enough that clicks still land. */
const DRIFT = 4;
const BLOOM_MS = 640;
const MORPH_MS = 560;
const CAMERA_MS = 520;
const WAVE_MS = 120;
const FADE_OUT_MS = 260;
const PULSE_MS = 1500;
const PULSE_EVERY_MS = 650;
const MAX_AMBIENT_PULSES = 10;
const MAX_RIPPLE_PULSES = 30;
const RING_MS = 900;
const HALO_MS = 3000;
/** Past this, moving every node each frame costs more than it's worth. */
const MAX_DRIFTING_NODES = 400;

export interface MotionEdge {
  id: string;
  source: string;
  target: string;
}
export interface MotionColors {
  accent: string;
  text: string;
  muted: string;
  assumption: string;
  selection: string;
}
export interface Box {
  x1: number;
  y1: number;
  w: number;
  h: number;
}
type Point = { x: number; y: number };

/** Stable per-node offset, so a node drifts the same way each time. */
export function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 6283) / 1000;
}

/** Two slow sine waves per axis: uneven enough to look alive, never more than `DRIFT` from home. */
export function driftAt(phase: number, ms: number): Point {
  const wave = (a: number, b: number, p: number) =>
    (Math.sin(ms * a + p) * 0.7 + Math.sin(ms * b + p * 1.7) * 0.3) * DRIFT;
  return { x: wave(0.00041, 0.00083, phase), y: wave(0.00033, 0.00097, phase + 2.1) };
}

/**
 * How many links each node is from the best-connected one, which sets the order nodes bloom in.
 * Unconnected groups continue counting from where the last one stopped.
 */
export function wavesFrom(ids: string[], edges: MotionEdge[]): Map<string, number> {
  const near = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (near.has(e.source) && near.has(e.target)) {
      near.get(e.source)!.push(e.target);
      near.get(e.target)!.push(e.source);
    }
  }
  const byDegree = [...ids].sort((a, b) => near.get(b)!.length - near.get(a)!.length);
  const out = new Map<string, number>();
  let wave = 0;
  for (const start of byDegree) {
    if (out.has(start)) continue;
    out.set(start, wave);
    let frontier = [start];
    while (frontier.length) {
      wave++;
      const next: string[] = [];
      for (const id of frontier) {
        for (const other of near.get(id)!) {
          if (!out.has(other)) {
            out.set(other, wave);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
  }
  return out;
}

/** The zoom and pan that frame a box, without zooming a small graph uncomfortably far in. */
export function frameBox(box: Box, width: number, height: number, padding: number, maxZoom = 1.6) {
  const zoom = Math.max(
    0.2,
    Math.min((width - padding * 2) / Math.max(box.w, 1), (height - padding * 2) / Math.max(box.h, 1), maxZoom),
  );
  return {
    zoom,
    pan: { x: width / 2 - zoom * (box.x1 + box.w / 2), y: height / 2 - zoom * (box.y1 + box.h / 2) },
  };
}

/** How much to widen a layout to suit a wide panel, so it fills the space and its labels stay readable. */
export function widenBy(boxW: number, boxH: number, width: number, height: number, most = 1.9): number {
  if (boxW <= 0 || boxH <= 0 || width <= 0 || height <= 0) return 1;
  return Math.min(Math.max(width / height / (boxW / boxH), 1), most);
}

export const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

interface Body {
  ele: cytoscape.NodeSingular;
  homeX: number;
  homeY: number;
  fromX: number;
  fromY: number;
  start: number;
  dur: number;
  ease: (t: number) => number;
  pullX: number;
  pullY: number;
  /** Eases drift back in after a drag, so a released node doesn't jump. */
  ramp: number;
  phase: number;
  /** Already written at its resting place, so there's nothing to do until something changes. */
  atRest: boolean;
}
interface Pulse {
  from: string;
  to: string;
  start: number;
  color: string;
  size: number;
}

/**
 * Everything that moves on the Threads graph. One frame loop owns node positions, so the bloom, a
 * re-layout, drift and a drag's pull all add together instead of fighting over each node.
 */
export class GraphMotion {
  private bodies = new Map<string, Body>();
  private pulses: Pulse[] = [];
  private rings: { id: string; start: number }[] = [];
  private later: { at: number; run: () => void }[] = [];
  private frameId = 0;
  private lastFrame = 0;
  private nextPulse = 0;
  private amp = 0;
  private ambient = false;
  private hover: string | null = null;
  private selected: string | null = null;
  private grabbed: cytoscape.NodeSingular | null = null;
  private dead = false;
  private layoutKey = "";
  private guide: Point[] | null = null;

  constructor(
    private cy: cytoscape.Core,
    private canvas: HTMLCanvasElement,
    private colors: MotionColors,
    /** The system asks for less motion: nothing tweens on its own. Idle motion is the user's call. */
    private reduced: boolean,
  ) {
    cy.on("mouseover", "node", (e) => this.setHover(e.target.id()));
    cy.on("mouseout", "node", () => this.setHover(null));
    cy.on("grab", "node", (e) => {
      this.grabbed = e.target;
      this.kick();
    });
    cy.on("free", "node", (e) => {
      const b = this.bodies.get(e.target.id());
      if (b) {
        const p = e.target.position();
        b.homeX = p.x;
        b.homeY = p.y;
        b.dur = 0;
        b.ramp = 0;
      }
      this.grabbed = null;
      this.kick();
    });
    // Panning and zooming have to carry the guide line along, even with the idle motion paused.
    cy.on("viewport", () => {
      if (this.guide) this.kick();
    });
    this.resize();
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.frameId);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.cy.resize();
    this.kick();
  }

  /** Bring the graph to these elements, moving what's already on screen rather than redrawing it. */
  update(
    nodes: cytoscape.ElementDefinition[],
    edges: cytoscape.ElementDefinition[],
    layout: cytoscape.LayoutOptions,
    plan: { key: string; guide: Point[] | null } = { key: "", guide: null },
  ) {
    const { cy } = this;
    const now = performance.now();
    const first = cy.nodes().empty();
    this.flushLater();

    const wanted = new Set([...nodes, ...edges].map((d) => d.data.id!));
    const known = (d: cytoscape.ElementDefinition) => cy.$id(d.data.id!).nonempty();
    const leaving = cy.elements().filter((e) => !wanted.has(e.id()));
    const newNodes = nodes.filter((d) => !known(d));
    const newEdges = edges.filter((d) => !known(d));
    for (const d of [...nodes, ...edges]) if (known(d)) cy.$id(d.data.id!).data(d.data);

    const sameShape = plan.key === this.layoutKey;
    this.layoutKey = plan.key;
    if (sameShape && leaving.empty() && !newNodes.length && !newEdges.length) {
      this.refreshFocus();
      return;
    }

    const before = new Map(cy.nodes().map((n) => [n.id(), { ...n.position() }]));
    if (this.reduced) {
      leaving.remove();
    } else {
      leaving.addClass("pre leaving");
      this.later.push({ at: now + FADE_OUT_MS, run: () => void leaving.remove() });
    }

    const added = cy.add([
      // A new node starts beside one it links to, which also keeps the layout from reshuffling.
      ...newNodes.map((d) => ({
        ...d,
        classes: this.reduced ? "" : "pre",
        position: spawnPoint(d.data.id!, edges, before),
      })),
      ...newEdges.map((d) => ({ ...d, classes: this.reduced ? "" : "pre" })),
    ]);

    const stay = cy.elements().not(".leaving");
    stay.layout({ ...layout, animate: false, fit: false } as cytoscape.LayoutOptions).run();
    const laidOut = stay.nodes().boundingBox({ includeLabels: false, includeOverlays: false });
    const widen = widenBy(laidOut.w, laidOut.h, cy.width(), cy.height());
    const middleX = laidOut.x1 + laidOut.w / 2;
    stay.nodes().forEach((n) => {
      const p = n.position();
      n.position({ x: middleX + (p.x - middleX) * widen, y: p.y });
    });
    this.guide = plan.guide?.map((p) => ({ x: middleX + (p.x - middleX) * widen, y: p.y })) ?? null;
    const target = stay.nodes().boundingBox({ includeLabels: true, includeOverlays: false });
    const view = frameBox(target, cy.width(), cy.height(), 40);

    const waves = first
      ? wavesFrom(
          nodes.map((d) => d.data.id!),
          edges.map((d) => d.data as MotionEdge),
        )
      : null;
    const setOff = new Map<string, number>();
    stay.nodes().forEach((n) => {
      const id = n.id();
      const home = { ...n.position() };
      const start = now + (waves?.get(id) ?? 0) * WAVE_MS;
      const middle = { x: target.x1 + target.w / 2, y: target.y1 + target.h / 2 };
      const from = this.reduced ? home : waves ? middle : (before.get(id) ?? home);
      const old = this.bodies.get(id);
      setOff.set(id, start);
      this.bodies.set(id, {
        ele: n,
        homeX: home.x,
        homeY: home.y,
        fromX: from.x,
        fromY: from.y,
        start,
        dur: this.reduced ? 0 : waves ? BLOOM_MS : MORPH_MS,
        ease: waves ? easeOutBack : easeInOut,
        pullX: old?.pullX ?? 0,
        pullY: old?.pullY ?? 0,
        ramp: old?.ramp ?? 0,
        phase: phaseOf(id),
        atRest: false,
      });
      n.position(from);
    });
    for (const [id, b] of this.bodies) if (b.ele.removed() || b.ele.hasClass("leaving")) this.bodies.delete(id);

    if (!this.reduced) {
      // Each thread appears once the later of its two ends has set off.
      added.forEach((el) => {
        const source: string | undefined = el.data("source");
        const at = source
          ? Math.max(setOff.get(source) ?? now, setOff.get(el.data("target")) ?? now) + (first ? 220 : 120)
          : (setOff.get(el.id()) ?? now);
        this.later.push({ at, run: () => void el.removeClass("pre") });
      });
    }

    this.moveCamera(view, first);
    this.refreshFocus();
    this.kick();
  }

  /** Turn the idle movement on or off. The bloom, re-layouts and clicks still respond either way. */
  setAmbient(on: boolean) {
    this.ambient = on;
    this.kick();
  }

  setSelected(id: string | null, followWithCamera: boolean) {
    const { cy } = this;
    const changed = id !== this.selected;
    this.selected = id;
    const node = id ? cy.$id(id) : cy.collection();
    cy.$(":selected").not(node).unselect();
    node.select();
    this.refreshFocus();
    if (!changed) return;
    if (followWithCamera) {
      if (node.nonempty()) this.frame(node.closedNeighborhood(), 90);
      else this.fit();
    }
    if (node.nonempty() && !this.reduced) this.ripple(id!);
  }

  fit() {
    this.frame(this.cy.elements().not(".leaving"), 40);
  }

  private frame(eles: cytoscape.CollectionReturnValue, padding: number) {
    if (eles.empty()) return;
    const box = eles.boundingBox({ includeLabels: true, includeOverlays: false });
    this.moveCamera(frameBox(box, this.cy.width(), this.cy.height(), padding), false);
  }

  private moveCamera(view: { zoom: number; pan: Point }, jump: boolean) {
    this.cy.stop(true);
    if (jump || this.reduced) this.cy.viewport(view);
    else this.cy.animate({ zoom: view.zoom, pan: view.pan, duration: CAMERA_MS, easing: "ease-in-out-cubic" });
  }

  private setHover(id: string | null) {
    if (id === this.hover) return;
    this.hover = id;
    this.cy.container()!.style.cursor = id ? "pointer" : "";
    this.cy.$(".hot").removeClass("hot");
    if (id) this.cy.$id(id).addClass("hot");
    this.refreshFocus();
  }

  /** Light the hovered or selected node and what it links to, and let the rest recede. */
  private refreshFocus() {
    const { cy } = this;
    const id = this.hover ?? this.selected;
    const node = id ? cy.$id(id) : cy.collection();
    cy.batch(() => {
      if (node.empty()) {
        cy.elements().removeClass("dim");
        return;
      }
      const keep = node.closedNeighborhood();
      keep.removeClass("dim");
      cy.elements().not(keep).addClass("dim");
    });
  }

  /** Send a pulse out from a node, link by link. */
  private ripple(id: string) {
    const now = performance.now();
    this.rings.push({ id, start: now });
    const seen = new Set([id]);
    let frontier = [id];
    for (let ring = 0; ring < 2; ring++) {
      const next: string[] = [];
      for (const from of frontier) {
        this.cy
          .$id(from)
          .neighborhood("node")
          .forEach((n) => {
            const to = n.id();
            if (seen.has(to) || this.pulses.length >= MAX_RIPPLE_PULSES) return;
            seen.add(to);
            next.push(to);
            this.pulses.push({ from, to, start: now + ring * 420, color: this.colors.selection, size: 3.2 });
          });
      }
      frontier = next;
    }
    this.kick();
  }

  /** Anything still scheduled happens now, so a quick filter change can't strand a half-shown element. */
  private flushLater() {
    const due = this.later;
    this.later = [];
    for (const l of due) l.run();
  }

  private kick() {
    if (this.dead || this.frameId) return;
    this.lastFrame = performance.now();
    this.frameId = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(now: number) {
    this.frameId = 0;
    if (this.dead) return;
    const dt = Math.min(now - this.lastFrame, 100);
    this.lastFrame = now;

    if (this.later.length) {
      const due = this.later.filter((l) => l.at <= now);
      this.later = this.later.filter((l) => l.at > now);
      for (const l of due) l.run();
    }

    const moving = this.stepBodies(now, dt);
    const drawing = this.draw(now);
    if (moving || drawing || this.later.length) this.frameId = requestAnimationFrame((t) => this.tick(t));
  }

  private stepBodies(now: number, dt: number): boolean {
    const wantAmp = this.ambient && this.bodies.size <= MAX_DRIFTING_NODES ? 1 : 0;
    this.amp += (wantAmp - this.amp) * (1 - Math.exp(-dt / 300));
    if (Math.abs(wantAmp - this.amp) < 0.002) this.amp = wantAmp;
    const pull = this.dragPull();
    const blend = 1 - Math.exp(-dt / 110);
    let active = this.amp > 0 || this.amp !== wantAmp || this.grabbed !== null;

    this.cy.batch(() => {
      for (const [id, b] of this.bodies) {
        if (b.ele.removed()) {
          this.bodies.delete(id);
          continue;
        }
        if (this.grabbed?.id() === id) continue;
        const t = b.dur ? Math.min(Math.max((now - b.start) / b.dur, 0), 1) : 1;
        const lean = pull.get(id);
        b.pullX += ((lean?.x ?? 0) - b.pullX) * blend;
        b.pullY += ((lean?.y ?? 0) - b.pullY) * blend;
        const leaning = lean !== undefined || Math.abs(b.pullX) > 0.02 || Math.abs(b.pullY) > 0.02;
        if (!leaning) {
          b.pullX = 0;
          b.pullY = 0;
        }
        const k = this.amp * b.ramp;
        const resting = t === 1 && !leaning && k === 0;
        if (resting && b.atRest) continue;
        b.atRest = resting;
        active ||= !resting;
        b.ramp = Math.min(1, b.ramp + dt / 700);
        const d = k > 0 ? driftAt(b.phase, now) : { x: 0, y: 0 };
        const e = b.ease(t);
        b.ele.position({
          x: b.fromX + (b.homeX - b.fromX) * e + d.x * k + b.pullX,
          y: b.fromY + (b.homeY - b.fromY) * e + d.y * k + b.pullY,
        });
      }
    });
    return active;
  }

  /** While a node is dragged, what it links to leans after it, and what those link to leans a little. */
  private dragPull() {
    const out = new Map<string, Point>();
    const g = this.grabbed;
    const b = g && this.bodies.get(g.id());
    if (!g || !b) return out;
    const p = g.position();
    const dx = p.x - b.homeX;
    const dy = p.y - b.homeY;
    const one = g.neighborhood("node");
    one.neighborhood("node").forEach((n) => void out.set(n.id(), { x: dx * 0.07, y: dy * 0.07 }));
    one.forEach((n) => void out.set(n.id(), { x: dx * 0.22, y: dy * 0.22 }));
    out.delete(g.id());
    return out;
  }

  /** Pulses and halos, drawn on a canvas beneath the graph so nodes and labels stay on top. */
  private draw(now: number): boolean {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return false;
    if (this.ambient && now >= this.nextPulse) {
      this.spawnAmbientPulse(now);
      this.nextPulse = now + PULSE_EVERY_MS;
    }
    this.pulses = this.pulses.filter((p) => now - p.start < PULSE_MS);
    this.rings = this.rings.filter((r) => now - r.start < RING_MS);
    const idle = !this.pulses.length && !this.rings.length && this.amp === 0;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    const zoom = this.cy.zoom();
    const pan = this.cy.pan();
    const at = (p: Point) => ({ x: p.x * zoom + pan.x, y: p.y * zoom + pan.y });

    // The spiral itself, faintly, so the shape of the map reads even where links cross it.
    if (this.guide?.length) {
      ctx.beginPath();
      this.guide.forEach((p, i) => {
        const c = at(p);
        if (i) ctx.lineTo(c.x, c.y);
        else ctx.moveTo(c.x, c.y);
      });
      ctx.strokeStyle = this.colors.muted;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (idle) return false;
    const scale = Math.sqrt(zoom);

    const ring = (n: cytoscape.NodeSingular, grow: number, alpha: number, color: string, width: number) => {
      const c = at(n.position());
      ctx.beginPath();
      ctx.arc(c.x, c.y, n.renderedOuterWidth() / 2 + 1 + grow * scale, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    // Clay is for assumptions only, so these halos can only ever mark something unsupported.
    if (this.amp > 0) {
      for (const b of this.bodies.values()) {
        const n = b.ele;
        if (!n.data("gap") || n.hasClass("dim") || n.hasClass("pre")) continue;
        const p = ((now + b.phase * 477) % HALO_MS) / HALO_MS;
        ring(n, p * 13, 0.5 * (1 - p) * this.amp, this.colors.assumption, 1.5);
      }
    }
    for (const r of this.rings) {
      const n = this.cy.$id(r.id);
      if (n.empty()) continue;
      const p = (now - r.start) / RING_MS;
      ring(n, (1 - (1 - p) ** 3) * 34, 0.65 * (1 - p), this.colors.selection, 2);
    }
    for (const pulse of this.pulses) {
      const p = (now - pulse.start) / PULSE_MS;
      const a = this.cy.$id(pulse.from);
      const b = this.cy.$id(pulse.to);
      if (p < 0 || a.empty() || b.empty()) continue;
      const pa = at(a.position());
      const pb = at(b.position());
      const r = pulse.size * scale;
      // A short comet: the head and two fading dots behind it.
      for (let i = 2; i >= 0; i--) {
        const q = easeInOut(Math.max(p - i * 0.022, 0));
        ctx.beginPath();
        ctx.arc(pa.x + (pb.x - pa.x) * q, pa.y + (pb.y - pa.y) * q, r * (1 - i * 0.24), 0, Math.PI * 2);
        ctx.fillStyle = pulse.color;
        ctx.globalAlpha = Math.sin(Math.PI * p) * (1 - i * 0.36);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    return true;
  }

  private spawnAmbientPulse(now: number) {
    if (this.pulses.length >= MAX_AMBIENT_PULSES) return;
    const edges = this.cy.edges().not(".dim, .pre");
    if (edges.empty()) return;
    const e = edges[Math.floor(Math.random() * edges.length)];
    const kind = e.data("kind");
    const color = kind === "supports" ? this.colors.accent : kind === "contradicts" ? this.colors.text : this.colors.muted;
    this.pulses.push({ from: e.source().id(), to: e.target().id(), start: now, color, size: 2.6 });
  }
}

function spawnPoint(id: string, edges: cytoscape.ElementDefinition[], placed: Map<string, Point>): Point {
  const link = edges.find(
    (e) => (e.data.source === id && placed.has(e.data.target)) || (e.data.target === id && placed.has(e.data.source)),
  );
  const base = link ? placed.get(link.data.source === id ? link.data.target : link.data.source)! : middleOf(placed);
  const a = phaseOf(id);
  return { x: base.x + Math.cos(a) * 24, y: base.y + Math.sin(a) * 24 };
}

function middleOf(points: Map<string, Point>): Point {
  let x = 0;
  let y = 0;
  for (const p of points.values()) {
    x += p.x;
    y += p.y;
  }
  return points.size ? { x: x / points.size, y: y / points.size } : { x: 0, y: 0 };
}
