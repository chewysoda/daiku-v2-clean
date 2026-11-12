import { ButtonHTMLAttributes, ReactNode, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Asset } from "../data/types";
import { mediaUrl } from "../lib/platform";
import { isVectorPath } from "../lib/svg";
import { Icon } from "./Icon";

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & { ink?: boolean };

export function Pill({ ink, className = "", children, ...rest }: PillProps) {
  return (
    <button type="button" className={`pill ${ink ? "ink" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Avatar({ name, size = 34, tint }: { name: string; size?: number; tint?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "·";
  return (
    <span
      className="av"
      aria-label={name || "You"}
      style={{ width: size, height: size, background: tint ?? "var(--c-avatar)" }}
    >
      {initials}
    </span>
  );
}

/** Asset image, or a labelled tile for things that have no picture (PDFs, links). */
export function AssetImage({ asset, focus }: { asset: Asset | null | undefined; focus?: string }) {
  const url = asset ? mediaUrl(asset) : null;
  if (!asset) return <div className="asset-missing cap">file removed</div>;
  if (url && asset.kind === "image") {
    return (
      <img
        className={`ph fade-img ${!asset.is_sample && (isVectorPath(url) || isVectorPath(asset.file_path)) ? "is-svg" : ""}`}
        src={url}
        alt={asset.title}
        loading="lazy"
        draggable={false}
        // A picture already in the cache shows at once. The fade is only for ones still arriving.
        ref={(el) => {
          if (el?.complete) el.classList.add("loaded");
        }}
        onLoad={(e) => e.currentTarget.classList.add("loaded")}
        onError={(e) => e.currentTarget.classList.add("loaded")}
        style={focus ? { objectPosition: focus } : undefined}
      />
    );
  }
  if (asset.kind === "code") {
    const lines = asset.notes.split("\n").slice(0, 14).join("\n");
    const lang = /(?:^|\s)lang:(\S+)/.exec(asset.tags)?.[1] ?? "code";
    return (
      <div className="asset-code">
        <pre aria-hidden="true">{lines}</pre>
        <span className="doc-text">
          <b>{asset.title}</b>
          <span className="cap">
            {lang} · {asset.credit ? "credited" : "no source yet"}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="asset-doc">
      <span className="doc-lines" aria-hidden="true">
        <span />
        <span style={{ width: "80%" }} />
        <span className="hl" />
        <span style={{ width: "70%" }} />
      </span>
      <span className="doc-text">
        <b>{asset.title}</b>
        <span className="cap">
          {asset.kind} · {asset.credit ? "credited" : "no source yet"}
        </span>
      </span>
    </div>
  );
}

export function Swatch({
  color,
  label,
  size = 28,
  onClick,
  pressed,
}: {
  color: string;
  label: string;
  size?: number;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`sw ${pressed ? "on" : ""}`}
      style={{ background: color, width: size, height: size }}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    />
  );
}

/** A small popover that closes on outside click or Escape. */
export function Popover({
  onClose,
  children,
  className = "",
  style,
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** What a screen reader announces it as. */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div ref={ref} aria-label={label} className={`popover ${className}`} style={style} role="dialog">
      {children}
    </div>
  );
}

/** Modal with a text field, used instead of window.prompt (which WebView2 apps don't get). */
export function PromptDialog({
  title,
  placeholder,
  initial = "",
  action = "Create",
  onSubmit,
  onClose,
}: {
  title: string;
  placeholder?: string;
  initial?: string;
  action?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <h2 className="fr dialog-title">{title}</h2>
        <input
          autoFocus
          className="field"
          value={value}
          placeholder={placeholder}
          aria-label={title}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <div className="dialog-actions">
          <Pill onClick={onClose}>Cancel</Pill>
          <Pill ink type="submit" disabled={!value.trim()}>
            {action}
          </Pill>
        </div>
      </form>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="alertdialog" aria-label={title}>
        <h2 className="fr dialog-title">{title}</h2>
        <p className="dialog-body">{body}</p>
        <div className="dialog-actions">
          <Pill autoFocus onClick={onClose}>
            Cancel
          </Pill>
          <Pill ink onClick={onConfirm}>
            {action}
          </Pill>
        </div>
      </div>
    </div>
  );
}

/** A button on the toast, such as Undo: forgiveness instead of "are you sure?". */
export interface ToastAction {
  label: string;
  run: () => void;
}
interface ToastState {
  message: string | null;
  tone: "info" | "error";
  action: ToastAction | null;
  show: (message: string, tone?: "info" | "error", action?: ToastAction) => void;
  clear: () => void;
}
export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: "info",
  action: null,
  show: (message, tone = "info", action) => set({ message, tone, action: action ?? null }),
  clear: () => set({ message: null }),
}));
export const toast = (message: string, tone: "info" | "error" = "info", action?: ToastAction) =>
  useToast.getState().show(message, tone, action);

export function Toaster() {
  const { message, tone, action, clear } = useToast();
  // Holds the last message on screen for a moment after it clears, so it can fade out.
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    // Longer when there's something to press.
    const t = setTimeout(clear, tone === "error" || action ? 8000 : 3200);
    return () => clearTimeout(t);
  }, [message, tone, action, clear]);
  useEffect(() => {
    if (message) {
      setShown(message);
      return;
    }
    const t = setTimeout(() => setShown(null), 180);
    return () => clearTimeout(t);
  }, [message]);
  if (!shown) return null;
  return (
    <div className={`toast ${tone} ${message ? "" : "leaving"}`} role={tone === "error" ? "alert" : "status"}>
      <span>{shown}</span>
      {action && message && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            action.run();
            clear();
          }}
        >
          {action.label}
        </button>
      )}
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={clear}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
