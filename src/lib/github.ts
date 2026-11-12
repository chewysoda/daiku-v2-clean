/**
 * Code as research material: pasted snippets and files read from public GitHub repositories.
 * Daiku only ever stores and shows code. Nothing here runs it, and no account or token is used.
 */
import { Asset } from "../data/types";
import { isTauri, native } from "./platform";

export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch, tag or commit. Null means the repository's default branch. */
  ref: string | null;
  /** A folder or file inside the repository, if the link pointed at one. */
  path: string;
}

export interface RepoInfo {
  owner: string;
  repo: string;
  ref: string;
  description: string;
  license: string | null;
  url: string;
}

export interface RepoFile {
  path: string;
  size: number;
}

/** GitHub's raw text limit for one file here. Bigger files are usually generated or data. */
export const MAX_FILE_BYTES = 512 * 1024;
/** How many files one import may take, so a pack stays readable. */
export const MAX_IMPORT_FILES = 40;

const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * Reads what someone pasted: `owner/repo`, a github.com link to a repo, folder or file, or a
 * raw.githubusercontent.com link. Returns null for anything else.
 */
export function parseRepoInput(input: string): RepoRef | null {
  const text = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  if (!text) return null;
  const short = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text);
  if (short) return { owner: short[1], repo: short[2], ref: null, path: "" };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (url.hostname === "raw.githubusercontent.com") {
    const [owner, repo, ref, ...rest] = parts;
    if (!owner || !repo || !ref || !NAME.test(owner) || !NAME.test(repo)) return null;
    return { owner, repo, ref, path: rest.join("/") };
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const [owner, repo, mode, ref, ...rest] = parts;
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return null;
  if ((mode === "tree" || mode === "blob") && ref) return { owner, repo, ref, path: rest.join("/") };
  return { owner, repo, ref: null, path: "" };
}

const LANGUAGES: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", php: "php", lua: "lua",
  sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell", sql: "sql", r: "r", m: "matlab",
  html: "html", css: "css", scss: "scss", vue: "vue", svelte: "svelte", astro: "astro",
  json: "json", yml: "yaml", yaml: "yaml", toml: "toml", xml: "xml", md: "markdown", mdx: "mdx",
  ino: "arduino", scad: "openscad", gcode: "gcode", glsl: "glsl", wgsl: "wgsl", dart: "dart", zig: "zig",
};
export const LANGUAGE_CHOICES = [...new Set(Object.values(LANGUAGES))].sort();

const TEXT_NAMES = /^(dockerfile|makefile|license|readme|cmakelists\.txt|\.gitignore|\.env\.example)$/i;

/** The language a file is written in, from its name. "text" when it can't tell. */
export function languageFor(path: string): string {
  const name = path.split("/").pop() ?? "";
  if (/^dockerfile$/i.test(name)) return "dockerfile";
  if (/^makefile$/i.test(name)) return "makefile";
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? "";
  return LANGUAGES[ext] ?? "text";
}

/** Whether a file is worth offering: readable source or docs, not a picture, archive or lockfile. */
export function isReadable(file: RepoFile): boolean {
  const name = file.path.split("/").pop() ?? "";
  if (file.size > MAX_FILE_BYTES) return false;
  if (/(^|\/)(node_modules|dist|build|vendor|\.git)\//.test(file.path)) return false;
  if (/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|\.min\.(js|css))$/i.test(name)) return false;
  return TEXT_NAMES.test(name) || languageFor(file.path) !== "text" || /\.(txt|cfg|ini|conf)$/i.test(name);
}

/** The language stored on a code asset, read back from its tags. */
export const languageOf = (asset: Pick<Asset, "tags" | "title">) =>
  /(?:^|\s)lang:([a-z0-9+#-]+)/i.exec(asset.tags)?.[1] ?? languageFor(asset.title);

/** Tags for a code asset: always "code", the language, and anything the person added. */
export function codeTags(language: string, extra = ""): string {
  const rest = extra.split(/\s+/).filter((t) => t && t !== "code" && !t.startsWith("lang:"));
  return ["code", `lang:${language || "text"}`, ...rest].join(" ");
}

/** A fenced block that can't be closed early by backticks inside the code. */
export function fence(code: string, language: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((m) => m.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${language === "text" ? "" : language}\n${code.replace(/\n$/, "")}\n${ticks}`;
}

export const lineCount = (code: string) => (code ? code.replace(/\n$/, "").split("\n").length : 0);

// ---- Network -----------------------------------------------------------------------------

/** GitHub's public API answers browser requests; the desktop app goes through Rust (see github_get). */
async function getText(url: string): Promise<string> {
  if (isTauri) return native.githubGet(url);
  const res = await fetch(url, { headers: url.includes("api.github.com") ? { Accept: "application/vnd.github+json" } : {} });
  if (res.status === 403 || res.status === 429) throw new Error("GitHub's hourly limit for public requests is used up. Try again later.");
  if (res.status === 404) throw new Error("Not found. Check the link, and that the repository is public.");
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  return res.text();
}

/* eslint-disable @typescript-eslint/no-explicit-any -- GitHub's JSON, read defensively */
export function parseRepoInfo(json: any, ref: RepoRef): RepoInfo {
  const license = json?.license?.spdx_id && json.license.spdx_id !== "NOASSERTION" ? String(json.license.spdx_id) : null;
  return {
    owner: String(json?.owner?.login ?? ref.owner),
    repo: String(json?.name ?? ref.repo),
    ref: ref.ref ?? String(json?.default_branch ?? "main"),
    description: String(json?.description ?? ""),
    license,
    url: String(json?.html_url ?? `https://github.com/${ref.owner}/${ref.repo}`),
  };
}

export function parseTree(json: any, under = ""): { files: RepoFile[]; truncated: boolean } {
  const prefix = under ? `${under.replace(/\/$/, "")}/` : "";
  const files = (Array.isArray(json?.tree) ? json.tree : [])
    .filter((n: any) => n?.type === "blob" && typeof n.path === "string" && (!prefix || n.path.startsWith(prefix) || n.path === under))
    .map((n: any) => ({ path: n.path as string, size: Number(n.size ?? 0) }));
  return { files, truncated: Boolean(json?.truncated) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchRepo(ref: RepoRef): Promise<RepoInfo> {
  return parseRepoInfo(JSON.parse(await getText(`https://api.github.com/repos/${ref.owner}/${ref.repo}`)), ref);
}

export async function fetchTree(info: RepoInfo, under = ""): Promise<{ files: RepoFile[]; truncated: boolean }> {
  const url = `https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${encodeURIComponent(info.ref)}?recursive=1`;
  return parseTree(JSON.parse(await getText(url)), under);
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export const rawUrl = (info: Pick<RepoInfo, "owner" | "repo" | "ref">, path: string) =>
  `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${encodeURIComponent(info.ref)}/${encodePath(path)}`;

export const blobUrl = (info: Pick<RepoInfo, "owner" | "repo" | "ref">, path: string) =>
  `https://github.com/${info.owner}/${info.repo}/blob/${encodeURIComponent(info.ref)}/${encodePath(path)}`;

export async function fetchFile(info: RepoInfo, path: string): Promise<string> {
  const text = await getText(rawUrl(info, path));
  if (text.includes("\u0000")) throw new Error(`${path} isn't a text file`);
  return text;
}

/** The credit line for a file from a repository: who holds it, and the licence it was shared under. */
export const repoCredit = (info: Pick<RepoInfo, "owner" | "repo" | "license">) =>
  `${info.owner}/${info.repo}${info.license ? ` (${info.license})` : " (no licence stated)"}`;
