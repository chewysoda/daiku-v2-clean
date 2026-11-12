import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "../data/store";
import { buildClaudePack } from "./claudePack";
import { decisionLogs, decisionsForSpec, recordMarkdown } from "./decisionRecord";
import { EMPTY_PLAN, setIncluded } from "./packPlan";

vi.mock("./saveFile", async (real) => ({ ...(await real<object>()), fetchBytes: async () => new Uint8Array([1, 2, 3]) }));

type S = ReturnType<typeof useStore.getState>;

const rec = (id: string, parent: string, created_at: string, data: object) => ({ id, type: "decision_log", parent_id: parent, data, created_at, updated_at: created_at, is_sample: false });
const asset = (id: string, title: string) => ({ id, kind: "image", title, file_path: `C:\\Users\\someone\\${id}.png`, preview: null, source_url: null, credit: "Rao 2021", via: "", tags: "", notes: "", is_sample: false });
const link = (id: string, asset_id: string, target_id: string, over: object = {}) => ({ id, asset_id, target_type: "score", target_id, note: "", stance: "for", strength: "strong", source_type: "paper", limitation: "Lab rig only", created_at: "", is_sample: false, ...over });

const earlier = { decision_id: "d", concept_id: "b", title: "Chose B: Steel", reason: "Stiffest", rejected: [{ concept_id: "a", label: "A", name: "Ply", reason: "OLDREASON" }], totals: { a: 4, b: 2 } };
const current = { decision_id: "d", concept_id: "a", title: "Chose A: Ply", reason: "Cheapest overall", rejected: [{ concept_id: "b", label: "B", name: "Steel", reason: "Over budget" }], totals: { a: 4, b: 2 } };

function project(): S {
  return {
    assets: [asset("keep", "Beam study"), asset("out", "SECRETTITLE")],
    boards: [],
    board_items: [],
    claims: [],
    decisions: [{ id: "d", board_id: null, title: "Which shell", created_at: "", is_sample: false }],
    concepts: [
      { id: "a", decision_id: "d", label: "A", name: "Ply", asset_id: null, flag: "", sort: 0 },
      { id: "b", decision_id: "d", label: "B", name: "Steel", asset_id: null, flag: "", sort: 1 },
    ],
    criteria: [{ id: "q", decision_id: "d", name: "Cost", weight: 1, sort: 0 }],
    scores: [
      { id: "sa", concept_id: "a", criterion_id: "q", value: 4, is_assumption: false },
      { id: "sb", concept_id: "b", criterion_id: "q", value: 2, is_assumption: false },
    ],
    evidence_links: [link("e1", "keep", "sa"), link("e2", "out", "sb", { limitation: "SECRETLIMIT", note: "SECRETNOTE", stance: "against" })],
    // Written newest first, as nothing says the store keeps them in order.
    records: [rec("new", "d", "2026-11-02T00:00:00Z", current), rec("old", "d", "2026-11-01T00:00:00Z", earlier)],
    workflow_log: [],
    comments: [],
  } as unknown as S;
}

describe("decision record", () => {
  it("orders logs oldest first, whatever order they're stored in", () => {
    expect(decisionLogs(project(), "d").map((l) => l.title)).toEqual(["Chose B: Steel", "Chose A: Ply"]);
  });

  it("is what gets handed in: the choice, the rejections, the scores and the evidence", () => {
    const text = recordMarkdown(project(), "d");
    expect(text).toContain("# Decision record: Which shell");
    expect(text).toContain("**A: Ply**");
    expect(text).toContain("- **B: Steel.** Over budget");
    expect(text).toContain("4.00 (highest)");
    expect(text).toContain("Beam study (Rao 2021)");
    expect(text).toContain("Lab rig only");
    expect(text).toContain("## Earlier records");
    expect(text).toContain("Chose B: Steel: Stiffest");
  });

  it("reports readiness problems instead of hiding them", () => {
    const s = project();
    s.records = [];
    const text = recordMarkdown(s, "d");
    expect(text).toContain("No decision has been logged yet.");
    expect(text).toContain("Not ready");
    expect(text).toContain("Log the decision");
  });

  it("gives the AI brief only the current choice, with the rejections", () => {
    const lines = decisionsForSpec(project());
    expect(lines).toEqual(["Chose A: Ply: Cheapest overall", "Rejected B: Steel: Over budget"]);
  });
});

describe("in the build pack", () => {
  const build = async (excluded: string[]) => {
    const plan = excluded.length ? setIncluded(EMPTY_PLAN, excluded, false) : EMPTY_PLAN;
    const { bytes } = await buildClaudePack(project(), { brief: "Build it", includeFiles: false, includeSamples: false, plan });
    const files = unzipSync(bytes);
    return { names: Object.keys(files), text: (p: string) => strFromU8(files[p]), everything: Object.entries(files).map(([n, b]) => `${n}\n${strFromU8(b)}`).join("\n") };
  };

  it("writes the rejections into the spec and the evidence into the decision file", async () => {
    const { text } = await build([]);
    expect(text("app/SPEC.md")).toContain("Rejected B: Steel: Over budget");
    expect(text("app/SPEC.md")).not.toContain("OLDREASON");
    const decision = text("Decisions/Which shell.md");
    expect(decision).toContain("## Evidence");
    expect(decision).toContain("Lab rig only");
    expect(decision).toContain("Rejected B: Steel. Over budget");
  });

  it("leaves nothing behind of a source that was left out", async () => {
    const { everything } = await build(["out"]);
    expect(everything).toContain("Beam study");
    expect(everything).not.toContain("SECRETTITLE");
    expect(everything).not.toContain("SECRETLIMIT");
    expect(everything).not.toContain("SECRETNOTE");
  });

  it("leaves nothing behind of a decision that was left out", async () => {
    const { everything } = await build(["d"]);
    expect(everything).not.toContain("Over budget");
    expect(everything).not.toContain("Cheapest overall");
  });
});

describe("the store keeps a score honest about its evidence", () => {
  const start = () => {
    useStore.setState({
      assets: [asset("src", "Study")],
      scores: [{ id: "s", concept_id: "a", criterion_id: "q", value: 3, is_assumption: true }],
      evidence_links: [],
    } as unknown as Partial<S>);
    return useStore.getState();
  };
  const guess = () => useStore.getState().scores[0].is_assumption;
  const only = () => useStore.getState().evidence_links[0];

  it("doesn't let evidence against a score stop it being a guess", () => {
    start().linkEvidence("src", "score", "s", "against");
    expect(guess()).toBe(true);
  });

  it("stops being a guess with support, and goes back when that support flips or goes", () => {
    const store = start();
    store.linkEvidence("src", "score", "s");
    expect(guess()).toBe(false);
    store.updateEvidence(only().id, { stance: "against" });
    expect(guess()).toBe(true);
    store.updateEvidence(only().id, { stance: "for" });
    expect(guess()).toBe(false);
    store.unlinkEvidence(only().id);
    expect(guess()).toBe(true);
  });

  it("keeps a rating until someone changes it, and starts with none", () => {
    const store = start();
    store.linkEvidence("src", "score", "s");
    expect(only().strength).toBeUndefined();
    store.updateEvidence(only().id, { strength: "weak", source_type: "paper", limitation: "One site" });
    expect(only()).toMatchObject({ strength: "weak", source_type: "paper", limitation: "One site" });
    expect(guess()).toBe(false);
  });
});
