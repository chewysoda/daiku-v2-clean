import { useMemo, useState } from "react";
import { Asset, useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { Pill, toast } from "../../design/primitives";
import {
  blobUrl,
  codeTags,
  fetchFile,
  fetchRepo,
  fetchTree,
  isReadable,
  LANGUAGE_CHOICES,
  languageFor,
  lineCount,
  MAX_IMPORT_FILES,
  parseRepoInput,
  repoCredit,
  RepoFile,
  RepoInfo,
} from "../../lib/github";
import { newAsset } from "./importing";

export type Mode = "snippet" | "github";

/**
 * Saves code as a source: a pasted snippet, or files from a public GitHub repository. It lands in
 * the Library with its credit and link, like any other source, so the build pack can cite it.
 */
export function CodeDialog({ onClose, onAdded, initialMode = "snippet", initialRepo = "" }: { onClose: () => void; onAdded: (assets: Asset[]) => void; initialMode?: Mode; initialRepo?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog code-dialog" role="dialog" aria-modal="true" aria-labelledby="code-dialog-title" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="code-dialog-head">
          <h2 id="code-dialog-title" className="fr dialog-title">
            Add code
          </h2>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="dialog-body">
          Code you save is research material, like a paper or a picture. It keeps its credit and licence, and the build pack hands it to your AI as reference, never as instructions. Daiku never runs it.
        </p>
        <div className="seg-group code-seg" role="tablist" aria-label="Where the code comes from">
          <button type="button" role="tab" id="code-tab-snippet" aria-controls="code-panel" aria-selected={mode === "snippet"} className={`seg ${mode === "snippet" ? "on" : ""}`} onClick={() => setMode("snippet")}>
            Paste a snippet
          </button>
          <button type="button" role="tab" id="code-tab-github" aria-controls="code-panel" aria-selected={mode === "github"} className={`seg ${mode === "github" ? "on" : ""}`} onClick={() => setMode("github")}>
            From GitHub
          </button>
        </div>
        <div id="code-panel" role="tabpanel" aria-labelledby={`code-tab-${mode}`}>
          {mode === "snippet" ? <SnippetForm onClose={onClose} onAdded={onAdded} /> : <GitHubPicker onClose={onClose} onAdded={onAdded} initialRepo={initialRepo} />}
        </div>
      </div>
    </div>
  );
}

function SnippetForm({ onClose, onAdded }: { onClose: () => void; onAdded: (assets: Asset[]) => void }) {
  const putAsset = useStore((s) => s.putAsset);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("");
  const [mine, setMine] = useState(true);
  const [credit, setCredit] = useState("");
  const [source, setSource] = useState("");
  const guessed = language || (title ? languageFor(title) : "text");
  const ready = title.trim() && code.trim() && (mine || credit.trim());

  const save = () => {
    if (!ready) return;
    const asset = newAsset({
      kind: "code",
      title: title.trim(),
      notes: code,
      credit: mine ? "yours" : credit.trim(),
      source_url: source.trim() || null,
      via: "pasted",
      provenance: mine ? "human" : "unknown",
      tags: codeTags(guessed, "snippet"),
    });
    putAsset(asset);
    onAdded([asset]);
    toast(`Saved “${asset.title}” to the Library`);
    onClose();
  };

  return (
    <form
      className="code-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="code-row">
        <label className="lbl">
          <span className="cap">name</span>
          <input autoFocus className="field" value={title} placeholder="e.g. debounce.ts or Hinge stress calc" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="lbl code-lang">
          <span className="cap">language</span>
          <select className="field" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Detect ({guessed})</option>
            {LANGUAGE_CHOICES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="lbl">
        <span className="cap">code · {lineCount(code)} lines</span>
        <textarea
          className="field code-field"
          rows={10}
          spellCheck={false}
          value={code}
          placeholder="Paste the code here"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            // Tab indents instead of leaving the field. Escape still leaves, so the field never traps focus.
            if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault();
              const el = e.currentTarget;
              const at = el.selectionStart;
              const next = `${code.slice(0, at)}  ${code.slice(el.selectionEnd)}`;
              setCode(next);
              requestAnimationFrame(() => el.setSelectionRange(at + 2, at + 2));
            }
          }}
        />
      </label>
      <fieldset className="code-owner">
        <legend className="cap">who wrote it</legend>
        <label className="check">
          <input type="radio" name="owner" checked={mine} onChange={() => setMine(true)} />I did
        </label>
        <label className="check">
          <input type="radio" name="owner" checked={!mine} onChange={() => setMine(false)} />
          Someone else
        </label>
      </fieldset>
      {!mine && (
        <div className="code-row">
          <label className="lbl">
            <span className="cap">credit (author, and licence if known)</span>
            <input className="field" value={credit} placeholder="e.g. Jane Doe (MIT)" onChange={(e) => setCredit(e.target.value)} />
          </label>
          <label className="lbl">
            <span className="cap">source link</span>
            <input className="field" value={source} placeholder="https://" onChange={(e) => setSource(e.target.value)} />
          </label>
        </div>
      )}
      <div className="dialog-actions">
        <Pill onClick={onClose}>Cancel</Pill>
        <Pill ink type="submit" disabled={!ready}>
          Save snippet
        </Pill>
      </div>
    </form>
  );
}

function GitHubPicker({ onClose, onAdded, initialRepo = "" }: { onClose: () => void; onAdded: (assets: Asset[]) => void; initialRepo?: string }) {
  const putAsset = useStore((s) => s.putAsset);
  const [input, setInput] = useState(initialRepo);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [hidden, setHidden] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
  }, [files, filter]);

  const lookUp = async () => {
    const ref = parseRepoInput(input);
    setError(null);
    if (!ref) {
      setError("That isn't a GitHub repository. Paste owner/repo, or a github.com link.");
      return;
    }
    setBusy("Looking it up…");
    setRepo(null);
    setFiles([]);
    setPicked([]);
    try {
      const info = await fetchRepo(ref);
      const tree = await fetchTree(info);
      const exact = tree.files.find((f) => f.path === ref.path);
      const inside = ref.path && !exact ? tree.files.filter((f) => f.path.startsWith(`${ref.path}/`)) : tree.files;
      const readable = inside.filter(isReadable).sort((a, b) => a.path.localeCompare(b.path));
      setRepo(info);
      setFiles(readable);
      setHidden(inside.length - readable.length);
      setTruncated(tree.truncated);
      setFilter(ref.path && !exact ? ref.path : "");
      if (exact) setPicked([exact.path]);
      else setPicked(readable.filter((f) => /(^|\/)readme(\.md)?$/i.test(f.path)).slice(0, 1).map((f) => f.path));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (path: string) =>
    setPicked((p) => (p.includes(path) ? p.filter((x) => x !== path) : p.length >= MAX_IMPORT_FILES ? p : [...p, path]));

  const save = async () => {
    if (!repo || !picked.length) return;
    const added: Asset[] = [];
    const failed: string[] = [];
    for (const [n, path] of picked.entries()) {
      setBusy(`Saving ${n + 1} of ${picked.length}…`);
      try {
        const text = await fetchFile(repo, path);
        const asset = newAsset({
          kind: "code",
          title: path.split("/").pop() ?? path,
          notes: text,
          credit: repoCredit(repo),
          source_url: blobUrl(repo, path),
          via: `GitHub · ${repo.owner}/${repo.repo}@${repo.ref} · ${path}`,
          provenance: "unknown",
          tags: codeTags(languageFor(path), `github ${repo.repo}`),
        });
        putAsset(asset);
        added.push(asset);
      } catch {
        failed.push(path);
      }
    }
    setBusy(null);
    if (added.length) {
      onAdded(added);
      toast(`Saved ${added.length} file${added.length === 1 ? "" : "s"} from ${repo.owner}/${repo.repo}${failed.length ? `. ${failed.length} couldn't be read` : ""}`);
      onClose();
    } else setError("None of those files could be read. They may be binary, or GitHub may be limiting requests.");
  };

  const pickable = shown.slice(0, 400);
  const allShownPicked = pickable.length > 0 && pickable.slice(0, MAX_IMPORT_FILES).every((f) => picked.includes(f.path));

  return (
    <div className="code-form">
      <form
        className="code-row code-lookup"
        onSubmit={(e) => {
          e.preventDefault();
          void lookUp();
        }}
      >
        <label className="lbl">
          <span className="cap">public repository, folder or file</span>
          <input autoFocus className="field" value={input} placeholder="owner/repo or https://github.com/owner/repo/tree/main/src" onChange={(e) => setInput(e.target.value)} />
        </label>
        <Pill type="submit" ink={!repo} disabled={!input.trim() || !!busy}>
          Look up
        </Pill>
      </form>
      <p className="cap" role="status" aria-live="polite">
        {busy ?? (error ? "" : repo ? "" : "Public repositories only. No sign-in, nothing is sent but the address.")}
      </p>
      {error && (
        <p className="code-error" role="alert">
          {error}
        </p>
      )}
      {repo && (
        <>
          <div className="code-repo">
            <div>
              <b>
                {repo.owner}/{repo.repo}
              </b>
              <span className="cap"> @ {repo.ref}</span>
              {repo.description && <p className="dialog-body">{repo.description}</p>}
            </div>
            <span className={`tag ${repo.license ? "" : "assume"}`}>{repo.license ?? "no licence"}</span>
          </div>
          {!repo.license && <p className="cap guess">No licence is stated, so you can read and cite this code, but not reuse it. The pack will tell your AI the same.</p>}
          <div className="code-row">
            <label className="lbl">
              <span className="cap">filter {files.length} files</span>
              <input className="field" value={filter} placeholder="src/, .ts, README…" onChange={(e) => setFilter(e.target.value)} />
            </label>
          </div>
          <div className="code-files-head">
            <label className="check">
              <input
                type="checkbox"
                checked={allShownPicked}
                onChange={(e) =>
                  setPicked((p) =>
                    e.target.checked
                      ? [...new Set([...p, ...pickable.map((f) => f.path)])].slice(0, MAX_IMPORT_FILES)
                      : p.filter((x) => !pickable.some((f) => f.path === x)),
                  )
                }
              />
              Select shown
            </label>
            <span className="cap">
              {picked.length} of {MAX_IMPORT_FILES} max picked
              {hidden ? ` · ${hidden} binary, large or generated files hidden` : ""}
              {truncated ? " · very large repo, list is partial" : ""}
            </span>
          </div>
          <ul className="code-files" aria-label="Files in the repository">
            {pickable.map((f) => (
              <li key={f.path}>
                <label className="check">
                  <input type="checkbox" checked={picked.includes(f.path)} disabled={!picked.includes(f.path) && picked.length >= MAX_IMPORT_FILES} onChange={() => toggle(f.path)} />
                  <span className="code-path">{f.path}</span>
                </label>
                <span className="cap">
                  {languageFor(f.path)} · {f.size < 1024 ? `${f.size} B` : `${Math.round(f.size / 1024)} KB`}
                </span>
              </li>
            ))}
            {!pickable.length && <li className="cap">No readable files match.</li>}
            {shown.length > pickable.length && <li className="cap">and {shown.length - pickable.length} more. Narrow the filter to see them.</li>}
          </ul>
        </>
      )}
      <div className="dialog-actions">
        <Pill onClick={onClose}>Cancel</Pill>
        <Pill ink disabled={!repo || !picked.length || !!busy} onClick={() => void save()}>
          {picked.length ? `Save ${picked.length} file${picked.length === 1 ? "" : "s"}` : "Save files"}
        </Pill>
      </div>
    </div>
  );
}
