/**
 * Handoff's build material: code to build on (a whole repository, or snippets and files) and 3D models
 * for the site. Both are things the AI uses directly, not just reads, so they get their own cards.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Asset, useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { Pill, toast } from "../../design/primitives";
import { fetchRepo, languageOf, parseRepoInput, RepoInfo } from "../../lib/github";
import { PackPlan, setIncluded } from "../../lib/packPlan";
import { mediaUrl } from "../../lib/platform";
import { isCredited } from "../../lib/search";
import { CodeDialog, Mode } from "../library/CodeDialog";
import { pickAndImport } from "../library/importing";
import { PackRow, updatePlan } from "./usePack";

const ModelPreview = lazy(() => import("../cad/ModelPreview"));

const placeOf = (rows: PackRow[], id: string) => rows.find((r) => r.item.id === id)?.place ?? "out";

function InOut({ id, title, rows }: { id: string; title: string; rows: PackRow[] }) {
  const inPack = placeOf(rows, id) !== "out";
  return (
    <label className="check bm-in">
      <input type="checkbox" checked={inPack} onChange={(e) => updatePlan((p) => setIncluded(p, [id], e.target.checked))} aria-label={`Include ${title} in the pack`} />
      In the pack
    </label>
  );
}

type RepoState = { status: "idle" } | { status: "loading" } | { status: "ok"; info: RepoInfo } | { status: "error"; message: string };

/** A repository to build on, for making your own version of a tool, plus saved snippets and files. */
export function CodeCard({ plan, rows }: { plan: PackPlan; rows: PackRow[] }) {
  const assets = useStore((s) => s.assets);
  const code = useMemo(() => assets.filter((a) => a.kind === "code").sort((a, b) => b.captured_at.localeCompare(a.captured_at)), [assets]);
  const [dialog, setDialog] = useState<{ mode: Mode; repo: string } | null>(null);
  const [repo, setRepo] = useState<RepoState>({ status: "idle" });
  const base = plan.app.baseRepo.trim();
  const placeholder = base === "owner/repo";
  const ref = useMemo(() => (base && !placeholder ? parseRepoInput(base) : null), [base, placeholder]);

  // Looked up when the field settles, so the licence is known before anyone builds on it.
  useEffect(() => {
    if (!ref) {
      setRepo({ status: "idle" });
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      setRepo({ status: "loading" });
      fetchRepo(ref)
        .then((info) => !stale && setRepo({ status: "ok", info }))
        .catch((e) => !stale && setRepo({ status: "error", message: String(e instanceof Error ? e.message : e) }));
    }, 600);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [ref]);

  const setBase = (value: string) => updatePlan((p) => ({ ...p, app: { ...p.app, baseRepo: value } }));
  const shown = code.slice(0, 8);

  return (
    <section className="card ho-card bm-card" aria-label="Code">
      <div className="ho-card-head">
        <h2 className="ho-h2">Code</h2>
        <span className="cap">A repository to build on, and snippets the AI should reuse rather than rewrite.</span>
      </div>

      <div className="bm-block">
        <label className="ho-field">
          <span className="ho-label">Build on a GitHub repository</span>
          <span className="cap">For your own version of an existing tool. The AI is told to clone it, keep its licence and change only what the brief asks.</span>
          <span className="bm-repo-row">
            <Icon name="link" size={16} />
            <input
              className="field"
              aria-label="Repository to build on"
              placeholder="owner/repo, or a github.com link"
              value={placeholder ? "" : plan.app.baseRepo}
              onChange={(e) => setBase(e.target.value)}
            />
            {base && !placeholder && (
              <button type="button" className="ib" aria-label="Clear the repository" onClick={() => setBase("")}>
                <Icon name="close" size={16} />
              </button>
            )}
          </span>
        </label>
        {base && !placeholder && !ref && <p className="cap bm-note guess">That isn't a GitHub repository. Use owner/repo or a github.com link.</p>}
        {repo.status === "loading" && <p className="cap bm-note">Looking it up on GitHub…</p>}
        {repo.status === "error" && <p className="cap bm-note guess">{repo.message}</p>}
        {repo.status === "ok" && (
          <div className="bm-repo">
            <div className="bm-repo-text">
              <b>
                {repo.info.owner}/{repo.info.repo}
              </b>
              <span className="cap">{repo.info.description || "No description."}</span>
              <span className="bm-tags">
                <span className="bm-tag">{repo.info.ref}</span>
                <span className={`bm-tag ${repo.info.license ? "" : "warn"}`}>{repo.info.license ? `${repo.info.license} licence` : "No licence stated: read only"}</span>
              </span>
            </div>
            <span className="bm-repo-actions">
              <Pill className="small" onClick={() => setDialog({ mode: "github", repo: `${repo.info.owner}/${repo.info.repo}` })}>
                Pick files from it…
              </Pill>
              <a className="link-btn" href={repo.info.url} target="_blank" rel="noreferrer">
                Open on GitHub
              </a>
            </span>
          </div>
        )}
      </div>

      <div className="bm-block">
        <div className="bm-head">
          <span className="ho-label">Snippets and files</span>
          <span className="bm-actions">
            <Pill className="small" onClick={() => setDialog({ mode: "snippet", repo: "" })}>
              <Icon name="plus" size={14} />
              Paste a snippet
            </Pill>
            <Pill className="small" onClick={() => setDialog({ mode: "github", repo: ref ? `${ref.owner}/${ref.repo}` : "" })}>
              <Icon name="import" size={14} />
              From GitHub
            </Pill>
          </span>
        </div>
        {code.length === 0 ? (
          <p className="cap bm-empty">No code saved yet. Paste a pattern you want copied, or pick files from a public repository; each keeps its credit and licence.</p>
        ) : (
          <ul className="bm-list">
            {shown.map((a) => (
              <li key={a.id} className="bm-row">
                <span className="bm-lang">{languageOf(a) || "code"}</span>
                <span className="bm-row-text">
                  <b>{a.title}</b>
                  <span className={`cap ${isCredited(a) ? "" : "guess"}`}>{a.credit === "yours" ? "yours" : isCredited(a) ? `© ${a.credit}` : "no source yet"}</span>
                </span>
                <InOut id={a.id} title={a.title} rows={rows} />
              </li>
            ))}
          </ul>
        )}
        {code.length > shown.length && (
          <Link className="link-btn" to="/library">
            All {code.length} in the Library
          </Link>
        )}
      </div>

      {dialog && (
        <CodeDialog
          initialMode={dialog.mode}
          initialRepo={dialog.repo}
          onClose={() => setDialog(null)}
          onAdded={(added: Asset[]) => {
            if (added.length) {
              updatePlan((p) => setIncluded(p, added.map((a) => a.id), true));
              toast(`${added.length} added to the pack`);
            }
          }}
        />
      )}
    </section>
  );
}

/** 3D models the site should show, each with a live preview and a link to the full viewer. */
export function ModelsCard({ plan, rows }: { plan: PackPlan; rows: PackRow[] }) {
  const assets = useStore((s) => s.assets);
  const models = useMemo(() => assets.filter((a) => a.kind === "3d"), [assets]);
  const chosen = new Set(plan.siteModels);
  const toggle = (a: Asset, on: boolean) =>
    updatePlan((p) => {
      const next = on ? [...new Set([...p.siteModels, a.id])] : p.siteModels.filter((x) => x !== a.id);
      return setIncluded({ ...p, siteModels: next }, [a.id], on || placeOf(rows, a.id) !== "out");
    });

  return (
    <section className="card ho-card bm-card" aria-label="3D models">
      <div className="ho-card-head">
        <h2 className="ho-h2">3D models</h2>
        <span className="cap">Models picked for the site go in the zip under site/models, with how to show them so visitors can turn them.</span>
        <Pill className="small" onClick={() => void pickAndImport()}>
          <Icon name="import" size={14} />
          Import a model…
        </Pill>
      </div>
      {models.length === 0 ? (
        <p className="cap bm-empty">No 3D models yet. Import a GLB, glTF, STL or OBJ file, or a STEP file to look at in the viewer.</p>
      ) : (
        <ul className="bm-models">
          {models.map((a) => {
            const url = mediaUrl(a);
            const on = chosen.has(a.id);
            return (
              <li key={a.id} className={`bm-model ${on ? "on" : ""}`}>
                <div className="bm-model-view">
                  {url ? (
                    <Suspense fallback={<div className="model-preview" />}>
                      <ModelPreview url={url} path={a.file_path ?? a.preview ?? ""} label={a.title} />
                    </Suspense>
                  ) : (
                    <div className="model-preview">
                      <span className="model-preview-note cap">File missing</span>
                    </div>
                  )}
                </div>
                <div className="bm-model-text">
                  <b>{a.title}</b>
                  <span className={`cap ${isCredited(a) ? "" : "guess"}`}>{a.credit === "yours" ? "yours" : isCredited(a) ? `© ${a.credit}` : "no source yet"}</span>
                </div>
                <div className="bm-model-actions">
                  <label className="check">
                    <input type="checkbox" checked={on} onChange={(e) => toggle(a, e.target.checked)} />
                    Use on the site
                  </label>
                  <Link className="link-btn" to={`/cad/${a.id}`}>
                    Open viewer
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
