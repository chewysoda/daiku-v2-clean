import { describe, expect, it } from "vitest";
import { blobUrl, codeTags, fence, isReadable, languageFor, languageOf, lineCount, parseRepoInfo, parseRepoInput, parseTree, rawUrl, repoCredit } from "./github";

describe("parseRepoInput", () => {
  it("reads owner/repo shorthand", () => {
    expect(parseRepoInput("tauri-apps/tauri")).toEqual({ owner: "tauri-apps", repo: "tauri", ref: null, path: "" });
  });
  it("reads repo, folder and file links", () => {
    expect(parseRepoInput("https://github.com/a/b.git")).toEqual({ owner: "a", repo: "b", ref: null, path: "" });
    expect(parseRepoInput("github.com/a/b/tree/main/src/lib/")).toEqual({ owner: "a", repo: "b", ref: "main", path: "src/lib" });
    expect(parseRepoInput("https://github.com/a/b/blob/v1.2/src/x%20y.ts")).toEqual({ owner: "a", repo: "b", ref: "v1.2", path: "src/x y.ts" });
    expect(parseRepoInput("https://raw.githubusercontent.com/a/b/main/README.md")).toEqual({ owner: "a", repo: "b", ref: "main", path: "README.md" });
  });
  it("refuses anything that isn't GitHub", () => {
    for (const bad of ["", "hello", "https://gitlab.com/a/b", "https://github.com/a", "https://github.com.evil.example/a/b", "javascript:alert(1)"]) {
      expect(parseRepoInput(bad), bad).toBeNull();
    }
  });
});

describe("files", () => {
  it("names languages from file names", () => {
    expect(languageFor("src/app.tsx")).toBe("tsx");
    expect(languageFor("Dockerfile")).toBe("dockerfile");
    expect(languageFor("notes.weird")).toBe("text");
  });
  it("offers source and docs, not binaries, lockfiles or vendored code", () => {
    expect(isReadable({ path: "src/main.rs", size: 900 })).toBe(true);
    expect(isReadable({ path: "README.md", size: 900 })).toBe(true);
    expect(isReadable({ path: "logo.png", size: 900 })).toBe(false);
    expect(isReadable({ path: "package-lock.json", size: 900 })).toBe(false);
    expect(isReadable({ path: "node_modules/x/index.js", size: 900 })).toBe(false);
    expect(isReadable({ path: "src/huge.ts", size: 5_000_000 })).toBe(false);
  });
  it("reads the tree, keeping only files under the chosen folder", () => {
    const json = { truncated: false, tree: [{ type: "blob", path: "src/a.ts", size: 10 }, { type: "tree", path: "src" }, { type: "blob", path: "docs/b.md", size: 5 }] };
    expect(parseTree(json).files).toHaveLength(2);
    expect(parseTree(json, "src").files).toEqual([{ path: "src/a.ts", size: 10 }]);
  });
});

describe("credit and links", () => {
  const info = parseRepoInfo({ owner: { login: "Ada" }, name: "engine", default_branch: "dev", license: { spdx_id: "MIT" }, html_url: "https://github.com/Ada/engine" }, { owner: "ada", repo: "engine", ref: null, path: "" });
  it("uses the default branch and the stated licence", () => {
    expect(info.ref).toBe("dev");
    expect(repoCredit(info)).toBe("Ada/engine (MIT)");
  });
  it("says so when no licence is stated", () => {
    const none = parseRepoInfo({ license: { spdx_id: "NOASSERTION" } }, { owner: "a", repo: "b", ref: "main", path: "" });
    expect(repoCredit(none)).toBe("a/b (no licence stated)");
  });
  it("builds raw and page links with encoded paths", () => {
    expect(rawUrl(info, "src/my file.ts")).toBe("https://raw.githubusercontent.com/Ada/engine/dev/src/my%20file.ts");
    expect(blobUrl(info, "src/a.ts")).toBe("https://github.com/Ada/engine/blob/dev/src/a.ts");
  });
});

describe("code text", () => {
  it("keeps the language in a tag that survives edits", () => {
    expect(codeTags("rust", "code lang:ts github mine")).toBe("code lang:rust github mine");
    expect(languageOf({ tags: "code lang:python", title: "x.ts" })).toBe("python");
    expect(languageOf({ tags: "", title: "x.ts" })).toBe("typescript");
  });
  it("fences code so backticks inside can't close the block", () => {
    expect(fence("const a = 1;\n", "typescript")).toBe("```typescript\nconst a = 1;\n```");
    expect(fence("x = ```y```", "text")).toBe("````\nx = ```y```\n````");
  });
  it("counts lines", () => {
    expect(lineCount("")).toBe(0);
    expect(lineCount("a\nb\n")).toBe(2);
  });
});
