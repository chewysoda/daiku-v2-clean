import { describe, expect, it } from "vitest";
import { baseRepoMarkdown, siteModelPath, siteModelsMarkdown } from "./claudePack";
import { EMPTY_PLAN, parsePlan } from "./packPlan";
import { BUILT_IN_TEMPLATES } from "./packs";
import { Asset } from "../data/types";

const model = (over: Partial<Asset>): Asset => ({ id: "m1", kind: "3d", title: "Chair shell", credit: "yours", file_path: "C:/x/chair.glb", preview: null, ...over }) as Asset;

describe("building on a repository", () => {
  it("says nothing when there's no repository, or only the template's placeholder", () => {
    expect(baseRepoMarkdown("")).toBe("");
    expect(baseRepoMarkdown("owner/repo")).toBe("");
  });

  it("gives a clone command, with the branch from a link, and the licence rule", () => {
    const md = baseRepoMarkdown("https://github.com/acme/tool/tree/dev");
    expect(md).toContain("git clone --branch dev https://github.com/acme/tool.git");
    expect(md).toContain("Keep the licence file");
    expect(baseRepoMarkdown("acme/tool")).toContain("git clone https://github.com/acme/tool.git");
  });
});

describe("3D models for the site", () => {
  it("puts each model under site/models with its own extension", () => {
    expect(siteModelPath(model({}))).toBe("site/models/Chair shell.glb");
    expect(siteModelPath(model({ file_path: "C:/x/part.STL" }))).toBe("site/models/Chair shell.stl");
  });

  it("lists the models with their credit and how to show them", () => {
    expect(siteModelsMarkdown([])).toBe("");
    const md = siteModelsMarkdown([model({}), model({ id: "m2", title: "Base", credit: "Acme", file_path: "b.stl" })]);
    expect(md).toContain("`site/models/Chair shell.glb`: Chair shell (made by the person)");
    expect(md).toContain("© Acme");
    expect(md).toContain("STLLoader");
  });

  it("keeps the chosen models when a plan is read back, and drops junk", () => {
    expect(parsePlan(JSON.stringify({ siteModels: ["a", 3, "b"] })).siteModels).toEqual(["a", "b"]);
    expect(parsePlan("{}").siteModels).toEqual(EMPTY_PLAN.siteModels);
  });
});

describe("templates", () => {
  it("has website, app, program and own-version templates", () => {
    const names = BUILT_IN_TEMPLATES.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Website", "App", "Program", "My own version of a tool"]));
    expect(BUILT_IN_TEMPLATES.find((t) => t.id === "tpl-own-version")?.spec.baseRepo).toBeTruthy();
  });
});
