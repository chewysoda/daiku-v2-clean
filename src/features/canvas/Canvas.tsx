import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLACE_EVENT, PlaceRequest } from "../../lib/placeOnBoard";
import { isWebAddress } from "../../lib/links";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Asset, Board, useLatestBoard, useStore } from "../../data/store";
import { BoardItem, ConnectorKind, now, uid } from "../../data/types";
import { Icon, IconName } from "../../design/Icon";
import { AssetImage, ConfirmDialog, Pill, Popover, PromptDialog, toast } from "../../design/primitives";
import { MathText } from "../../design/MathText";
import { MATS, matOf, parseCustomFonts } from "../../lib/appearance";
import { boardSize, isSvgMarkup, svgInfo } from "../../lib/svg";
import { copyText, isTauri, native, openExternal } from "../../lib/platform";
import { creditLine, isCredited } from "../../lib/search";
import { importPaths, pickAndImport } from "../library/importing";
import { BoardDoc } from "./boardDoc";
import { nextZ, placeAssets } from "./boardOps";
import { constrain, DrawStyle, DrawTool, figurePath, hitsDrawing, isDrawn, parseDrawStyles, pathSamples, Pt, shapeBox, simplify, smoothPath, strokeFrom } from "./drawing";
import { DrawBar } from "./DrawBar";
import { readHandwriting, strokePoints, writingBox, writtenStrokes } from "./handwriting";
import { pencilPath, pressureFrom } from "./pencil";
import { ShapeItem, StrokeItem, strokeProps } from "./DrawnItem";
import { CuttingMat } from "./CuttingMat";
import { AlignMode, alignItems, CLIPBOARD_TYPE, GRID, isStickerPicture, itemLook, MAX_PICTURE_STICKERS, parseClipboardItems, parsePictureStickers, parseStickyStyle, PictureSticker, snapTo, STICKER_EMOJI, STICKER_LABELS, stickerBox } from "./itemStyle";
import { readStickerFile } from "./stickerPicture";
import { AlignBar, StickerPicker, StyleBar } from "./StyleBar";
import { fillPalette, newAsset, saveLink } from "../library/importing";
import { DotGrid } from "./DotGrid";
import { CONNECTOR_LOOKS, connectorPath, connectorShape, fitView, inRect, itemsInSection, MAX_ZOOM, MIN_ZOOM, View, visibleItems, zoomAt } from "./geometry";
import { SendToClaude } from "../pack/SendToClaude";
import { accepted, isProposal } from "../../lib/proposals";
import { updatePlan } from "../pack/usePack";
import { readerHref } from "../../app/ReaderPanel";
import { ClaimCard, SourceCard } from "./Cards";
import { parsePlan, setIncluded, setPinned } from "../../lib/packPlan";
import { projectsIn } from "../../lib/projects";
import { NewDialog } from "../../app/NewDialog";
import { Guide, smartSnap } from "../../lib/designTools";
import { PaletteTools } from "./PaletteTools";
import { FolderDialog } from "./FolderDialog";
import { FOLDER_SIZE, folderName, pickFiles, uploadAsMarkdown } from "./folderUpload";
import "./canvas.css";
import "./cards.css";

type Tool = "select" | "hand" | "pencil" | "marker" | "eraser" | "shape" | "text" | "sticky" | "image" | "upload" | "connector" | "sticker";
const isDrawTool = (t: Tool): t is DrawTool => t === "pencil" || t === "marker" || t === "shape";

const TOOLS: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: "select", icon: "select", label: "Select", key: "V" },
  { tool: "hand", icon: "hand", label: "Hand", key: "H" },
  { tool: "pencil", icon: "pencil", label: "Pencil", key: "P" },
  { tool: "marker", icon: "marker", label: "Marker", key: "M" },
  { tool: "eraser", icon: "eraser", label: "Eraser", key: "E" },
  { tool: "shape", icon: "shapes", label: "Shapes", key: "R" },
  { tool: "text", icon: "text", label: "Text", key: "T" },
  { tool: "sticky", icon: "sticky-note", label: "Sticky note", key: "N" },
  { tool: "image", icon: "image", label: "Image from Library", key: "I" },
  { tool: "upload", icon: "import", label: "Upload files as Markdown", key: "U" },
  { tool: "connector", icon: "connector", label: "Connector", key: "C" },
  { tool: "sticker", icon: "stickers", label: "Sticker", key: "S" },
];

const CONNECTOR_KINDS: ConnectorKind[] = ["plain", "supports", "contradicts", "inspired-by", "requires"];

type Gesture =
  | { kind: "pan"; x: number; y: number; vx: number; vy: number }
  | { kind: "drag"; x: number; y: number; ids: string[]; moved: boolean }
  | { kind: "resize"; x: number; y: number; id: string; handle: string; orig: BoardItem }
  | { kind: "marquee"; x: number; y: number; additive: boolean }
  | { kind: "connect"; from: string }
  | { kind: "draw"; tool: "pencil" | "marker" }
  | { kind: "shape"; x: number; y: number }
  | { kind: "erase" }
  | { kind: "focus"; x: number; y: number; id: string; fx: number; fy: number };

/** True when the wheel lands on something inside the board that can scroll itself, like a long code block. */
function scrollsInside(target: EventTarget | null, board: HTMLElement | null): boolean {
  for (let el = target as HTMLElement | null; el && el !== board; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

function ItemCaption({ item, asset }: { item: BoardItem; asset: Asset | undefined }) {
  if (!asset) return <figcaption className="cap">file removed</figcaption>;
  const caption = item.data.caption;
  if (!isCredited(asset)) {
    return (
      <figcaption className="cap">
        {caption ?? asset.title} · <span className="guess">no source yet</span>
      </figcaption>
    );
  }
  return (
    <figcaption className="cap">
      {asset.credit === "yours" ? "yours" : `© ${asset.credit}`} · {caption ?? asset.title}
    </figcaption>
  );
}

function ProvenanceCard({ asset, style }: { asset: Asset; style: React.CSSProperties }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backs = useStore((s) => s.evidence_links.filter((l) => l.asset_id === asset.id).length);
  return (
    <aside className="prov" style={style} aria-label="Where it's from" onPointerDown={(e) => e.stopPropagation()}>
      <div className="prov-head">
        <span className="fr">Where it's from</span>
        <span className="cap">
          saved {new Date(asset.captured_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
      </div>
      <div className="prov-maker">
        <span className="av prov-av">{(asset.credit ?? "?").replace(/[[\]]/g, "")[0]?.toUpperCase()}</span>
        <span className="prov-names">
          <b>{asset.credit ?? <span className="guess">No source yet</span>}</b>
          <span className="cap">{asset.via ? `via ${asset.via} · auto-credited` : "added by you"}</span>
        </span>
      </div>
      <div className="prov-chips">
        {asset.provenance === "human" && (
          <span className="prov-chip ok">
            <Icon name="check" size={12} />
            Human-made
          </span>
        )}
        {asset.provenance === "ai" && <span className="prov-chip">AI-generated</span>}
        {backs > 0 && (
          <span className="prov-chip">
            Backs {backs} {backs === 1 ? "claim" : "claims"}
          </span>
        )}
      </div>
      <div className="prov-actions">
        {asset.kind === "pdf" && (
          <Pill className="small" ink onClick={() => navigate(readerHref(pathname, asset.id))}>
            Read beside the board
          </Pill>
        )}
        <Pill className="small" disabled={!asset.source_url} onClick={() => asset.source_url && void openExternal(asset.source_url)}>
          Open source
        </Pill>
        <Pill
          className="small"
          onClick={async () => toast((await copyText(creditLine(asset))) ? "Credit copied" : "Couldn't reach the clipboard")}
        >
          Copy credit
        </Pill>
      </div>
    </aside>
  );
}

function ClaimLinker({ asset, boardId, onClose, onPlace, placed }: { asset: Asset; boardId: string; onClose: () => void; onPlace: (claimId: string, text: string) => void; placed: Set<string> }) {
  const claims = useStore((s) => s.claims);
  const addClaim = useStore((s) => s.addClaim);
  const links = useStore((s) => s.evidence_links);
  const link = useStore((s) => s.linkEvidence);
  const unlink = useStore((s) => s.unlinkEvidence);
  const [text, setText] = useState("");
  return (
    <Popover className="claim-pop" onClose={onClose}>
      <span className="cap">this image backs…</span>
      {claims.map((c) => {
        const existing = links.find((l) => l.asset_id === asset.id && l.target_type === "claim" && l.target_id === c.id);
        return (
          <label key={c.id} className="check claim-row">
            <input
              type="checkbox"
              checked={Boolean(existing)}
              onChange={() => (existing ? unlink(existing.id) : link(asset.id, "claim", c.id))}
            />
            <span className="claim-row-text">{c.text}</span>
            {!placed.has(c.id) && (
              <button
                type="button"
                className="link-btn"
                onClick={(e) => {
                  e.preventDefault();
                  onPlace(c.id, c.text);
                }}
              >
                Put on board
              </button>
            )}
          </label>
        );
      })}
      <form
        className="claim-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const claim = addClaim(text.trim(), boardId);
          link(asset.id, "claim", claim.id);
          onPlace(claim.id, claim.text);
          setText("");
        }}
      >
        <input className="field" placeholder="New claim…" aria-label="New claim" value={text} onChange={(e) => setText(e.target.value)} />
      </form>
    </Popover>
  );
}

function ImagePicker({ onPick, onClose }: { onPick: (ids: string[]) => void; onClose: () => void }) {
  const assets = useStore((s) => s.assets);
  const [q, setQ] = useState("");
  const shown = assets.filter((a) => `${a.title} ${a.credit} ${a.tags}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog picker" role="dialog" aria-label="Add from Library">
        <div className="picker-head">
          <h2 className="fr dialog-title">Add from Library</h2>
          <Pill
            className="small"
            onClick={async () => {
              const created = await pickAndImport();
              if (created.length) onPick(created.map((a) => a.id));
            }}
          >
            <Icon name="import" size={14} />
            Import
          </Pill>
        </div>
        <input autoFocus className="field" placeholder="Filter…" aria-label="Filter library" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} />
        <div className="picker-grid">
          {shown.map((a) => (
            <button key={a.id} type="button" className="picker-item" aria-label={`Add ${a.title}`} onClick={() => onPick([a.id])}>
              <AssetImage asset={a} />
            </button>
          ))}
          {!shown.length && <span className="cap">Nothing matches.</span>}
        </div>
      </div>
    </div>
  );
}

function BoardCanvas({ board }: { board: Board }) {
  const navigate = useNavigate();
  const assets = useStore((s) => s.assets);
  const boards = useStore((s) => s.boards);
  const putItems = useStore((s) => s.putItems);
  const deleteItems = useStore((s) => s.deleteItems);
  const touchBoard = useStore((s) => s.touchBoard);
  const renameBoard = useStore((s) => s.renameBoard);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const updateAsset = useStore((s) => s.updateAsset);
  const records = useStore((s) => s.records);
  // The project this board belongs to, and its other boards: the ones the dropdown switches between.
  const project = useMemo(() => projectsIn({ records }).find((p) => p.data.board_ids.includes(board.id)) ?? null, [records, board.id]);
  const siblings = useMemo(() => {
    if (!project) return boards;
    const order = project.data.board_ids;
    return boards.filter((b) => order.includes(b.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [boards, project]);
  const others = useMemo(() => (project ? boards.filter((b) => !project.data.board_ids.includes(b.id)) : []), [boards, project]);

  const [doc] = useState(() => new BoardDoc(useStore.getState().board_items.filter((i) => i.board_id === board.id)));
  const [items, setItems] = useState<BoardItem[]>(() => doc.all());
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const mat = matOf(useStore((s) => s.config.theme));
  const gridStyle = useStore((s) => s.config.canvas_grid);
  const snapOn = useStore((s) => s.config.canvas_snap === "1");
  const stickyStyle = useStore((s) => s.config.sticky_style);
  const customFontsSaved = useStore((s) => s.config.custom_fonts);
  const customStickersSaved = useStore((s) => s.config.custom_stickers);
  const pictureStickersSaved = useStore((s) => s.config.picture_stickers);
  const setSetting = useStore((s) => s.setSetting);
  const drawStylesSaved = useStore((s) => s.config.draw_styles);
  const drawStyles = useMemo(() => parseDrawStyles(drawStylesSaved), [drawStylesSaved]);
  const setDrawStyle = (tool: DrawTool, changes: Partial<DrawStyle>) =>
    setSetting("draw_styles", JSON.stringify({ ...drawStyles, [tool]: { ...drawStyles[tool], ...changes } }));
  // Points go straight to a path element while drawing, as re-rendering the board per point would lag.
  const drawnPoints = useRef<[number, number, number][]>([]);
  const paintPreview = (tool: "pencil" | "marker") => {
    const style = drawStyles[tool];
    const flat = drawnPoints.current.flatMap((p) => [p[0], p[1]]);
    previewPath.current?.setAttribute(
      "d",
      style.feel === "natural" && style.dash === "solid" ? pencilPath(flat, drawnPoints.current.map((p) => p[2]), style.width) : smoothPath(flat),
    );
  };
  const previewPath = useRef<SVGPathElement>(null);
  const lastErase = useRef<Pt | null>(null);
  const [shapeDraft, setShapeDraft] = useState<{ x: number; y: number; w: number; h: number; flipX: boolean; flipY: boolean } | null>(null);
  const customFonts = useMemo(() => parseCustomFonts(customFontsSaved), [customFontsSaved]);
  const customStickers = useMemo<string[]>(() => {
    try {
      const list = JSON.parse(customStickersSaved || "[]");
      return Array.isArray(list) ? list.filter((s) => typeof s === "string") : [];
    } catch {
      return [];
    }
  }, [customStickersSaved]);
  const pictureStickers = useMemo(() => parsePictureStickers(pictureStickersSaved), [pictureStickersSaved]);
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  // Smart guides: lines showing what a dragged item lines up with. Alt turns snapping off.
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [rubber, setRubber] = useState<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<BoardItem | null>(null);
  const [menu, setMenu] = useState<"claim" | "more" | "sticker" | "boards" | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"image" | "rename" | "new" | "delete" | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);

  // Every change flows from the Yjs doc to React state and SQLite, including undo and redo.
  useEffect(() => {
    const off = doc.observe((changed, removed) => {
      setItems(doc.all());
      putItems(changed);
      deleteItems(removed);
      touchBoard(board.id);
    });
    // Not destroyed here: StrictMode re-runs effects, and destroying would kill undo. Nothing
    // outside this component holds the doc, so it's garbage-collected with it.
    return off;
  }, [doc, board.id, putItems, deleteItems, touchBoard]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setSize({ w, h });
      if (!fitted.current && w > 0) {
        fitted.current = true;
        setView(fitView(doc.all(), w, h));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = viewport.current!.getBoundingClientRect();
      return { x: (clientX - r.left - view.x) / view.zoom, y: (clientY - r.top - view.y) / view.zoom };
    },
    [view],
  );

  const center = () => ({ x: (size.w / 2 - view.x) / view.zoom, y: (size.h / 2 - view.y) / view.zoom });
  const assetOf = useCallback((id: string | null) => assets.find((a) => a.id === id), [assets]);

  const addItem = (fields: Partial<BoardItem> & Pick<BoardItem, "kind" | "x" | "y" | "w" | "h">) => {
    const item: BoardItem = {
      id: uid(),
      board_id: board.id,
      rotation: 0,
      z: nextZ(doc.all()),
      asset_id: null,
      data: {},
      updated_at: now(),
      ...fields,
    };
    doc.put(item);
    return item;
  };

  // The upload tool: pick files, read each as Markdown into the Library, and put them on the board as one folder.
  const uploadFolder = async () => {
    const picked = await pickFiles();
    if (!picked.length) return;
    toast(`Reading ${picked.length === 1 ? picked[0].name : `${picked.length} files`}…`);
    const created = await uploadAsMarkdown(picked);
    if (!created.length) return;
    const c = center();
    const it = addItem({
      kind: "folder",
      x: c.x - FOLDER_SIZE.w / 2,
      y: c.y - FOLDER_SIZE.h / 2,
      ...FOLDER_SIZE,
      data: { caption: folderName(created), files: created.map((a) => a.id) },
    });
    setSelection([it.id]);
    toast(`Added ${created.length === 1 ? "1 file" : `${created.length} files`} as Markdown. Double-click the folder to read ${created.length === 1 ? "it" : "them"}.`);
  };

  const addAssets = useCallback(
    (ids: string[], at?: { x: number; y: number }) => {
      const placed = placeAssets(board.id, ids, doc.all(), at);
      doc.put(...placed);
      setSelection(placed.map((p) => p.id));
    },
    [board.id, doc],
  );

  // Dropping files from Explorer onto the board imports them to the Library and places them.
  const dropRef = useRef<(paths: string[], pos: { x: number; y: number }) => void>(() => {});
  dropRef.current = (paths, pos) => {
    void importPaths(paths).then((created) => {
      if (created.length) addAssets(created.map((a) => a.id), toWorld(pos.x, pos.y));
    });
  };
  useEffect(() => {
    if (!isTauri) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
      const un = await getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === "drop") {
          const ratio = window.devicePixelRatio || 1;
          dropRef.current(e.payload.paths, { x: e.payload.position.x / ratio, y: e.payload.position.y / ratio });
        }
      });
      if (cancelled) un();
      else off = un;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  const isLocked = (id: string) => !!doc.get(id)?.data.locked;

  const removeSelection = () => {
    const free = selection.filter((id) => !isLocked(id));
    if (free.length < selection.length) toast("Locked items stay put. Press L to unlock.");
    doc.remove(free);
    setSelection(selection.filter(isLocked));
  };

  const toggleLock = () => {
    const all = selection.map((id) => doc.get(id)).filter((i): i is BoardItem => !!i);
    const lock = all.some((i) => !i.data.locked);
    doc.patch(all.map((i) => ({ id: i.id, changes: { data: { ...i.data, locked: lock || undefined } } })));
  };

  /** A section carries whatever is inside it, and locked items hold still. */
  const movingSet = (ids: string[]) => {
    const moving = new Set(ids.filter((id) => doc.get(id)?.kind !== "connector" && !isLocked(id)));
    for (const id of [...moving]) {
      const it = doc.get(id);
      if (it?.kind === "section") itemsInSection(it, doc.all()).forEach((c) => !c.data.locked && moving.add(c.id));
    }
    return [...moving];
  };

  const nudge = (dx: number, dy: number) => {
    doc.patch(
      movingSet(selection).flatMap((id) => {
        const it = doc.get(id);
        return it ? [{ id, changes: { x: it.x + dx, y: it.y + dy } }] : [];
      }),
    );
  };

  const restack = (toFront: boolean) => {
    const all = doc.all().filter((i) => i.kind !== "connector");
    let z = toFront ? nextZ(doc.all()) : Math.min(...all.map((i) => i.z)) - selection.length;
    doc.patch(selection.map((id) => ({ id, changes: { z: z++ } })));
  };

  const alignSelection = (mode: AlignMode) => {
    const chosen = selection.map((id) => doc.get(id)).filter((i): i is BoardItem => !!i && i.kind !== "connector" && !i.data.locked);
    doc.patch(alignItems(chosen, mode).map((p) => ({ id: p.id, changes: { x: p.x, y: p.y } })));
  };

  const fitSelection = () => {
    const chosen = selection.map((id) => doc.get(id)).filter((i): i is BoardItem => !!i);
    if (chosen.length) setView(fitView(chosen, size.w, size.h));
  };

  const addSticker = (text: string, emoji: boolean) => {
    const box = stickerBox(text, { emoji });
    const c = center();
    const it = addItem({ kind: "sticker", x: c.x - box.w / 2, y: c.y - box.h / 2, ...box, rotation: emoji ? 0 : -4, data: { text, ...(emoji ? { emoji: true } : {}) } });
    setSelection([it.id]);
    setMenu(null);
  };

  const addPictureSticker = (s: PictureSticker) => {
    const data = { text: s.name, emoji: true, picture: s.src, ratio: s.ratio };
    const box = stickerBox(s.name, data);
    const c = center();
    const it = addItem({ kind: "sticker", x: c.x - box.w / 2, y: c.y - box.h / 2, ...box, rotation: 0, data });
    setSelection([it.id]);
    setMenu(null);
  };

  /** Each file becomes a sticker you keep. The first one goes straight onto the board. */
  const uploadStickers = async (files: File[]) => {
    const made: PictureSticker[] = [];
    const refused: string[] = [];
    for (const file of files) {
      try {
        made.push(await readStickerFile(file));
      } catch (e) {
        refused.push(`${file.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    // One message for all of them, as a second toast would replace the first.
    if (refused.length) toast(refused.join(" "), "error");
    if (!made.length) return;
    setSetting("picture_stickers", JSON.stringify([...made, ...pictureStickers].slice(0, MAX_PICTURE_STICKERS)));
    addPictureSticker(made[0]);
  };

  const addNote = (x: number, y: number, text?: string) =>
    addItem({ kind: "sticky", x: x - 90, y: y - 60, w: 190, h: 124, rotation: -1, data: { ...parseStickyStyle(stickyStyle), ...(text ? { text } : {}) } });

  /** Changes an item's look, and remembers a sticky's look for the next one. */
  const styleItem = (it: BoardItem, changes: Partial<BoardItem["data"]>) => {
    const data = { ...it.data, ...changes };
    const fields: Partial<BoardItem> = { data };
    if (it.kind === "sticker" && "textSize" in changes) Object.assign(fields, stickerBox(data.text ?? "", data));
    doc.patch([{ id: it.id, changes: fields }]);
    if (it.kind === "sticky") {
      setSetting("sticky_style", JSON.stringify({ color: data.color, font: data.font, textSize: data.textSize }));
    }
  };

  const duplicateSelection = () => {
    const z = nextZ(doc.all());
    const copies = selection
      .map((id) => doc.get(id))
      .filter((i): i is BoardItem => Boolean(i) && i!.kind !== "connector")
      .map((i, n) => ({ ...i, id: uid(), x: i.x + 24, y: i.y + 24, z: z + n, data: { ...i.data, locked: undefined } }));
    doc.put(...copies);
    setSelection(copies.map((c) => c.id));
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // A slider, colour or checkbox takes no typing, so having just used one mustn't kill the shortcuts.
      const typesNothing = t.tagName === "INPUT" && ["range", "color", "checkbox"].includes((t as HTMLInputElement).type);
      if (!typesNothing && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const arrow = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
      if (arrow && selection.length && !ctrl) {
        e.preventDefault();
        const step = snapOn ? GRID : e.shiftKey ? 10 : 1;
        nudge(arrow[0] * step, arrow[1] * step);
        return;
      }
      if (e.shiftKey && e.code === "Digit1") {
        e.preventDefault();
        setView(fitView(items, size.w, size.h));
        return;
      }
      if (e.shiftKey && e.code === "Digit2") {
        e.preventDefault();
        fitSelection();
        return;
      }
      if (!ctrl && selection.length && (key === "[" || key === "]")) {
        restack(key === "]");
        return;
      }
      if (!ctrl && selection.length && key === "l") {
        toggleLock();
        return;
      }
      // P pins what the selected cards stand for: their sources, or the board itself for notes and drawings.
      if (!ctrl && !e.shiftKey && selection.length && key === "p") {
        e.preventDefault();
        const ids = [...new Set(selection.map((id) => doc.get(id)?.asset_id ?? board.id).filter((x): x is string => !!x))];
        const plan = parsePlan(useStore.getState().config.pack_plan);
        const pin = !ids.every((id) => plan.pinned.includes(id));
        updatePlan((p) => ids.reduce((acc, id) => setPinned(setIncluded(acc, [id], true), id, pin), p));
        toast(pin ? `Pinned ${ids.length === 1 ? "it" : ids.length} in the pack.` : "Unpinned.", "info");
        return;
      }
      if (ctrl && key === "n") {
        e.preventDefault();
        const c = center();
        const it = addNote(c.x, c.y);
        setSelection([it.id]);
        setEditing(it.id);
        return;
      }
      if (!ctrl && key === "g") {
        setSetting("canvas_snap", snapOn ? "" : "1");
        toast(snapOn ? "Snap to grid off" : "Snap to grid on");
        return;
      }
      if (ctrl && key === "z") {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else doc.undo();
      } else if (ctrl && key === "y") {
        e.preventDefault();
        doc.redo();
      } else if (ctrl && key === "d") {
        e.preventDefault();
        duplicateSelection();
      } else if (ctrl && key === "a") {
        e.preventDefault();
        setSelection(doc.all().filter((i) => i.kind !== "connector").map((i) => i.id));
      } else if (key === "delete" || key === "backspace") {
        removeSelection();
      } else if (key === "escape") {
        setSelection([]);
        setCropping(null);
        setTool("select");
      } else if (!ctrl) {
        const match = TOOLS.find((x) => x.key.toLowerCase() === key);
        if (match) chooseTool(match.tool);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  // Cards asked for from elsewhere (a claim made in the Reader panel), placed in the middle of the view.
  useEffect(() => {
    const place = (e: Event) => {
      const r = (e as CustomEvent<PlaceRequest>).detail;
      if (r.boardId !== board.id) return;
      const c = center();
      const it = r.claim
        ? addItem({ kind: "sticky", x: c.x - 165, y: c.y - 75, w: 330, h: 150, data: { claim: r.claim, text: r.text } })
        : addItem({ kind: "image", x: c.x - 140, y: c.y - 80, w: 280, h: 160, asset_id: r.asset_id ?? null });
      setSelection([it.id]);
    };
    window.addEventListener(PLACE_EVENT, place);
    return () => window.removeEventListener(PLACE_EVENT, place);
  });

  // Copy and paste, including pictures and text from other apps.
  useEffect(() => {
    const typing = () => {
      const t = document.activeElement as HTMLElement | null;
      return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
    };
    const copy = (e: ClipboardEvent) => {
      if (typing() || !selection.length || !e.clipboardData) return;
      const chosen = selection.map((id) => doc.get(id)).filter((i): i is BoardItem => !!i && i.kind !== "connector");
      if (!chosen.length) return;
      e.preventDefault();
      e.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(chosen));
      e.clipboardData.setData("text/plain", chosen.map((i) => i.data.text ?? "").filter(Boolean).join("\n"));
    };
    const paste = (e: ClipboardEvent) => {
      if (typing() || !e.clipboardData) return;
      const c = center();
      const items = parseClipboardItems(e.clipboardData.getData(CLIPBOARD_TYPE));
      if (e.clipboardData.getData(CLIPBOARD_TYPE)) {
        e.preventDefault();
        if (!items.length) return;
        const left = Math.min(...items.map((i) => i.x));
        const top = Math.min(...items.map((i) => i.y));
        const z = nextZ(doc.all());
        const copies = items.map((i, n) => ({ ...i, id: uid(), board_id: board.id, x: c.x + i.x - left, y: c.y + i.y - top, z: z + n, data: { ...i.data, locked: undefined } }));
        doc.put(...copies);
        setSelection(copies.map((i) => i.id));
        return;
      }
      const picture = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
      if (picture) {
        e.preventDefault();
        // Kept as a drawing, as turning it into pixels would lose what makes it an SVG.
        if (picture.type === "image/svg+xml") void picture.text().then((markup) => pasteSvg(markup, c));
        else void pastePicture(picture, c);
        return;
      }
      const text = e.clipboardData.getData("text/plain").trim();
      if (isSvgMarkup(text)) {
        e.preventDefault();
        void pasteSvg(text, c);
        return;
      }
      // A link becomes a source card, saved to the Library with the site as its credit.
      if (isWebAddress(text)) {
        e.preventDefault();
        const saved = saveLink(text);
        if (!saved) return;
        const it = addItem({ kind: "image", asset_id: saved.asset.id, x: c.x - 140, y: c.y - 80, w: 280, h: 160 });
        setSelection([it.id]);
        toast(saved.existed ? "Already in the Library, so this card shows that source." : `Saved to the Library, credited to ${saved.asset.credit}.`);
        return;
      }
      if (text) {
        e.preventDefault();
        const it = addNote(c.x, c.y, text.slice(0, 4000));
        setSelection([it.id]);
      }
    };
    window.addEventListener("copy", copy);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("copy", copy);
      window.removeEventListener("paste", paste);
    };
  });

  const pasteSvg = async (markup: string, at: { x: number; y: number }) => {
    if (!isSvgMarkup(markup)) {
      toast("That file isn't a valid SVG.", "error");
      return;
    }
    try {
      const info = svgInfo(markup);
      let path: string | null = null;
      let preview: string | null = null;
      if (isTauri) path = (await native.storeSvg(new TextEncoder().encode(markup))).file_path;
      else preview = `${URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }))}#svg`;
      const asset = newAsset({
        kind: "image",
        title: info.title || "Pasted SVG",
        file_path: path,
        preview,
        width: info.width,
        height: info.height,
        credit: info.creator || null,
      });
      useStore.getState().putAsset(asset);
      void fillPalette(asset);
      const { w, h } = boardSize(info.width, info.height);
      const it = addItem({ kind: "image", asset_id: asset.id, x: at.x - w / 2, y: at.y - h / 2, w, h });
      setSelection([it.id]);
      toast(info.creator ? `Pasted, credited to ${info.creator}.` : "Pasted. It has no source yet, so add a credit in the Library.");
    } catch (e) {
      toast(`Couldn't paste that SVG: ${e}`, "error");
    }
  };

  const pastePicture = async (picture: File, at: { x: number; y: number }) => {
    try {
      const url = URL.createObjectURL(picture);
      const image = new Image();
      image.src = url;
      await image.decode();
      const { naturalWidth: w, naturalHeight: h } = image;
      let path: string | null = null;
      if (isTauri) {
        // Clipboards hold many formats, so it's stored as a PNG whatever it came as.
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!png) throw new Error("the picture couldn't be read");
        path = (await native.storeSnip(new Uint8Array(await png.arrayBuffer()))).file_path;
        URL.revokeObjectURL(url);
      }
      const asset = newAsset({ kind: "image", title: "Pasted image", file_path: path, preview: path ? null : url, width: w, height: h });
      useStore.getState().putAsset(asset);
      void fillPalette(asset);
      const scale = Math.min(1, 360 / Math.max(w, h));
      const it = addItem({ kind: "image", asset_id: asset.id, x: at.x - (w * scale) / 2, y: at.y - (h * scale) / 2, w: w * scale, h: h * scale });
      setSelection([it.id]);
      toast("Pasted. It has no source yet, so add a credit in the Library.");
    } catch (e) {
      toast(`Couldn't paste that picture: ${e}`, "error");
    }
  };

  /** Removes whatever drawings this point touches. Locked ones, and everything that isn't a drawing, are safe. */
  /** Replaces the selected handwriting with typed text in the same place. One undo brings the writing back. */
  const handwritingToText = async () => {
    const chosen = selection.map((id) => doc.get(id)).filter((i): i is BoardItem => !!i);
    const strokes = writtenStrokes(chosen);
    if (!strokes.length) return;
    if (!isTauri) {
      toast("Reading handwriting works in the desktop app.");
      return;
    }
    try {
      const text = await readHandwriting(strokes);
      if (!text) {
        toast("Couldn't make out any words. Try writing a little larger, or select just the writing.");
        return;
      }
      const box = writingBox(strokes.map(strokePoints));
      doc.checkpoint();
      doc.remove(strokes.map((s) => s.id));
      const it = addItem({ kind: "text", x: box.x, y: box.y, w: Math.max(200, box.w), h: Math.max(40, box.h), data: { text } });
      setSelection([it.id]);
      toast(`Read as "${text.length > 60 ? `${text.slice(0, 60)}…` : text}". Press Ctrl Z to bring your writing back.`);
    } catch (e) {
      toast(String(e), "error");
    }
  };

  /** Reads handwritten math as a formula in the same place. Double-click it to fix the LaTeX, or Ctrl Z brings the writing back. */
  const handwritingToLatex = async () => {
    const chosen = selection.map((id) => doc.get(id)).filter((i): i is BoardItem => !!i);
    const strokes = writtenStrokes(chosen);
    if (!strokes.length) return;
    toast("Reading the formula…");
    try {
      const { readMathHandwriting } = await import("./handwritingMath");
      const latex = await readMathHandwriting(strokes);
      if (!latex) {
        toast("Couldn't make out a formula. Try writing a little larger.");
        return;
      }
      const box = writingBox(strokes.map(strokePoints));
      doc.checkpoint();
      doc.remove(strokes.map((s) => s.id));
      const it = addItem({ kind: "text", x: box.x, y: box.y, w: Math.max(240, box.w), h: Math.max(60, box.h), data: { text: `$$${latex}$$` } });
      setSelection([it.id]);
      toast("Check it: handwriting is hard to read. Double-click to fix the LaTeX, or press Ctrl Z to bring your writing back.");
    } catch (e) {
      toast(`Couldn't read that formula: ${e}`, "error");
    }
  };

  const eraseAt = (p: Pt) => {
    const radius = 6 / view.zoom;
    const samples = pathSamples(lastErase.current ?? p, p, radius);
    lastErase.current = p;
    const hit = doc.all().filter((i) => isDrawn(i) && !i.data.locked && samples.some((s) => hitsDrawing(i, s, radius)));
    if (hit.length) doc.remove(hit.map((i) => i.id));
  };

  const chooseTool = (next: Tool) => {
    if (isDrawTool(next) || next === "eraser") {
      setSelection([]);
      setMenu(null);
    }
    if (next === "image") setDialog("image");
    else if (next === "upload") void uploadFolder();
    else if (next === "sticker") setMenu((m) => (m === "sticker" ? null : "sticker"));
    else setTool(next);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && scrollsInside(e.target, viewport.current)) return;
    const r = viewport.current!.getBoundingClientRect();
    // As in FigJam: scroll and pinch both zoom around the pointer. Shift+scroll pans sideways,
    // and a sideways touchpad swipe still pans.
    const zoom = e.ctrlKey || e.metaKey || (!e.shiftKey && e.deltaX === 0);
    if (zoom) {
      // Line-mode wheels (Firefox) report a few lines rather than pixels.
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // A touchpad pinch arrives as Ctrl+wheel in small, fractional steps; a mouse notch is about 100.
      // Pinch steps get more weight, so the board follows the fingers.
      const pinch = e.ctrlKey && Math.abs(dy) < 40;
      const step = Math.max(-150, Math.min(150, dy));
      setView((v) => zoomAt(v, e.clientX - r.left, e.clientY - r.top, Math.exp(-step * (pinch ? 0.012 : 0.0022))));
    } else if (e.shiftKey && e.deltaX === 0) {
      setView((v) => ({ ...v, x: v.x - e.deltaY }));
    } else {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  // Two fingers on a touchscreen pinch-zoom and pan together, whatever tool is in hand.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; mx: number; my: number; view: View } | null>(null);
  const pinchState = () => {
    const [a, b] = [...touches.current.values()];
    const r = viewport.current!.getBoundingClientRect();
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
  };
  const onTouchPointer = (e: React.PointerEvent, phase: "down" | "move" | "up") => {
    if (e.pointerType !== "touch") return false;
    if (phase === "up") touches.current.delete(e.pointerId);
    else if (phase === "down" || touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (phase === "down" && touches.current.size === 2) {
      // The second finger turns whatever the first one started into a pinch.
      drawnPoints.current = [];
      previewPath.current?.setAttribute("d", "");
      setGesture(null);
      setShapeDraft(null);
      setOffset({ dx: 0, dy: 0 });
      setGuides([]);
      setMarquee(null);
      setRubber(null);
      setResizing(null);
      viewport.current!.setPointerCapture(e.pointerId);
      pinchStart.current = { ...pinchState(), view };
      return true;
    }
    if (!pinchStart.current) return false;
    if (phase === "move" && touches.current.size >= 2) {
      const start = pinchStart.current;
      const now = pinchState();
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, start.view.zoom * (now.dist / start.dist)));
      // The board point under the fingers' starting midpoint stays under their midpoint now.
      const wx = (start.mx - start.view.x) / start.view.zoom;
      const wy = (start.my - start.view.y) / start.view.zoom;
      setView({ zoom: z, x: now.mx - wx * z, y: now.my - wy * z });
    }
    if (phase === "up" && touches.current.size < 2) pinchStart.current = null;
    return true;
  };

  // React attaches wheel listeners as passive, so this stops page zoom and scroll behind the board.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const stop = (e: WheelEvent) => {
      if (e.ctrlKey || !scrollsInside(e.target, el)) e.preventDefault();
    };
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const itemAt = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.("[data-item]")?.getAttribute("data-item") ?? null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-ui]")) return;
    if (onTouchPointer(e, "down")) return;
    // Blur explicitly: unmounting a focused textarea wouldn't fire onBlur, losing what was typed.
    if (editing) {
      (document.activeElement as HTMLElement | null)?.blur();
      setEditing(null);
    }
    // Pressing on the board takes focus back from any control, as pointer capture alone doesn't.
    const focused = document.activeElement as HTMLElement | null;
    if (focused && focused !== document.body) focused.blur();
    viewport.current!.setPointerCapture(e.pointerId);
    const world = toWorld(e.clientX, e.clientY);

    if (e.button === 1 || tool === "hand" || spaceDown) {
      setGesture({ kind: "pan", x: e.clientX, y: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    // The far end of a stylus is an eraser, whatever tool is in hand.
    const penEraser = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) !== 0);
    if (tool === "eraser" || penEraser) {
      setGesture({ kind: "erase" });
      lastErase.current = null;
      // One swipe of the eraser is one undo, however many strokes it took out.
      doc.checkpoint();
      eraseAt([world.x, world.y]);
      return;
    }
    if (tool === "pencil" || tool === "marker") {
      drawnPoints.current = [[world.x, world.y, pressureFrom(e.pressure, e.pointerType === "pen", 0, 0.5)]];
      paintPreview(tool);
      setGesture({ kind: "draw", tool });
      return;
    }
    if (tool === "shape") {
      const figure = drawStyles.shape.figure ?? "rect";
      setGesture({ kind: "shape", x: world.x, y: world.y });
      setShapeDraft(shapeBox([world.x, world.y], [world.x + 1, world.y + 1], figure));
      return;
    }
    const handle = target.getAttribute("data-handle");
    if (handle && selection.length === 1) {
      const orig = doc.get(selection[0]);
      if (orig && !orig.data.locked) {
        setGesture({ kind: "resize", x: e.clientX, y: e.clientY, id: orig.id, handle, orig });
        setResizing(orig);
      }
      return;
    }
    if (tool === "sticky") {
      const it = addNote(world.x, world.y);
      setSelection([it.id]);
      setEditing(it.id);
      setTool("select");
      return;
    }
    if (tool === "text") {
      const it = addItem({ kind: "text", x: world.x, y: world.y - 16, w: 260, h: 60 });
      setSelection([it.id]);
      setEditing(it.id);
      setTool("select");
      return;
    }
    const hit = itemAt(target);
    if (tool === "connector") {
      if (hit && doc.get(hit)?.kind !== "connector") {
        setGesture({ kind: "connect", from: hit });
        setRubber(world);
      }
      return;
    }
    if (hit) {
      if (cropping === hit) {
        const it = doc.get(hit)!;
        setGesture({ kind: "focus", x: e.clientX, y: e.clientY, id: hit, fx: it.data.focusX ?? 50, fy: it.data.focusY ?? 50 });
        return;
      }
      setCropping(null);
      const next = e.shiftKey
        ? selection.includes(hit)
          ? selection.filter((id) => id !== hit)
          : [...selection, hit]
        : selection.includes(hit)
          ? selection
          : [hit];
      setSelection(next);
      setMenu(null);
      const moving = movingSet(next);
      if (moving.length) setGesture({ kind: "drag", x: e.clientX, y: e.clientY, ids: moving, moved: false });
      return;
    }
    setCropping(null);
    setMenu(null);
    if (!e.shiftKey) setSelection([]);
    setGesture({ kind: "marquee", x: world.x, y: world.y, additive: e.shiftKey });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (onTouchPointer(e, "move")) return;
    if (!gesture) return;
    switch (gesture.kind) {
      case "draw": {
        // Coalesced events carry the points the screen skipped, which is what keeps fast curves smooth.
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const list = drawnPoints.current;
        for (const ev of events.length ? events : [e.nativeEvent]) {
          const p = toWorld(ev.clientX, ev.clientY);
          const last = list[list.length - 1];
          const moved = Math.hypot(p.x - last[0], p.y - last[1]) * view.zoom;
          if (e.shiftKey) {
            const end = constrain([list[0][0], list[0][1]], [p.x, p.y], "stroke");
            list.length = 1;
            list.push([end[0], end[1], list[0][2]]);
          } else {
            list.push([p.x, p.y, pressureFrom(ev.pressure, ev.pointerType === "pen", moved, last[2])]);
          }
        }
        paintPreview(gesture.tool);
        break;
      }
      case "shape": {
        const figure = drawStyles.shape.figure ?? "rect";
        const p = toWorld(e.clientX, e.clientY);
        const from: Pt = [gesture.x, gesture.y];
        let to: Pt = [p.x, p.y];
        if (e.shiftKey) to = constrain(from, to, figure);
        if (snapOn && !e.altKey) to = [snapTo(to[0]), snapTo(to[1])];
        setShapeDraft(shapeBox(from, to, figure));
        break;
      }
      case "erase": {
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
        for (const ev of events.length ? events : [e.nativeEvent]) {
          const p = toWorld(ev.clientX, ev.clientY);
          eraseAt([p.x, p.y]);
        }
        break;
      }
      case "pan":
        setView((v) => ({ ...v, x: gesture.vx + e.clientX - gesture.x, y: gesture.vy + e.clientY - gesture.y }));
        break;
      case "drag": {
        let dx = (e.clientX - gesture.x) / view.zoom;
        let dy = (e.clientY - gesture.y) / view.zoom;
        const lead = doc.get(gesture.ids[0]);
        // The first item lands on the grid, and the rest keep their places relative to it.
        if (snapOn && !e.altKey && lead) {
          dx = snapTo(lead.x + dx) - lead.x;
          dy = snapTo(lead.y + dy) - lead.y;
        }
        // Then onto other items' edges and centres, which beats the grid when one is close.
        let shown: Guide[] = [];
        if (!e.altKey) {
          const moving = gesture.ids.map((id) => doc.get(id)).filter((i): i is BoardItem => !!i);
          if (moving.length) {
            const x0 = Math.min(...moving.map((i) => i.x)) + dx;
            const y0 = Math.min(...moving.map((i) => i.y)) + dy;
            const box = { x: x0, y: y0, w: Math.max(...moving.map((i) => i.x + i.w)) + dx - x0, h: Math.max(...moving.map((i) => i.y + i.h)) + dy - y0 };
            const reach = 1200 / view.zoom;
            const others = items.filter(
              (i) => !gesture.ids.includes(i.id) && i.kind !== "connector" && i.kind !== "stroke" && Math.abs(i.x - box.x) < reach && Math.abs(i.y - box.y) < reach,
            );
            const snapped = smartSnap(box, others, 6 / view.zoom);
            dx += snapped.dx;
            dy += snapped.dy;
            shown = snapped.guides;
          }
        }
        setGuides(shown);
        setOffset({ dx, dy });
        break;
      }
      case "resize": {
        const dx = (e.clientX - gesture.x) / view.zoom;
        const dy = (e.clientY - gesture.y) / view.zoom;
        const o = gesture.orig;
        const left = gesture.handle.includes("w");
        const top = gesture.handle.includes("n");
        const snap = (v: number) => (snapOn && !e.altKey ? snapTo(v) : v);
        // A drawing can be as small as you like, and a straight line has no height at all.
        const least = isDrawn(o) ? 1 : 0;
        const w = Math.max(least || 40, snap(o.w + (left ? -dx : dx)));
        const h = Math.max(least || 30, snap(o.h + (top ? -dy : dy)));
        setResizing({ ...o, w, h, x: left ? o.x + o.w - w : o.x, y: top ? o.y + o.h - h : o.y });
        break;
      }
      case "marquee": {
        const p = toWorld(e.clientX, e.clientY);
        setMarquee({ x: Math.min(p.x, gesture.x), y: Math.min(p.y, gesture.y), w: Math.abs(p.x - gesture.x), h: Math.abs(p.y - gesture.y) });
        break;
      }
      case "connect":
        setRubber(toWorld(e.clientX, e.clientY));
        break;
      case "focus": {
        const it = doc.get(gesture.id);
        if (!it) break;
        // Dragging the picture moves its focus point the opposite way.
        const fx = Math.max(0, Math.min(100, gesture.fx - ((e.clientX - gesture.x) / (it.w * view.zoom)) * 100));
        const fy = Math.max(0, Math.min(100, gesture.fy - ((e.clientY - gesture.y) / (it.h * view.zoom)) * 100));
        doc.patch([{ id: it.id, changes: { data: { ...it.data, focusX: fx, focusY: fy } } }]);
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (onTouchPointer(e, "up")) return;
    if (!gesture) return;
    if (gesture.kind === "draw") {
      const style = drawStyles[gesture.tool];
      // Each stroke is its own undo, however fast the next one follows.
      doc.checkpoint();
      const kept = simplify(drawnPoints.current, 0.35 / view.zoom);
      const stroke = strokeFrom(kept);
      addItem({
        kind: "stroke",
        x: stroke.x,
        y: stroke.y,
        w: stroke.w,
        h: stroke.h,
        data: { points: stroke.points, pressure: kept.map((p) => p[2]), vw: stroke.w, vh: stroke.h, color: style.color, width: style.width, opacity: style.opacity, dash: style.dash, feel: style.feel },
      });
      drawnPoints.current = [];
      previewPath.current?.setAttribute("d", "");
    } else if (gesture.kind === "shape" && shapeDraft) {
      const style = drawStyles.shape;
      const { x, y, w, h, flipX, flipY } = shapeDraft;
      doc.checkpoint();
      const it = addItem({ kind: "shape", x, y, w, h, data: { figure: style.figure, color: style.color, width: style.width, opacity: style.opacity, dash: style.dash, fill: style.fill, sketchy: style.sketchy, flipX, flipY } });
      setShapeDraft(null);
      setSelection([it.id]);
      setTool("select");
    } else if (gesture.kind === "drag" && document.elementFromPoint(e.clientX, e.clientY)?.closest(".packtray")) {
      // Dropped on the pack tray: what the cards stand for goes in the pack, and the cards stay put.
      const ids = [...new Set(gesture.ids.map((id) => doc.get(id)).flatMap((it) => (it ? [it.asset_id ?? it.data.claim ?? board.id] : [])))];
      updatePlan((p) => setIncluded(p, ids, true));
      toast(`Added ${ids.length === 1 ? "it" : ids.length} to the pack.`, "info");
    } else if (gesture.kind === "drag" && (offset.dx || offset.dy)) {
      doc.patch(
        gesture.ids.flatMap((id) => {
          const it = doc.get(id);
          return it ? [{ id, changes: { x: it.x + offset.dx, y: it.y + offset.dy } }] : [];
        }),
      );
    } else if (gesture.kind === "resize" && resizing) {
      doc.patch([{ id: resizing.id, changes: { x: resizing.x, y: resizing.y, w: resizing.w, h: resizing.h } }]);
    } else if (gesture.kind === "marquee" && marquee) {
      const inside = doc.all().filter((i) => i.kind !== "connector" && i.kind !== "section" && inRect(i, marquee)).map((i) => i.id);
      setSelection((cur) => (gesture.additive ? [...new Set([...cur, ...inside])] : inside));
    } else if (gesture.kind === "connect") {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const to = itemAt(under);
      if (to && to !== gesture.from && doc.get(to)?.kind !== "connector") {
        const it = addItem({ kind: "connector", x: 0, y: 0, w: 0, h: 0, data: { from: gesture.from, to, connector: "plain" } });
        setSelection([it.id]);
      }
      setTool("select");
    }
    setGesture(null);
    setOffset({ dx: 0, dy: 0 });
    setGuides([]);
    setMarquee(null);
    setRubber(null);
    setResizing(null);
  };

  const dragIds = gesture?.kind === "drag" ? gesture.ids : null;
  const dragging = useMemo(() => (dragIds ? new Set(dragIds) : null), [dragIds]);
  const placed = useCallback(
    (it: BoardItem): BoardItem => {
      if (resizing?.id === it.id) return resizing;
      if (dragging?.has(it.id)) return { ...it, x: it.x + offset.dx, y: it.y + offset.dy };
      return it;
    },
    [resizing, dragging, offset],
  );

  // Only what's on screen is in the DOM, which is what keeps 3,000-image boards usable.
  const shown = useMemo(
    () => visibleItems(items, view, size.w, size.h, selection).map(placed).sort((a, b) => a.z - b.z),
    [items, view, size, selection, placed],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, placed(i)])), [items, placed]);
  const connectors = items.filter((i) => i.kind === "connector");
  const single = selection.length === 1 ? byId.get(selection[0]) : undefined;
  const singleAsset = single?.kind === "image" ? assetOf(single.asset_id) : undefined;

  const screen = (it: BoardItem) => ({
    left: view.x + it.x * view.zoom,
    top: view.y + it.y * view.zoom,
    right: view.x + (it.x + it.w) * view.zoom,
    bottom: view.y + (it.y + it.h) * view.zoom,
  });

  const bounds = useMemo(() => {
    const solid = items.filter((i) => i.kind !== "connector");
    if (!solid.length) return null;
    const x0 = Math.min(...solid.map((i) => i.x));
    const y0 = Math.min(...solid.map((i) => i.y));
    const x1 = Math.max(...solid.map((i) => i.x + i.w));
    const y1 = Math.max(...solid.map((i) => i.y + i.h));
    return { x0, y0, w: x1 - x0 || 1, h: y1 - y0 || 1 };
  }, [items]);
  const miniScale = bounds ? Math.min(132 / bounds.w, 72 / bounds.h) : 1;

  return (
    <main className={`canvas tool-${tool} ${spaceDown || gesture?.kind === "pan" ? "panning" : ""}`} aria-label="Canvas">
      <div
        ref={viewport}
        className="viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        // Without this, the browser's default focus change would blur a freshly opened note.
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("[data-ui]")) e.preventDefault();
        }}
        onDoubleClick={(e) => {
          // The viewport holds pointer capture, so e.target is always the viewport itself.
          const hit = itemAt(document.elementFromPoint(e.clientX, e.clientY));
          const it = hit ? doc.get(hit) : null;
          const closedShape = it?.kind === "shape" && it.data.figure !== "line" && it.data.figure !== "arrow";
          if (it?.kind === "folder") {
            setOpenFolder(it.id);
            return;
          }
          if (it && !it.data.locked && !it.data.emoji && (closedShape || ["sticky", "text", "section", "sticker"].includes(it.kind))) setEditing(it.id);
        }}
      >
        {mat ? (
          <CuttingMat view={view} mat={MATS[mat]} />
        ) : gridStyle === "lines" ? (
          <div
            className="line-grid"
            aria-hidden="true"
            style={{ backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
          />
        ) : gridStyle === "none" ? null : (
          <DotGrid view={view} />
        )}
        <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {/* What's being drawn, above everything until it's finished. */}
          <svg className="draw-preview" width="1" height="1" aria-hidden="true">
            {(gesture?.kind === "draw" || tool === "pencil" || tool === "marker") && (
              <path
                ref={previewPath}
                {...(() => {
                  const look = drawStyles[gesture?.kind === "draw" ? gesture.tool : tool === "marker" ? "marker" : "pencil"];
                  return look.feel === "natural" && look.dash === "solid" ? { fill: look.color ?? "var(--c-text)", fillOpacity: look.opacity } : strokeProps(look);
                })()}
              />
            )}
            {shapeDraft && (
              <g transform={`translate(${shapeDraft.x} ${shapeDraft.y})`}>
                <path
                  d={figurePath(drawStyles.shape.figure ?? "rect", shapeDraft.w, shapeDraft.h, shapeDraft.flipX, shapeDraft.flipY)}
                  {...strokeProps(drawStyles.shape)}
                  fill={drawStyles.shape.fill ?? "none"}
                />
              </g>
            )}
          </svg>
          <svg className="links" width="1" height="1">
            {guides.map((g, i) =>
              g.axis === "x" ? (
                <line key={i} className="guide" x1={g.at} x2={g.at} y1={g.from} y2={g.to} style={{ strokeWidth: 1 / view.zoom }} />
              ) : (
                <line key={i} className="guide" x1={g.from} x2={g.to} y1={g.at} y2={g.at} style={{ strokeWidth: 1 / view.zoom }} />
              ),
            )}
            {connectors.map((c) => {
              const a = byId.get(c.data.from ?? "");
              const b = byId.get(c.data.to ?? "");
              if (!a || !b) return null;
              const { d, head } = connectorShape(a, b, c.data.look);
              const type = c.data.connector ?? "plain";
              const sel = selection.includes(c.id) ? "sel" : "";
              return (
                <g key={c.id} data-item={c.id} data-look={c.data.look ?? "curve"}>
                  <path d={d} className="link-hit" />
                  <path d={d} className={`link link-${type} ${sel}`} />
                  {head && <path d={head} className={`link link-${type} link-head ${sel}`} />}
                </g>
              );
            })}
            {gesture?.kind === "connect" && rubber && byId.get(gesture.from) && (
              <path className="link sel" d={connectorPath(byId.get(gesture.from)!, { x: rubber.x, y: rubber.y, w: 0, h: 0 })} />
            )}
          </svg>
          {shown
            .filter((i) => i.kind !== "connector")
            .map((it) => {
              const asset = assetOf(it.asset_id);
              const sel = selection.includes(it.id);
              const style: React.CSSProperties = {
                left: it.x,
                top: it.y,
                width: it.w,
                height: it.kind === "text" || it.kind === "palette" ? undefined : it.h,
                minHeight: it.kind === "text" || it.kind === "palette" ? it.h : undefined,
                zIndex: it.kind === "section" ? 0 : it.z + 1,
                transform: it.rotation ? `rotate(${it.rotation}deg)` : undefined,
              };
              const common = { "data-testid": `item-${it.kind}`, style };
              if (it.kind === "section") {
                const count = itemsInSection(it, items).length;
                return (
                  <div key={it.id} className={`section ${sel ? "sel" : ""}`} {...common}>
                    <div className="section-label" data-item={it.id}>
                      {editing === it.id ? (
                        <input
                          autoFocus
                          data-ui
                          className="section-input fr"
                          aria-label="Section name"
                          defaultValue={it.data.text}
                          onBlur={(e) => {
                            doc.patch([{ id: it.id, changes: { data: { ...it.data, text: e.target.value } } }]);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        />
                      ) : (
                        <span className="fr">{it.data.text}</span>
                      )}
                      <span className="cap">{count}</span>
                    </div>
                  </div>
                );
              }
              if (it.kind === "stroke") return <StrokeItem key={it.id} it={it} selected={sel} style={style} />;
              if (it.kind === "shape") {
                return (
                  <ShapeItem
                    key={it.id}
                    it={it}
                    selected={sel}
                    style={style}
                    editing={editing === it.id}
                    onLabel={(text) => {
                      doc.patch([{ id: it.id, changes: { data: { ...it.data, text: text || undefined } } }]);
                      setEditing(null);
                    }}
                  />
                );
              }
              if (it.kind === "sticky" && it.data.claim) {
                return (
                  <div key={it.id} className={`claim-item ${sel ? "sel" : ""}`} data-item={it.id} {...common} style={style}>
                    <ClaimCard claimId={it.data.claim} fallback={it.data.text ?? ""} />
                  </div>
                );
              }
              if (it.kind === "sticky") {
                const proposal = isProposal(it);
                return (
                  <div key={it.id} className={`sticky ${sel ? "sel" : ""} ${proposal ? "proposed" : ""}`} data-item={it.id} {...common} style={{ ...style, ...itemLook(it) }}>
                    {proposal && (
                      <div className="proposal-bar" data-ui role="group" aria-label={`Proposed by ${it.data.author ?? "Claude"}`}>
                        <span className="proposal-from">From {it.data.author ?? "Claude"}</span>
                        <button type="button" className="proposal-btn accept" onClick={() => doc.patch([{ id: it.id, changes: { data: accepted(it.data) } }])}>
                          Accept
                        </button>
                        <button type="button" className="proposal-btn" onClick={() => doc.remove([it.id])}>
                          Reject
                        </button>
                      </div>
                    )}
                    {editing === it.id ? (
                      <textarea
                        autoFocus
                        data-ui
                        aria-label="Sticky note text"
                        defaultValue={it.data.text}
                        onBlur={(e) => {
                          doc.patch([{ id: it.id, changes: { data: { ...it.data, text: e.target.value } } }]);
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <>
                        <p>{it.data.text ? <MathText text={it.data.text} /> : "Double-click to write"}</p>
                        {it.data.author && !proposal && <span className="cap sticky-author">{it.data.author}</span>}
                      </>
                    )}
                  </div>
                );
              }
              if (it.kind === "text") {
                return (
                  <div key={it.id} className={`text-item fr ${sel ? "sel" : ""}`} data-item={it.id} {...common} style={{ ...style, ...itemLook(it) }}>
                    {editing === it.id ? (
                      <textarea
                        autoFocus
                        data-ui
                        className="fr"
                        aria-label="Text"
                        defaultValue={it.data.text}
                        onBlur={(e) => {
                          if (e.target.value.trim()) doc.patch([{ id: it.id, changes: { data: { ...it.data, text: e.target.value } } }]);
                          else doc.remove([it.id]);
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <MathText text={it.data.text ?? ""} />
                    )}
                  </div>
                );
              }
              if (it.kind === "sticker") {
                return (
                  <div key={it.id} className={`sticker ${it.data.emoji ? "emoji" : ""} ${it.data.picture ? "picture" : ""} ${sel ? "sel" : ""}`} data-item={it.id} {...common} style={{ ...style, ...itemLook(it) }}>
                    {editing === it.id ? (
                      <input
                        autoFocus
                        data-ui
                        className="sticker-input"
                        aria-label="Sticker text"
                        maxLength={40}
                        defaultValue={it.data.text}
                        onBlur={(e) => {
                          const text = e.target.value.trim();
                          if (text) {
                            const data = { ...it.data, text };
                            doc.patch([{ id: it.id, changes: { data, ...stickerBox(text, data) } }]);
                          }
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                      />
                    ) : isStickerPicture(it.data.picture) ? (
                      <img className="sticker-img" src={it.data.picture} alt={it.data.text ?? "Sticker"} draggable={false} />
                    ) : (
                      it.data.text
                    )}
                  </div>
                );
              }
              if (it.kind === "folder") {
                const count = it.data.files?.length ?? 0;
                return (
                  <div key={it.id} className={`folder-item ${sel ? "sel" : ""}`} data-item={it.id} {...common} title="Double-click to open">
                    <span className="folder-glyph">
                      <Icon name="folder" size={72} fill />
                      <span className="folder-badge cap">MD</span>
                    </span>
                    <span className="folder-label">{it.data.caption || "Folder"}</span>
                    <span className="cap">
                      {count} {count === 1 ? "file" : "files"}
                    </span>
                  </div>
                );
              }
              if (it.kind === "palette") {
                return (
                  <div key={it.id} className={`palette-card ${sel ? "sel" : ""}`} data-item={it.id} {...common}>
                    <div className="palette-head">
                      <b>{it.data.caption ?? "Board palette"}</b>
                    </div>
                    <div className="palette-swatches">
                      {(it.data.colors ?? []).map((hex) => (
                        <div key={hex} className="pal-sw">
                          <span style={{ background: hex }} />
                          <span className="cap">{hex.replace("#", "")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              const doc_ = asset && asset.kind !== "image";
              const credited = asset && isCredited(asset);
              // Words, pages and files read as cards; only pictures and media show as pictures.
              if (asset && ["quote", "link", "pdf", "file", "code"].includes(asset.kind) && !asset.preview?.startsWith("data:image")) {
                return (
                  <figure key={it.id} className={`image-item src-item ${sel ? "sel" : ""}`} data-item={it.id} {...common}>
                    <SourceCard asset={asset} />
                  </figure>
                );
              }
              return (
                <figure key={it.id} className={`image-item ${sel ? "sel" : ""} ${cropping === it.id ? "cropping" : ""}`} data-item={it.id} {...common}>
                  <div className={`fx ${doc_ ? "doc" : ""}`}>
                    <AssetImage asset={asset} focus={it.data.focusX !== undefined ? `${it.data.focusX}% ${it.data.focusY}%` : undefined} />
                    {asset && !doc_ && <span className={`dot ${credited ? "" : "as"}`} role="img" aria-label={credited ? "sourced" : "assumption, no source yet"} />}
                  </div>
                  {!doc_ && <ItemCaption item={it} asset={asset} />}
                </figure>
              );
            })}
          {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        </div>

        {/* Selection chrome is drawn in screen space so it stays crisp at any zoom. */}
        {selection.map((id) => {
          const it = byId.get(id);
          if (!it || it.kind === "connector") return null;
          const s = screen(it);
          return <div key={id} className={`sel-box ${doc.get(id)?.data.locked ? "locked" : ""}`} style={{ left: s.left, top: s.top, width: s.right - s.left, height: s.bottom - s.top }} />;
        })}
        {single && ["sticky", "text", "sticker"].includes(single.kind) && !gesture && !editing && (
          <StyleBar
            item={single}
            fonts={customFonts}
            left={Math.max(8, Math.min(size.w - 780, screen(single).left))}
            // Above the item, or below it when there is no room, as it must never cover what it styles.
            top={screen(single).top - 54 >= 70 ? screen(single).top - 54 : screen(single).bottom + 14}
            onData={(changes) => styleItem(single, changes)}
            onTilt={(rotation) => doc.patch([{ id: single.id, changes: { rotation } }])}
            onDuplicate={duplicateSelection}
            onFront={() => restack(true)}
            onBack={() => restack(false)}
            onToggleLock={toggleLock}
            onDelete={removeSelection}
          />
        )}
        {isDrawTool(tool) && (
          <DrawBar
            label={`${tool === "pencil" ? "Pencil" : tool === "marker" ? "Marker" : "Shape"} style`}
            value={drawStyles[tool]}
            showFill={tool === "shape"}
            showFigures={tool === "shape"}
            showFeel={tool === "pencil"}
            showSketchy={tool === "shape"}
            style={{ left: "50%", bottom: 76, transform: "translateX(-50%)" }}
            onChange={(changes) => setDrawStyle(tool, changes)}
          />
        )}
        {single && isDrawn(single) && !gesture && !editing && (
          <DrawBar
            label={`${single.kind === "stroke" ? "Stroke" : "Shape"} style`}
            value={{ color: single.data.color, width: single.data.width ?? 2, opacity: single.data.opacity ?? 1, dash: single.data.dash ?? "solid", fill: single.data.fill, figure: single.data.figure, feel: single.data.feel, sketchy: single.data.sketchy }}
            showFill={single.kind === "shape" && single.data.figure !== "line" && single.data.figure !== "arrow"}
            showFigures={false}
            showFeel={single.kind === "stroke"}
            showSketchy={single.kind === "shape"}
            style={{ left: Math.max(8, Math.min(size.w - 720, screen(single).left)), top: screen(single).top - 54 >= 70 ? screen(single).top - 54 : Math.min(size.h - 130, screen(single).bottom + 14) }}
            onChange={(changes) => doc.patch([{ id: single.id, changes: { data: { ...single.data, ...changes } } }])}
            menu={[
              ...(single.kind === "stroke"
                ? [
                    { label: "Turn into text", onClick: () => void handwritingToText() },
                    { label: "Turn into LaTeX", onClick: () => void handwritingToLatex() },
                  ]
                : []),
              { label: "Duplicate", onClick: duplicateSelection },
              { label: "Bring to front", onClick: () => restack(true) },
              { label: "Send to back", onClick: () => restack(false) },
              { label: single.data.locked ? "Unlock" : "Lock", onClick: toggleLock },
              { label: "Delete", onClick: removeSelection },
            ]}
          />
        )}
        {selection.length > 1 && !gesture && (
          <AlignBar
            left={Math.max(8, size.w / 2 - 170)}
            top={70}
            onAlign={alignSelection}
            onToText={selection.some((id) => doc.get(id)?.kind === "stroke") ? () => void handwritingToText() : undefined}
            onToLatex={selection.some((id) => doc.get(id)?.kind === "stroke") ? () => void handwritingToLatex() : undefined}
          />
        )}
        {single && single.kind === "palette" && !gesture && (
          <PaletteTools
            name={single.data.caption ?? "Board palette"}
            colours={single.data.colors ?? []}
            // Beside the card, never over it: right if there's room, else left, else below.
            left={screen(single).right + 416 <= size.w - 8 ? screen(single).right + 16 : screen(single).left - 416 >= 8 ? screen(single).left - 416 : Math.max(8, Math.min(size.w - 408, screen(single).left))}
            top={
              screen(single).right + 416 <= size.w - 8 || screen(single).left - 416 >= 8
                ? Math.max(70, Math.min(size.h - 380, screen(single).top))
                : Math.min(size.h - 380, screen(single).bottom + 16)
            }
            onColours={(colors) => doc.patch([{ id: single.id, changes: { data: { ...single.data, colors } } }])}
          />
        )}
        {single && single.kind !== "connector" && !editing && !single.data.locked && (
          <>
            {["nw", "ne", "sw", "se"].map((h) => {
              const s = screen(single);
              return (
                <span
                  key={h}
                  data-handle={h}
                  className={`hd hd-${h}`}
                  style={{ left: h.includes("w") ? s.left : s.right, top: h.includes("n") ? s.top : s.bottom }}
                />
              );
            })}
            {single.kind === "image" && (
              <span className="cap dims" style={{ left: (screen(single).left + screen(single).right) / 2, top: screen(single).bottom + 12 }}>
                {Math.round(single.w)} × {Math.round(single.h)}
              </span>
            )}
          </>
        )}

        {singleAsset && single && !gesture && (
          <>
            <div
              className="ctx-bar"
              role="toolbar"
              aria-label="Selection actions"
              data-ui
              style={{ left: Math.max(8, screen(single).left), top: Math.max(70, screen(single).top - 54) }}
            >
              <button type="button" className="ctx" onClick={() => setMenu(menu === "claim" ? null : "claim")}>
                <Icon name="link" size={16} />
                Link claim
              </button>
              <button
                type="button"
                className={`ctx ${cropping === single.id ? "on" : ""}`}
                title="Resize the frame with the corners, and drag the picture to reposition it"
                onClick={() => setCropping(cropping === single.id ? null : single.id)}
              >
                <Icon name="crop" size={16} />
                Crop
              </button>
              <button
                type="button"
                className="ctx"
                aria-label="Pick colours"
                title="Add this image's colours to the board"
                disabled={!singleAsset.palette_lab.length}
                onClick={() => {
                  const it = addItem({
                    kind: "palette",
                    x: single.x + single.w + 24,
                    y: single.y,
                    w: Math.max(240, singleAsset.palette_lab.length * 60 + 32),
                    h: 124,
                    data: { caption: singleAsset.title, colors: singleAsset.palette_lab.map((c) => c.hex) },
                  });
                  setSelection([it.id]);
                }}
              >
                <Icon name="palette" size={16} />
              </button>
              <div className="ctx-anchor">
                <button type="button" className="ctx" aria-label="More" onClick={() => setMenu(menu === "more" ? null : "more")}>
                  <Icon name="more" size={16} />
                </button>
                {menu === "more" && (
                  <Popover className="more-pop" onClose={() => setMenu(null)}>
                    <button type="button" className="palette-row" onClick={duplicateSelection}>Duplicate</button>
                    <button type="button" className="palette-row" onClick={() => restack(true)}>Bring to front</button>
                    <button type="button" className="palette-row" onClick={() => restack(false)}>Send to back</button>
                    <button type="button" className="palette-row" onClick={toggleLock}>{single.data.locked ? "Unlock" : "Lock"}</button>
                    <button
                      type="button"
                      className="palette-row"
                      onClick={() => {
                        const label = singleAsset.provenance === "human" ? "unknown" : "human";
                        updateAsset(singleAsset.id, { provenance: label });
                        setMenu(null);
                      }}
                    >
                      {singleAsset.provenance === "human" ? "Clear human-made flag" : "Flag as human-made"}
                    </button>
                    <button type="button" className="palette-row" onClick={removeSelection}>Remove from board</button>
                  </Popover>
                )}
              </div>
              {menu === "claim" && (
                <ClaimLinker
                  asset={singleAsset}
                  boardId={board.id}
                  onClose={() => setMenu(null)}
                  placed={new Set(items.filter((i) => i.data.claim).map((i) => i.data.claim!))}
                  onPlace={(claimId, text) => {
                    // Beside the card it came from, linked to it, so the evidence reads left to right.
                    const from = single;
                    const x = from ? from.x + from.w + 40 : center().x;
                    const y = from ? from.y : center().y;
                    const card = addItem({ kind: "sticky", x, y, w: 260, h: 150, data: { claim: claimId, text } });
                    if (from) addItem({ kind: "connector", x: 0, y: 0, w: 0, h: 0, data: { from: from.id, to: card.id, connector: "supports" } });
                    setSelection([card.id]);
                  }}
                />
              )}
            </div>
            <ProvenanceCard
              asset={singleAsset}
              style={{
                left: Math.max(8, Math.min(size.w - 300, screen(single).left)),
                top: Math.max(70, Math.min(size.h - 210, screen(single).bottom + 36)),
              }}
            />
          </>
        )}

        {single?.kind === "connector" && (
          <div className="ctx-bar ctx-bar-centred" data-ui role="toolbar" aria-label="Connector type" style={{ top: 70 }}>
            {CONNECTOR_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`ctx ${(single.data.connector ?? "plain") === k ? "on" : ""}`}
                aria-pressed={(single.data.connector ?? "plain") === k}
                onClick={() => doc.patch([{ id: single.id, changes: { data: { ...single.data, connector: k } } }])}
              >
                {k}
              </button>
            ))}
            <span className="ctx-sep" />
            {CONNECTOR_LOOKS.map((look) => (
              <button
                key={look}
                type="button"
                className={`ctx ctx-look ${(single.data.look ?? "curve") === look ? "on" : ""}`}
                aria-label={`Draw it ${look}`}
                aria-pressed={(single.data.look ?? "curve") === look}
                title={look}
                onClick={() => doc.patch([{ id: single.id, changes: { data: { ...single.data, look } } }])}
              >
                <svg width="34" height="18" viewBox="0 -9 34 18" aria-hidden="true">
                  <path d={connectorShape({ x: -40, y: -1, w: 0, h: 2 }, { x: 74, y: -1, w: 0, h: 2 }, look).d} transform="translate(12 0) scale(0.3 0.55)" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div className="canvas-empty">
            <p className="fr">An empty board.</p>
            <p className="cap">Press N for a sticky note, I to add from your Library, or drop files here.</p>
          </div>
        )}

        <div className="board-pill" data-ui>
          {project && (
            <>
              <span className="board-project" title="Project">
                {project.data.name || "Untitled project"}
              </span>
              <span className="board-sep" aria-hidden="true">
                /
              </span>
            </>
          )}
          <button
            type="button"
            className="board-name fr"
            aria-haspopup="menu"
            aria-expanded={menu === "boards"}
            title={project ? `Switch board in ${project.data.name || "this project"}` : "Switch board"}
            onClick={() => setMenu(menu === "boards" ? null : "boards")}
          >
            <span className="board-name-text">{board.name}</span>
            <svg className="board-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {project && siblings.length > 1 && (
            <span className="cap board-count">
              {siblings.findIndex((b) => b.id === board.id) + 1} of {siblings.length}
            </span>
          )}
          <span className="cap version">v{board.version}</span>
          {menu === "boards" && (
            <Popover className="boards-pop" onClose={() => setMenu(null)}>
              <span className="boards-head cap">{project ? `${project.data.name || "Untitled project"} · ${siblings.length} board${siblings.length === 1 ? "" : "s"}` : "All boards"}</span>
              {siblings.map((b) => (
                <Link key={b.id} className={`palette-row ${b.id === board.id ? "on" : ""}`} to={`/board/${b.id}`} onClick={() => setMenu(null)}>
                  <span className="boards-row-name">{b.name || "Untitled board"}</span>
                  {b.id === board.id && <Icon name="check" size={14} />}
                </Link>
              ))}
              <button type="button" className="palette-row boards-new" onClick={() => { setDialog("new"); setMenu(null); }}>
                <span className="boards-row-name">{project ? "New board in this project" : "New board"}</span>
                <Icon name="plus" size={14} />
              </button>
              {others.length > 0 && (
                <>
                  <hr />
                  <span className="boards-head cap">Other projects</span>
                  {others.slice(0, 6).map((b) => (
                    <Link key={b.id} className="palette-row boards-other" to={`/board/${b.id}`} onClick={() => setMenu(null)}>
                      <span className="boards-row-name">{b.name || "Untitled board"}</span>
                    </Link>
                  ))}
                </>
              )}
              <hr />
              <button type="button" className="palette-row" onClick={() => { setDialog("rename"); setMenu(null); }}>Rename this board</button>
              <button type="button" className="palette-row" onClick={() => { setDialog("delete"); setMenu(null); }}>Delete this board</button>
            </Popover>
          )}
        </div>
        <div className="board-actions" data-ui>
          <SendToClaude focus={{ type: "board", id: board.id }} name={board.name} />
          <Link className="pill" to={`/present/${board.id}`}>
            <Icon name="play" size={18} />
            Present
          </Link>
          <Link className="pill ink" to={`/share/${board.id}`}>
            Share
          </Link>
        </div>

        <div className="legend" data-ui>
          <span className="cap"><span className="dot-sourced" /> sourced</span>
          <span className="cap"><span className="dot-guess" /> assumption</span>
        </div>

        <div className="toolbar" role="toolbar" aria-label="Tools" data-ui>
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              type="button"
              className={`tb ${tool === t.tool ? "on" : ""}`}
              aria-label={t.label}
              aria-pressed={tool === t.tool}
              title={`${t.label} (${t.key})`}
              onClick={() => chooseTool(t.tool)}
            >
              <Icon name={t.icon} />
            </button>
          ))}
          {menu === "sticker" && (
            <Popover className="sticker-pop" onClose={() => setMenu(null)}>
              <StickerPicker
                labels={STICKER_LABELS}
                emoji={STICKER_EMOJI}
                custom={customStickers}
                pictures={pictureStickers}
                onPickPicture={addPictureSticker}
                onUpload={uploadStickers}
                onForgetPicture={(id) => setSetting("picture_stickers", JSON.stringify(pictureStickers.filter((s) => s.id !== id)))}
                onPick={addSticker}
                onCreate={(text) => {
                  if (!customStickers.includes(text)) setSetting("custom_stickers", JSON.stringify([text, ...customStickers].slice(0, 30)));
                  addSticker(text, false);
                }}
                onForget={(text) => setSetting("custom_stickers", JSON.stringify(customStickers.filter((x) => x !== text)))}
              />
            </Popover>
          )}
          <span className="tb-sep" />
          <button type="button" className="tb" aria-label="Zoom out" onClick={() => setView((v) => zoomAt(v, size.w / 2, size.h / 2, 1 / 1.2))}>
            <Icon name="zoom-out" />
          </button>
          <button type="button" className="cap zoom-val" title="Fit to screen" onClick={() => setView(fitView(items, size.w, size.h))} data-testid="zoom">
            {Math.round(view.zoom * 100)}%
          </button>
          <button type="button" className="tb" aria-label="Zoom in" onClick={() => setView((v) => zoomAt(v, size.w / 2, size.h / 2, 1.2))}>
            <Icon name="zoom-in" />
          </button>
        </div>

        {bounds && (
          <button
            type="button"
            className="minimap"
            data-ui
            aria-label="Minimap: click to move the view"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const wx = bounds.x0 + (e.clientX - r.left - 8) / miniScale;
              const wy = bounds.y0 + (e.clientY - r.top - 8) / miniScale;
              setView((v) => ({ ...v, x: size.w / 2 - wx * v.zoom, y: size.h / 2 - wy * v.zoom }));
            }}
          >
            {items
              .filter((i) => i.kind !== "connector" && i.kind !== "section")
              .map((i) => (
                <span
                  key={i.id}
                  className={selection.includes(i.id) ? "on" : ""}
                  style={{
                    left: 8 + (i.x - bounds.x0) * miniScale,
                    top: 8 + (i.y - bounds.y0) * miniScale,
                    width: Math.max(2, i.w * miniScale),
                    height: Math.max(2, i.h * miniScale),
                  }}
                />
              ))}
            <i
              style={{
                left: 8 + (-view.x / view.zoom - bounds.x0) * miniScale,
                top: 8 + (-view.y / view.zoom - bounds.y0) * miniScale,
                width: (size.w / view.zoom) * miniScale,
                height: (size.h / view.zoom) * miniScale,
              }}
            />
          </button>
        )}
      </div>

      {openFolder && byId.get(openFolder) && (
        <FolderDialog
          item={byId.get(openFolder)!}
          onChange={(data) => doc.patch([{ id: openFolder, changes: { data } }])}
          onClose={() => setOpenFolder(null)}
        />
      )}
      {dialog === "image" && (
        <ImagePicker
          onClose={() => setDialog(null)}
          onPick={(ids) => {
            addAssets(ids, center());
            setDialog(null);
          }}
        />
      )}
      {dialog === "rename" && (
        <PromptDialog
          title="Rename board"
          initial={board.name}
          action="Rename"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            renameBoard(board.id, name);
            setDialog(null);
          }}
        />
      )}
      {/* A board made from inside a project belongs to it, so it shows up in the board dropdown. */}
      {dialog === "new" && <NewDialog kind="board" projectId={project?.id ?? null} onClose={() => setDialog(null)} />}
      {dialog === "delete" && (
        <ConfirmDialog
          title="Delete this board?"
          body={`“${board.name}” and its notes will be removed. Library items stay in your Library.`}
          action="Delete"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            deleteBoard(board.id);
            navigate("/board");
          }}
        />
      )}
    </main>
  );
}

export default function Canvas() {
  const { boardId } = useParams();
  const boards = useStore((s) => s.boards);
  const [starting, setStarting] = useState(false);
  const latest = useLatestBoard();
  const board = boards.find((b) => b.id === boardId) ?? latest;
  if (!board) {
    return (
      <main className="page">
        <h1 className="fr page-title">Canvas</h1>
        <p>You don't have a board yet.</p>
        <div>
          <Pill ink onClick={() => setStarting(true)}>
            <Icon name="plus" size={18} />
            New board
          </Pill>
        </div>
        {starting && <NewDialog kind="board" onClose={() => setStarting(false)} />}
      </main>
    );
  }
  // Remounting per board gives each one a fresh document and undo history.
  return <BoardCanvas key={board.id} board={board} />;
}
