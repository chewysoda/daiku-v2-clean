/** What the AI should hand back, in the person's words. Goes into CLAUDE.md. */

export type DeliverableKind = "" | "plan" | "spec" | "ui-brief" | "code-task" | "research-summary";
export interface Deliverable {
  kind: DeliverableKind;
  depth: "short" | "standard" | "thorough";
  format: string;
  tone: string;
  constraints: string;
}
export const EMPTY_DELIVERABLE: Deliverable = { kind: "", depth: "standard", format: "", tone: "", constraints: "" };

export const DELIVERABLES: { kind: Exclude<DeliverableKind, "">; label: string; ask: string }[] = [
  { kind: "plan", label: "Plan", ask: "a build plan in small steps I can check one at a time" },
  { kind: "spec", label: "Specification", ask: "a specification: features, screens, data and acceptance criteria" },
  { kind: "ui-brief", label: "UI brief", ask: "a UI brief: layout, components, states and the reasons behind them" },
  { kind: "code-task", label: "Code task", ask: "working code for the task, with tests, and how to run it" },
  { kind: "research-summary", label: "Research summary", ask: "a research summary that cites its sources and marks what's unproven" },
];

export function parseDeliverable(raw: unknown): Deliverable {
  const d = raw && typeof raw === "object" ? (raw as Partial<Deliverable>) : {};
  return {
    kind: DELIVERABLES.some((x) => x.kind === d.kind) ? (d.kind as DeliverableKind) : "",
    depth: d.depth === "short" || d.depth === "thorough" ? d.depth : "standard",
    format: typeof d.format === "string" ? d.format : "",
    tone: typeof d.tone === "string" ? d.tone : "",
    constraints: typeof d.constraints === "string" ? d.constraints : "",
  };
}

const DEPTH = { short: "Keep it short: the essentials only.", standard: "", thorough: "Be thorough: cover edge cases and say what you'd check." };

export function deliverableMarkdown(d: Deliverable): string {
  const kind = DELIVERABLES.find((x) => x.kind === d.kind);
  const lines = [
    kind ? `Hand back ${kind.ask}.` : "",
    DEPTH[d.depth],
    d.format.trim() ? `Format: ${d.format.trim()}` : "",
    d.tone.trim() ? `Tone: ${d.tone.trim()}` : "",
    d.constraints.trim() ? `Technical constraints: ${d.constraints.trim()}` : "",
  ].filter(Boolean);
  return lines.length ? `## What to hand back\n\n${lines.join("\n\n")}\n\n` : "";
}
