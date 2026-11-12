/**
 * The Reader beside whatever you're doing, so reading never takes you off the board. It opens from any
 * screen with "?read=<source id>" and closes with Esc. The frame is glass; the page inside stays solid.
 */
import { lazy, Suspense, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../data/store";
import { Icon } from "../design/Icon";

const Reader = lazy(() => import("../features/reader/Reader"));

/** The address that opens a source in the panel, keeping the current screen. */
export const readerHref = (pathname: string, assetId: string) => `${pathname}?read=${encodeURIComponent(assetId)}`;

export function ReaderPanel() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const id = new URLSearchParams(search).get("read");
  const title = useStore((s) => (id ? s.assets.find((a) => a.id === id)?.title : undefined));
  const close = () => navigate(pathname, { replace: true });

  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "Escape" && !["INPUT", "TEXTAREA"].includes(t.tagName)) navigate(pathname, { replace: true });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [id, pathname, navigate]);

  if (!id || pathname.startsWith("/reader/")) return null;
  return (
    <aside className="reader-panel glass-2" aria-label={`Reading ${title ?? "a source"}`}>
      <div className="reader-panel-bar">
        <span className="reader-panel-title">{title ?? "Source"}</span>
        <button type="button" className="ib" title="Open full page" aria-label="Open in the full Reader" onClick={() => navigate(`/reader/${id}`)}>
          <Icon name="maximize" size={16} />
        </button>
        <button type="button" className="ib" title="Close (Esc)" aria-label="Close the Reader" onClick={close}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="reader-panel-page">
        <Suspense fallback={<p className="cap reader-panel-wait">Opening…</p>}>
          <Reader assetId={id} embedded />
        </Suspense>
      </div>
    </aside>
  );
}
