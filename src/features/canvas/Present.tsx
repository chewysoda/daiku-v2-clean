import { useEffect, useMemo, useState } from "react";
import { itemLook } from "./itemStyle";
import { MathText } from "../../design/MathText";
import { useNavigate, useParams } from "react-router";
import { useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { AssetImage, Pill } from "../../design/primitives";
import { isCredited } from "../../lib/search";
import { itemsInSection } from "./geometry";

/** Each section is a slide. With no sections, the whole board is one slide. */
export default function Present() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const board = useStore((s) => s.boards.find((b) => b.id === boardId));
  const allItems = useStore((s) => s.board_items);
  const assets = useStore((s) => s.assets);
  const [index, setIndex] = useState(0);

  const slides = useMemo(() => {
    const items = allItems.filter((i) => i.board_id === boardId);
    const sections = items.filter((i) => i.kind === "section").sort((a, b) => a.y - b.y || a.x - b.x);
    if (!sections.length) return [{ title: board?.name ?? "", items: items.filter((i) => i.kind !== "connector") }];
    return sections.map((s) => ({ title: s.data.text ?? "", items: itemsInSection(s, items) }));
  }, [allItems, boardId, board?.name]);

  const last = slides.length - 1;
  const exit = () => navigate(`/board/${boardId}`);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") setIndex((i) => Math.min(i + 1, last));
      if (e.key === "ArrowLeft" || e.key === "PageUp") setIndex((i) => Math.max(i - 1, 0));
      if (e.key === "Escape") navigate(`/board/${boardId}`);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [last, navigate, boardId]);

  const slide = slides[Math.min(index, last)];
  const images = slide.items.filter((i) => i.kind === "image");
  const notes = slide.items.filter((i) => i.kind === "sticky" || i.kind === "text");
  const credits = images
    .map((i) => assets.find((a) => a.id === i.asset_id))
    .filter((a) => a && isCredited(a))
    .map((a) => `${a!.title} © ${a!.credit}`);

  return (
    <div className="present" role="region" aria-label={`Presenting ${board?.name ?? "board"}`}>
      <div className="present-head">
        <span className="cap">{board?.name}</span>
        <button type="button" className="ib" aria-label="Exit presentation" onClick={exit}>
          <Icon name="close" />
        </button>
      </div>
      <div className="present-stage">
        <h1 className="fr present-title">{slide.title}</h1>
        {images.length > 0 && (
          <div className="present-grid">
            {images.slice(0, 5).map((i) => (
              <div className="present-cell" key={i.id}>
                <AssetImage asset={assets.find((a) => a.id === i.asset_id)} />
              </div>
            ))}
          </div>
        )}
        {notes.length > 0 && (
          <div className="present-notes">
            {notes.map((n) => (
              <p className={n.kind === "sticky" ? "present-note" : "fr"} key={n.id} style={itemLook(n)}>
                <MathText text={n.data.text ?? ""} />
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="present-foot">
        <span className="cap present-credits">{credits.join(" · ")}</span>
        <div className="present-nav">
          <span className="cap">
            {Math.min(index, last) + 1} of {slides.length}
          </span>
          <Pill disabled={index <= 0} onClick={() => setIndex((i) => i - 1)}>
            Previous
          </Pill>
          <Pill ink disabled={index >= last} onClick={() => setIndex((i) => i + 1)}>
            Next
            <Icon name="arrow-right" size={16} />
          </Pill>
        </div>
      </div>
    </div>
  );
}
