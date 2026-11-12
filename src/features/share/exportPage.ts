import { Asset, Board, Comment } from "../../data/types";
import { mathToMathml } from "../../design/MathText";
import { isTauri, mediaUrl } from "../../lib/platform";
import { isCredited } from "../../lib/search";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface SharePageInput {
  board: Board;
  images: { asset: Asset; src: string }[];
  comments: Comment[];
  from: string;
  /** Turns comment text into HTML. Defaults to plain escaping. */
  formatText?: (text: string) => string;
}

/**
 * One self-contained HTML file: images inlined, system fonts, no scripts and no network, so it
 * opens from an email or a USB stick. Everything from the user goes through esc().
 */
export function renderSharePage({ board, images, comments, from, formatText }: SharePageInput): string {
  const text = formatText ?? esc;
  const s = board.share;
  const roots = comments.filter((c) => !c.parent_id);
  const figure = ({ asset, src }: SharePageInput["images"][number]) => {
    const pins = roots
      .filter((c) => c.asset_id === asset.id && c.pin_x !== null)
      .map((c) => `<span class="pin" style="left:${Number(c.pin_x)}%;top:${Number(c.pin_y)}%">${roots.indexOf(c) + 1}</span>`)
      .join("");
    return `<figure><img src="${esc(src)}" alt="${esc(asset.title)}">${pins}</figure>`;
  };
  const commentHtml = roots
    .map((c, i) => {
      const replies = comments
        .filter((r) => r.parent_id === c.id)
        .map((r) => `<div class="reply"><b>${esc(r.author)}</b><p>${text(r.text)}</p></div>`)
        .join("");
      return `<article><b>${i + 1}. ${esc(c.author)}</b><p>${text(c.text)}</p>${replies}</article>`;
    })
    .join("");
  const credits = images
    .map((i) => i.asset)
    .filter(isCredited)
    .map((a) => {
      const line = `${esc(a.title)} © ${esc(a.credit ?? "")}`;
      return /^https?:\/\//i.test(a.source_url ?? "")
        ? `<li><a href="${esc(a.source_url!)}" rel="noreferrer">${line}</a></li>`
        : `<li>${line}</li>`;
    })
    .join("");
  const headline = esc(s.headline || board.name);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${headline}</title>
<style>
body{margin:0;background:#FBFAF7;color:#1E1F1C;font:15px/1.7 system-ui,sans-serif}
main{max-width:1080px;margin:0 auto;padding:40px 24px}
h1{font:italic 400 clamp(36px,6vw,64px)/1 Georgia,serif;margin:8px 0 24px}
.cap{font:11px ui-monospace,monospace;color:#6B6D65}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
figure{position:relative;margin:0;border-radius:14px;overflow:hidden;background:#EDE8DF;aspect-ratio:4/3}
figure img{display:block;width:100%;height:100%;object-fit:cover}
.pin{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:#1E1F1C;color:#FBFAF7;font:11px/26px ui-monospace,monospace;text-align:center;border:2px solid #fff;box-sizing:content-box}
.tag{font:italic 400 30px/1.2 Georgia,serif;margin:32px 0 8px}
article{background:#fff;border:1px solid #ECE8E0;border-radius:16px;padding:16px;margin:0 0 12px}
article p{margin:6px 0 0}.reply{margin-top:10px;padding-top:10px;border-top:1px solid #ECE8E0}
ul{padding-left:18px}a{color:#3F5442}
</style></head><body><main>
${from ? `<span class="cap">from ${esc(from)}</span>` : ""}
<h1>${headline}</h1>
<div class="grid">${images.map(figure).join("")}</div>
${s.tagline ? `<p class="tag">${esc(s.tagline)}</p>` : ""}
${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
${commentHtml ? `<h2 class="tag">Comments</h2>${commentHtml}` : ""}
${credits ? `<details><summary>Image credits</summary><ul>${credits}</ul></details>` : ""}
</main></body></html>`;
}

/** Returns where it went, or null if the user cancelled. */
export async function exportSharePage(board: Board, assets: Asset[], comments: Comment[], from: string): Promise<string | null> {
  const images = await Promise.all(
    assets.map(async (asset) => ({ asset, src: await toDataUrl(mediaUrl(asset)!) })),
  );
  const html = renderSharePage({ board, images, comments, from, formatText: await mathToMathml(esc) });
  const filename = `${(board.share.headline || board.name).replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "daiku"}.html`;
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: filename, filters: [{ name: "Web page", extensions: ["html"] }] });
    if (!path) return null;
    await writeTextFile(path, html);
    return path;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return filename;
}
