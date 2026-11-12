import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "../data/store";
import { addLines, buildPrompts, designMarkdown, EMPTY_SPEC, lines, musts, pairs, parseMust, parseSpec, rulesMarkdown, setCheck, specGaps, specMarkdown } from "./appSpec";
import { buildClaudePack, claudePrompt } from "./claudePack";
import { EMPTY_PLAN, parsePlan, setIncluded } from "./packPlan";

vi.mock("./saveFile", async (real) => ({ ...(await real<object>()), fetchBytes: async () => new Uint8Array([1]) }));

type S = ReturnType<typeof useStore.getState>;

const spec = {
  ...EMPTY_SPEC,
  name: "Proto Tracker",
  pitch: "Tracks chair prototypes",
  must: "- Log a test\n2. Export results\n\n",
  should: "Share a link",
  later: "Mobile app",
  screens: "Dashboard: see every prototype\nSettings",
  entities: "Prototype: name, mass",
};

const palette = (id: string, board_id: string, colors: string[], caption?: string) => ({ id, board_id, kind: "palette", x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, asset_id: null, data: { colors, caption }, updated_at: "" });

const project = () =>
  ({
    assets: [],
    boards: [
      { id: "b1", name: "Look", version: 1, share: {}, created_at: "", updated_at: "", is_sample: false },
      { id: "b2", name: "Private", version: 1, share: {}, created_at: "", updated_at: "", is_sample: false },
    ],
    board_items: [palette("p1", "b1", ["#112233"]), palette("p2", "b2", ["#ABCDEF"])],
    claims: [],
    evidence_links: [],
    decisions: [],
    concepts: [],
    criteria: [],
    scores: [],
    records: [],
    workflow_log: [],
    comments: [],
  }) as unknown as S;

describe("reading what was typed", () => {
  it("takes one item a line, without list marks or blanks", () => {
    expect(lines(spec.must)).toEqual(["Log a test", "Export results"]);
  });
  it("splits names from details at the first colon only", () => {
    expect(pairs("A: b: c\nD")).toEqual([{ name: "A", detail: "b: c" }, { name: "D", detail: "" }]);
  });
  it("doesn't double lines brought in twice", () => {
    expect(addLines("One", ["one", "Two"])).toBe("One\nTwo");
  });
  it("survives a damaged saved spec", () => {
    expect(parseSpec(null)).toEqual(EMPTY_SPEC);
    expect(parseSpec({ name: 3, pitch: "x" })).toEqual({ ...EMPTY_SPEC, pitch: "x" });
    expect(parsePlan('{"app":"nope"}').app).toEqual(EMPTY_SPEC);
    expect(parsePlan(JSON.stringify({ app: spec })).app).toEqual(spec);
  });
});

describe("an empty spec", () => {
  it("says what's undecided rather than inventing it", () => {
    const md = specMarkdown(EMPTY_SPEC, []);
    expect(md).toContain("Not decided. Ask before assuming.");
    expect(md).toContain("Recommend something with reasons");
    expect(specGaps(EMPTY_SPEC)).toContain("Who it's for");
  });
  it("still gives a way to start, and no prompts for screens that don't exist", () => {
    const titles = buildPrompts(EMPTY_SPEC).map((p) => p.title);
    expect(titles).toEqual(["Start here", "Set up the project", "Check it against the spec"]);
    expect(buildPrompts(EMPTY_SPEC)[1].body).toContain("wait for my OK");
  });
});

describe("the prompts", () => {
  const prompts = buildPrompts(spec);
  it("run in a sensible order, one each for screens and must-haves", () => {
    expect(prompts.map((p) => p.title)).toEqual(["Start here", "Set up the project", "Build the data model", "Screen - Dashboard", "Screen - Settings", "Feature - Log a test", "Feature - Export results", "Should-have features", "Check it against the spec"]);
  });
  it("are numbered files with safe names", () => {
    expect(prompts[0].file).toBe("prompts/00 Start here.md");
    expect(prompts[3].file).toBe("prompts/03 Screen - Dashboard.md");
    for (const p of buildPrompts({ ...spec, must: 'a/b:c*?"d' })) expect(p.file.slice("prompts/".length)).not.toMatch(/[\\/:*?"]/);
  });
  it("hold back later features", () => {
    expect(prompts.map((p) => p.title).join()).not.toContain("Mobile app");
    expect(prompts.find((p) => p.title === "Should-have features")!.body).toContain("Don't start these yet:\n- Mobile app");
  });
});

describe("design", () => {
  it("uses only colours that were saved", () => {
    const empty = designMarkdown(EMPTY_SPEC, []);
    expect(empty).toContain("None saved");
    expect(empty).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe("in the zip", () => {
  const pack = async (plan = { ...EMPTY_PLAN, app: spec }) => {
    const files = unzipSync((await buildClaudePack(project(), { brief: "", includeFiles: false, includeSamples: true, plan })).bytes);
    return { names: Object.keys(files), text: (p: string) => strFromU8(files[p]) };
  };
  it("adds the spec, the design and the prompts", async () => {
    const { names, text } = await pack();
    expect(names).toContain("app/SPEC.md");
    expect(names).toContain("app/DESIGN.md");
    expect(names).toContain("prompts/00 Start here.md");
    expect(text("app/SPEC.md")).toContain("Proto Tracker");
    expect(text("prompts/03 Screen - Dashboard.md")).toContain("see every prototype");
  });
  it("points the AI to them, and uses the pitch when there's no brief", async () => {
    const md = (await pack()).text("CLAUDE.md");
    expect(md).toContain("`prompts/`");
    expect(md).toContain("Tracks chair prototypes");
    expect(md).not.toContain("No brief was written");
  });
  it("keeps palettes from boards that were left out away from the design file", async () => {
    const { text } = await pack(setIncluded({ ...EMPTY_PLAN, app: spec }, ["b2"], false));
    expect(text("app/DESIGN.md")).toContain("#112233");
    expect(text("app/DESIGN.md")).not.toContain("#ABCDEF");
    expect(text("app/DESIGN.md")).not.toContain("Private");
  });
  it("gives the spec but not the prompts when pasted as one block", async () => {
    const text = await claudePrompt(project(), { brief: "", includeSamples: true, plan: { ...EMPTY_PLAN, app: spec } });
    expect(text).toContain('<file path="app/SPEC.md">');
    expect(text).not.toContain('<file path="prompts/');
  });
});

describe("a check for each must-have", () => {
  const checked = { ...EMPTY_SPEC, must: "Typed ports => a wire of the wrong type is refused\nPin checks" };

  it("reads the check after the arrow, and none where there isn't one", () => {
    expect(musts(checked)).toEqual([{ text: "Typed ports", check: "a wire of the wrong type is refused" }, { text: "Pin checks", check: "" }]);
    expect(parseMust("A => b => c")).toEqual({ text: "A", check: "b => c" });
    expect(parseMust("=> only a check")).toEqual({ text: "=> only a check", check: "" });
  });

  it("writes, changes and clears one check, leaving the other lines as typed", () => {
    expect(setCheck(checked.must, "pin checks", "  GPIO 34 as an   output shows an error ")).toBe("Typed ports => a wire of the wrong type is refused\nPin checks => GPIO 34 as an output shows an error");
    expect(setCheck(checked.must, "Typed ports", "")).toBe("Typed ports\nPin checks");
    expect(setCheck(checked.must, "Not there", "x")).toBe(checked.must);
  });

  it("doesn't double a requirement that has since been given a check", () => {
    expect(addLines(checked.must, ["Typed ports", "Serial monitor"])).toBe(`${checked.must}\nSerial monitor`);
  });

  it("puts each check in the spec, and says when one is still to decide", () => {
    const md = specMarkdown(checked, []);
    expect(md).toContain("- Typed ports\n  - Check: a wire of the wrong type is refused");
    expect(md).toMatch(/- Pin checks\n {2}- Check: _not decided/);
    expect(specGaps(checked)).toContain("How you'll check 1 must-have");
    expect(specGaps({ ...checked, must: "Typed ports => refused" }).join()).not.toContain("How you'll check");
  });

  it("asks for the check to be shown passing in that feature's prompt", () => {
    const prompts = buildPrompts(checked);
    const typed = prompts.find((p) => p.title === "Feature - Typed ports")!;
    expect(typed.body).toContain("It's done when: a wire of the wrong type is refused");
    expect(typed.body).toContain("Show me that check passing");
    expect(typed.file).not.toContain("=>");
    expect(prompts.find((p) => p.title === "Feature - Pin checks")!.body).toContain("No check has been set");
  });
});

describe("standing rules", () => {
  it("are nothing when none are written", () => {
    expect(rulesMarkdown("")).toBe("");
    expect(rulesMarkdown(undefined)).toBe("");
    expect(rulesMarkdown("  \n ")).toBe("");
  });

  it("go into CLAUDE.md as the person's directions, ahead of how to treat the material", async () => {
    const withRules = { ...project(), config: { claude_rules: "Never add a dependency without asking\n- Don't change files outside src/" } } as unknown as S;
    const { bytes } = await buildClaudePack(withRules, { brief: "Build it", includeFiles: false, includeSamples: true });
    const md = strFromU8(unzipSync(bytes)["CLAUDE.md"]);
    expect(md).toContain("## Rules for this work");
    expect(md).toContain("- Never add a dependency without asking\n- Don't change files outside src/");
    expect(md.indexOf("## Rules for this work")).toBeLessThan(md.indexOf("## How to treat this material"));
    expect(md.indexOf("## What to build")).toBeLessThan(md.indexOf("## Rules for this work"));
    expect(await claudePrompt(withRules, { brief: "Build it", includeSamples: true })).toContain("Never add a dependency without asking");
  });

  it("leave CLAUDE.md alone when there are none", async () => {
    const { bytes } = await buildClaudePack(project(), { brief: "Build it", includeFiles: false, includeSamples: true });
    expect(strFromU8(unzipSync(bytes)["CLAUDE.md"])).not.toContain("Rules for this work");
  });
});
