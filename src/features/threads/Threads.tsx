import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import fcose from "cytoscape-fcose";
import { useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { Pill } from "../../design/primitives";
import { parseScope, projectsIn, rowsInScope } from "../../lib/projects";
import { ProjectScopeSelect } from "../library/Projects";
import { buildGraph, GraphNode, neighbourhood, NodeType } from "./graph";
import { GRAPH_MODES, GRAPH_ORDERS, parseGraphLayout, planLayout } from "./graphLayouts";
import { GraphMotion } from "./graphMotion";
import "./threads.css";

const FILTERS: { id: string; label: string; test: (n: GraphNode) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "canvases", label: "Canvases", test: (n) => n.type === "board" },
  { id: "notes", label: "Notes", test: (n) => n.type === "note" },
  { id: "sources", label: "Sources", test: (n) => n.type === "source" },
  { id: "gaps", label: "Assumptions", test: (n) => n.gap },
];
const TYPE_LABEL: Record<NodeType, string> = {
  board: "canvas",
  section: "section",
  source: "source",
  note: "note",
  claim: "claim",
  decision: "decision",
  concept: "concept",
};

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

cytoscape.use(fcose);
cytoscape.use(dagre);

const MOTION_KEY = "daiku.threads.motion";
const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";

/** Idle motion is on unless the system asks for less. A choice made with the button wins over both. */
function loadMotionChoice(): boolean {
  try {
    const saved = localStorage.getItem(MOTION_KEY);
    if (saved) return saved === "on";
  } catch {
    // Storage can be blocked. Fall through to the system setting.
  }
  return !prefersReducedMotion();
}

function saveMotionChoice(on: boolean) {
  try {
    localStorage.setItem(MOTION_KEY, on ? "on" : "off");
  } catch {
    // Not saved. It still applies until the screen closes.
  }
}

function graphStyle(reduced: boolean) {
  const sage = cssVar("--c-accent");
  const text = cssVar("--c-text");
  const surface = cssVar("--c-surface");
  const border = cssVar("--c-border");
  const clay = cssVar("--c-assumption");
  const lilac = cssVar("--c-selection");
  const fade = reduced ? {} : { "transition-property": "opacity, underlay-opacity", "transition-duration": 240 };
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "font-family": cssVar("--font-ui"),
        "font-size": 10,
        "font-weight": 700,
        color: text,
        "text-valign": "bottom",
        "text-margin-y": 5,
        "text-background-color": surface,
        "text-background-opacity": 0.85,
        "text-background-padding": "2px",
        "text-wrap": "ellipsis",
        "text-max-width": "130px",
        // Well-linked things read larger, as in Obsidian's graph.
        width: "mapData(deg, 0, 12, 12, 40)",
        height: "mapData(deg, 0, 12, 12, 40)",
        "background-color": surface,
        "border-width": 1.5,
        "border-color": border,
        "underlay-color": lilac,
        "underlay-padding": 6,
        "underlay-opacity": 0,
        "underlay-shape": "ellipse",
        ...fade,
      },
    },
    { selector: 'node[type = "board"]', style: { "background-color": sage, "border-color": sage } },
    { selector: 'node[type = "decision"]', style: { "background-color": text, "border-color": text } },
    { selector: 'node[type = "note"]', style: { "background-color": cssVar("--c-note"), shape: "round-rectangle" } },
    { selector: 'node[type = "section"]', style: { shape: "round-rectangle", "border-color": sage } },
    // Clay is reserved for assumptions, and the dashed ring means colour isn't the only signal.
    { selector: "node[gap = 1]", style: { "border-color": clay, "border-width": 2.5, "border-style": "dashed" } },
    {
      selector: "node:selected",
      style: { "border-color": lilac, "border-width": 3, "border-style": "solid", "underlay-opacity": 0.25 },
    },
    { selector: "node.hot", style: { "underlay-opacity": 0.3 } },
    { selector: "edge", style: { width: 1, "line-color": border, "curve-style": "bezier", ...fade } },
    { selector: 'edge[kind = "supports"]', style: { "line-color": sage, width: 1.5 } },
    { selector: 'edge[kind = "contradicts"]', style: { "line-color": text, "line-style": "dashed", width: 1.5 } },
    { selector: ".dim", style: { opacity: 0.16 } },
    { selector: ".pre", style: { opacity: 0 } },
  ] as cytoscape.StylesheetJson;
}

export default function Threads() {
  const allBoards = useStore((s) => s.boards);
  const allItems = useStore((s) => s.board_items);
  const allAssets = useStore((s) => s.assets);
  const allClaims = useStore((s) => s.claims);
  const allLinks = useStore((s) => s.evidence_links);
  const allDecisions = useStore((s) => s.decisions);
  const allConcepts = useStore((s) => s.concepts);
  const allCriteria = useStore((s) => s.criteria);
  const allScores = useStore((s) => s.scores);
  const records = useStore((s) => s.records);
  const savedScope = useStore((s) => s.config.library_scope);
  const { boards, board_items: items, assets, claims, evidence_links: links, decisions, concepts, criteria, scores } = useMemo(
    () => rowsInScope({ boards: allBoards, board_items: allItems, assets: allAssets, claims: allClaims, evidence_links: allLinks, decisions: allDecisions, concepts: allConcepts, criteria: allCriteria, scores: allScores, records }, parseScope(savedScope, projectsIn({ records }))),
    [allBoards, allItems, allAssets, allClaims, allLinks, allDecisions, allConcepts, allCriteria, allScores, records, savedScope],
  );
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const layoutSaved = useStore((s) => s.config.graph_layout);
  const setSetting = useStore((s) => s.setSetting);
  const layoutChoice = useMemo(() => parseGraphLayout(layoutSaved), [layoutSaved]);
  const chooseLayout = (changes: Partial<typeof layoutChoice>) => setSetting("graph_layout", JSON.stringify({ ...layoutChoice, ...changes }));
  const fx = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef<GraphMotion | null>(null);
  const [moving, setMoving] = useState(loadMotionChoice);

  const graph = useMemo(
    () => buildGraph({ boards, items, assets, claims, links, decisions, concepts, criteria, scores }),
    [boards, items, assets, claims, links, decisions, concepts, criteria, scores],
  );

  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test;
    const q = query.trim().toLowerCase();
    let ids = new Set(graph.nodes.filter((n) => test(n) && (!q || n.label.toLowerCase().includes(q))).map((n) => n.id));
    if (depth > 0 && selected) {
      const near = neighbourhood(selected, graph.edges, depth);
      ids = new Set([...ids].filter((id) => near.has(id)));
      ids.add(selected);
    }
    return ids;
  }, [graph, filter, query, depth, selected]);

  // The graph lives as long as the screen does. Filtering moves it rather than rebuilding it.
  useEffect(() => {
    if (!host.current || !fx.current) return;
    const reduced = prefersReducedMotion();
    const cy = cytoscape({ container: host.current, minZoom: 0.2, maxZoom: 3, style: graphStyle(reduced) });
    const motion = new GraphMotion(
      cy,
      fx.current,
      {
        accent: cssVar("--c-accent"),
        text: cssVar("--c-text"),
        muted: cssVar("--c-text-muted"),
        assumption: cssVar("--c-assumption"),
        selection: cssVar("--c-selection"),
      },
      reduced,
    );
    cy.on("tap", "node", (e) => setSelected(e.target.id()));
    cy.on("tap", (e) => {
      if (e.target === cy) setSelected(null);
    });
    const observer = new ResizeObserver(() => motion.resize());
    observer.observe(host.current);
    motionRef.current = motion;
    return () => {
      observer.disconnect();
      motion.destroy();
      cy.destroy();
      motionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const nodes = graph.nodes.filter((n) => visible.has(n.id));
    const edges = graph.edges.filter((e) => visible.has(e.source) && visible.has(e.target));
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const plan = planLayout(layoutChoice, nodes, edges);
    motionRef.current?.update(
      nodes.map((n) => ({
        data: { id: n.id, label: n.label, type: n.type, gap: n.gap ? 1 : 0, deg: degree.get(n.id) ?? 0 },
      })),
      edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, kind: e.kind } })),
      plan.layout,
      { key: JSON.stringify(layoutChoice), guide: plan.guide },
    );
  }, [graph, visible, layoutChoice]);

  // A depth change already re-frames the graph, so the camera only follows selection at full depth.
  useEffect(() => {
    motionRef.current?.setSelected(selected, depth === 0);
  }, [selected, depth, visible]);

  useEffect(() => {
    motionRef.current?.setAmbient(moving);
  }, [moving]);

  const node = graph.nodes.find((n) => n.id === selected);
  const related = node
    ? graph.edges
        .filter((e) => e.source === node.id || e.target === node.id)
        .map((e) => ({ e, other: graph.nodes.find((n) => n.id === (e.source === node.id ? e.target : e.source)) }))
        .filter((r) => r.other)
    : [];
  const gaps = graph.nodes.filter((n) => n.gap);

  return (
    <div className="threads-wrap">
      <main className="page threads">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="fr page-title">Threads</h1>
            <span className="page-sub">Every idea, linked. A dashed ring marks anything still unsupported.</span>
          </div>
          <ProjectScopeSelect />
        </div>
        <div className="threads-tools">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`chip-toggle ${filter === f.id ? "on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
          <span className="grow" />
          <label className="check">
            Layout
            <select className="field depth" value={layoutChoice.mode} onChange={(e) => chooseLayout({ mode: e.target.value as typeof layoutChoice.mode })}>
              {GRAPH_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {layoutChoice.mode === "spiral" && (
            <label className="check">
              Order
              <select className="field order" value={layoutChoice.order} onChange={(e) => chooseLayout({ order: e.target.value as typeof layoutChoice.order })}>
                {GRAPH_ORDERS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="check threads-spacing">
            <span className="sr-only">Node spacing</span>
            <span aria-hidden="true">Spacing</span>
            <input type="range" min={0.5} max={2.5} step={0.1} value={layoutChoice.spacing} onChange={(e) => chooseLayout({ spacing: Number(e.target.value) })} />
          </label>
          <label className="check">
            Depth
            <select className="field depth" value={depth} disabled={!selected} onChange={(e) => setDepth(Number(e.target.value))}>
              <option value={0}>Whole graph</option>
              <option value={1}>1 link</option>
              <option value={2}>2 links</option>
              <option value={3}>3 links</option>
            </select>
          </label>
          <label className="threads-filter">
            <Icon name="search" size={16} />
            <input aria-label="Filter nodes" placeholder="Filter nodes" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <Pill
            className="small"
            onClick={() => {
              saveMotionChoice(!moving);
              setMoving(!moving);
            }}
          >
            {moving ? "Pause motion" : "Play motion"}
          </Pill>
          <Pill className="small" onClick={() => motionRef.current?.fit()}>
            Fit
          </Pill>
        </div>
        <div className="graph-stage">
          <canvas className="graph-fx" ref={fx} aria-hidden="true" />
          <section aria-label="Graph view" className="graph" ref={host} data-testid="graph" data-nodes={visible.size} />
        </div>
      </main>
      <aside className="thread-panel" aria-label="Details">
        {node ? (
          <>
            <span className="cap">{TYPE_LABEL[node.type]}{node.gap ? " · unsupported" : ""}</span>
            <h2 className="fr">{node.label}</h2>
            <Link className="pill small thread-open" to={node.route}>
              Open
              <Icon name="arrow-right" size={14} />
            </Link>
            <span className="cap">linked · {related.length}</span>
            <ul className="thread-list">
              {related.map(({ e, other }) => (
                <li key={e.id}>
                  <button type="button" onClick={() => setSelected(other!.id)}>
                    <b>{other!.label}</b>
                    <span className="cap">{e.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <span className="cap">gaps · {gaps.length}</span>
            <h2 className="fr">What's unsupported</h2>
            <ul className="thread-list">
              {gaps.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => setSelected(g.id)}>
                    <b>{g.label}</b>
                    <span className="cap guess">{TYPE_LABEL[g.type]}</span>
                  </button>
                </li>
              ))}
              {!gaps.length && <li className="cap">Nothing. Every source and claim is backed.</li>}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
