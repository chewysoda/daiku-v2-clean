/** Starting points for a decision, so that a new one isn't a blank table. Weights are only a first guess, and are editable. */
export interface LabTemplate {
  id: string;
  label: string;
  placeholder: string;
  criteria: [name: string, weightPercent: number][];
}

export const LAB_TEMPLATES: LabTemplate[] = [
  { id: "blank", label: "Blank", placeholder: "What are you choosing between?", criteria: [] },
  {
    id: "product",
    label: "Product or design",
    placeholder: "Which chair base?",
    criteria: [["Usability", 25], ["Look and feel", 20], ["Cost", 20], ["Durability", 15], ["Ease of making", 10], ["Sustainability", 10]],
  },
  {
    id: "engineering",
    label: "Engineering",
    placeholder: "Which bracket design?",
    criteria: [["Strength", 25], ["Weight", 20], ["Cost", 20], ["Manufacturability", 20], ["Reliability", 15]],
  },
  {
    id: "software",
    label: "Software or tools",
    placeholder: "Which database?",
    criteria: [["Fit for the job", 30], ["Reliability", 20], ["Cost", 15], ["Ease of use", 15], ["Support and community", 10], ["Security", 10]],
  },
  {
    id: "research",
    label: "Research method",
    placeholder: "Survey or interviews?",
    criteria: [["Answers the question", 35], ["Reliability of results", 25], ["Time", 20], ["Cost", 10], ["Ethics and access", 10]],
  },
  {
    id: "buying",
    label: "Buying something",
    placeholder: "Which laptop?",
    criteria: [["Price", 30], ["Quality", 30], ["Features", 20], ["Reviews", 10], ["Warranty and support", 10]],
  },
  {
    id: "business",
    label: "Business or strategy",
    placeholder: "Which market first?",
    criteria: [["Value to customers", 30], ["Revenue potential", 25], ["Cost and effort", 20], ["Risk", 15], ["Strategic fit", 10]],
  },
];

export const templateById = (id: string) => LAB_TEMPLATES.find((t) => t.id === id) ?? LAB_TEMPLATES[0];

export interface DecisionSummary {
  concepts: number;
  criteria: number;
  scored: number;
  /** Cells a score could fill. */
  cells: number;
  guesses: number;
}

/** How far along a decision is, for the all-projects view. */
export function summarise(
  decisionId: string,
  concepts: { id: string; decision_id: string }[],
  criteria: { id: string; decision_id: string }[],
  scores: { concept_id: string; criterion_id: string; is_assumption: boolean }[],
): DecisionSummary {
  const own = new Set(concepts.filter((c) => c.decision_id === decisionId).map((c) => c.id));
  const ownCriteria = new Set(criteria.filter((c) => c.decision_id === decisionId).map((c) => c.id));
  const live = scores.filter((s) => own.has(s.concept_id) && ownCriteria.has(s.criterion_id));
  return {
    concepts: own.size,
    criteria: ownCriteria.size,
    scored: live.length,
    cells: own.size * ownCriteria.size,
    guesses: live.filter((s) => s.is_assumption).length,
  };
}

/** Decisions under each project, with projects by name and unassigned ones last. Projects with none are left out. */
export function groupByProject<D extends { board_id: string | null; title: string }, B extends { id: string; name: string }>(decisions: D[], boards: B[]) {
  const named = [...boards]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({ id: b.id as string | null, name: b.name, decisions: decisions.filter((d) => d.board_id === b.id) }))
    .filter((g) => g.decisions.length);
  const known = new Set(boards.map((b) => b.id));
  const loose = decisions.filter((d) => !d.board_id || !known.has(d.board_id));
  return loose.length ? [...named, { id: null, name: "No project", decisions: loose }] : named;
}
