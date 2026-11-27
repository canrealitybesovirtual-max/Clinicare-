/**
 * Goal writer and goal attainment scaling (tools/goals). Pure: no React, no I/O, no storage.
 *
 * - Goal templates follow how each orientation writes goals (content/orientations goalStyle, shown next to the
 *   template; each template carries its own short guidance for when that profile is missing). Slot text is typed by
 *   the clinician through the PHI scrubber and scrubbed again here before it reaches an export (G5).
 * - The SMART check reports which parts are present from what was filled in and ticked; it never judges a goal.
 * - Goal attainment scaling: the Kiresuk and Sherman (1968) T-score with the conventional inter-goal correlation of
 *   0.3 described by Turner-Stokes (2009). A method, not a licensed measure.
 * - Exports print one blank line for the name, written by hand (G5). Text that mentions substance use makes the export carry the
 *   42 CFR Part 2 notice (G6). Never a diagnosis or code (G3).
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import type { Source } from "@/lib/schemas";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import type { DocBlock, DocSpec } from "./doc-model";

/* ------------------------------------------------------------------ goal templates */

export const SMART_PARTS = ["specific", "measurable", "agreed", "relevant", "timeBound"] as const;
export type SmartPart = (typeof SMART_PARTS)[number];
export const SMART_LABELS: Record<SmartPart, string> = {
  specific: "Specific",
  measurable: "Measurable",
  agreed: "Agreed",
  relevant: "Relevant",
  timeBound: "Time-bound",
};

/** The three text slots every template fills, in sentence order. */
export const GOAL_SLOTS = ["aim", "context", "marker"] as const;
export type GoalSlotId = (typeof GOAL_SLOTS)[number];

export interface GoalSlot {
  label: string;
  hint: string;
  /** Joins the slot to the sentence (for example "when", "noticed by"); empty for the first slot. */
  lead: string;
}

export interface GoalTemplate {
  id: string;
  label: string;
  /** The orientation profile whose goalStyle is shown with this template (content/orientations), if any. */
  orientationId: string | null;
  /** Short built-in guidance, used when the orientation profile is not available. */
  guidance: string;
  /** Optional first choice (target level, problem area or phase) that opens the goal sentence. */
  focus?: { label: string; options: readonly string[] };
  slots: Record<GoalSlotId, GoalSlot>;
}

export const GOAL_TEMPLATES: readonly GoalTemplate[] = [
  {
    id: "behavioral",
    label: "Behavioral",
    orientationId: "behavior-therapy",
    guidance: "Name an observable behavior, the situation, how often, and by when.",
    slots: {
      aim: { label: "Behavior", hint: "What the client will do, so someone could see it. For example: go for a 20-minute walk.", lead: "" },
      context: { label: "Situation and frequency", hint: "For example: on weekday mornings, 4 days a week.", lead: "" },
      marker: { label: "How you will both notice", hint: "For example: ticks on the activity log.", lead: "tracked by" },
    },
  },
  {
    id: "cognitive",
    label: "Cognitive",
    orientationId: "cognitive-therapy",
    guidance: "Link the goal to the formulation: a belief to test or a behavior to change, with a rating or count.",
    slots: {
      aim: { label: "Belief or pattern to work on", hint: "For example: test the prediction that people will laugh if I speak up.", lead: "" },
      context: { label: "Where it will be tested", hint: "For example: in two team meetings.", lead: "in" },
      marker: { label: "How change will show", hint: "For example: belief rating below 40 (from 80).", lead: "with" },
    },
  },
  {
    id: "act",
    label: "Acceptance and commitment",
    orientationId: "acceptance-and-commitment-therapy",
    guidance: "Write a valued direction and committed actions; progress is action, not feelings going away.",
    slots: {
      aim: { label: "Committed action", hint: "For example: call one friend.", lead: "" },
      context: { label: "Value it serves and when", hint: "For example: in the service of connection, each week.", lead: "" },
      marker: { label: "How you will both notice", hint: "For example: the number of weeks with a call, even when anxious.", lead: "noticed by" },
    },
  },
  {
    id: "dbt",
    label: "Dialectical behavior therapy",
    orientationId: "dialectical-behavior-therapy",
    guidance: "Follow the target order: safety first, then whatever interferes with therapy, then quality of life. Trained clinicians only for full treatment.",
    focus: { label: "Target level", options: ["Safety target", "Therapy-interfering target", "Quality-of-life target"] },
    slots: {
      aim: { label: "Target and skill", hint: "For example: use a distress tolerance skill instead of leaving work.", lead: "" },
      context: { label: "When", hint: "For example: when urges rise above 7 out of 10.", lead: "" },
      marker: { label: "How it will be tracked", hint: "For example: diary card entries reviewed each session.", lead: "tracked by" },
    },
  },
  {
    id: "psychodynamic",
    label: "Psychodynamic",
    orientationId: "psychodynamic-therapy",
    guidance: "Name a relational or emotional pattern and how change will show in specific situations.",
    slots: {
      aim: { label: "Pattern to understand and loosen", hint: "For example: notice the pull to withdraw when feeling criticized.", lead: "" },
      context: { label: "Where it shows", hint: "For example: with my manager and in our sessions.", lead: "" },
      marker: { label: "How change will show", hint: "For example: saying what I need at least once instead of going quiet.", lead: "shown by" },
    },
  },
  {
    id: "interpersonal",
    label: "Interpersonal",
    orientationId: "interpersonal-therapies",
    guidance: "Tie the goal to one problem area and state the interpersonal change in observable terms.",
    focus: { label: "Problem area", options: ["Grief", "Role dispute", "Role transition", "Isolation or interpersonal sensitivity"] },
    slots: {
      aim: { label: "Interpersonal change", hint: "For example: have one conversation with my partner about sharing chores.", lead: "" },
      context: { label: "When", hint: "For example: in the next two weeks.", lead: "" },
      marker: { label: "How you will both notice", hint: "For example: a plan we both agree to try.", lead: "leading to" },
    },
  },
  {
    id: "humanistic",
    label: "Humanistic and experiential",
    orientationId: "humanistic-experiential-therapy",
    guidance: "Let the client define the goal from their own experience; it may describe a way of being.",
    slots: {
      aim: { label: "What the client wants to experience", hint: "For example: feel able to speak up about what I want.", lead: "" },
      context: { label: "Where it matters most", hint: "For example: with my family.", lead: "" },
      marker: { label: "How the client will know", hint: "For example: in my own words at each review.", lead: "noticed" },
    },
  },
  {
    id: "solution-focused",
    label: "Solution-focused",
    orientationId: "narrative-and-solution-focused-therapy",
    guidance: "Describe signs that the preferred future is happening, on a scale the client chooses.",
    slots: {
      aim: { label: "Sign of the preferred future", hint: "For example: leave the house on time without arguing.", lead: "" },
      context: { label: "When", hint: "For example: on school mornings.", lead: "" },
      marker: { label: "Scale movement", hint: "For example: from 3 to 5 on my 0 to 10 scale.", lead: "moving" },
    },
  },
  {
    id: "motivational",
    label: "Motivational interviewing",
    orientationId: null,
    guidance: "State the change the client chooses and the next step they commit to, in their words.",
    slots: {
      aim: { label: "Change the client chooses", hint: "For example: cut down to two evenings a week.", lead: "" },
      context: { label: "First step", hint: "For example: starting with a plan for Friday nights.", lead: "" },
      marker: { label: "How the client will know", hint: "For example: a weekly count I keep.", lead: "checked by" },
    },
  },
  {
    id: "systemic",
    label: "Systemic, family and couples",
    orientationId: "systemic-family-and-couples-therapy",
    guidance: "Describe a change in an interaction pattern that each person can notice, not a change in one person alone.",
    slots: {
      aim: { label: "Pattern change", hint: "For example: use the agreed pause and come back after 20 minutes.", lead: "" },
      context: { label: "When", hint: "For example: when arguments start to escalate.", lead: "" },
      marker: { label: "How each person will notice", hint: "For example: fewer arguments that end with someone leaving.", lead: "noticed by" },
    },
  },
  {
    id: "trauma-phase",
    label: "Trauma-focused, by phase",
    orientationId: "trauma-focused-therapies",
    guidance: "Fit the goal to the phase: safety and skills first, then processing, then rebuilding.",
    focus: { label: "Phase", options: ["Safety and stabilization", "Processing", "Rebuilding and reconnection"] },
    slots: {
      aim: { label: "Goal for this phase", hint: "For example: use a grounding skill to settle after reminders.", lead: "" },
      context: { label: "When", hint: "For example: most days, within a few minutes.", lead: "" },
      marker: { label: "How you will both notice", hint: "For example: self-rated distress at each review.", lead: "tracked by" },
    },
  },
];

export const getGoalTemplate = (id: string): GoalTemplate | undefined => GOAL_TEMPLATES.find((t) => t.id === id);

export const GOAL_SLOT_MAX = 200;
export const MAX_GOALS = 5;
export const MAX_REVIEW_SESSION = 200;

export interface GoalDraft {
  templateId: string;
  /** One of the template's focus options, or "" for none. */
  focus: string;
  slots: Record<GoalSlotId, string>;
  /** The client says this is their goal (ticked by the clinician). */
  agreed: boolean;
  /** Linked to what brought the client in and to the formulation (ticked by the clinician). */
  relevant: boolean;
  /** Review at this session number, or null. Session numbers, never dates (G5). */
  reviewSession: number | null;
}

export const emptyGoalDraft = (templateId: string): GoalDraft => ({
  templateId,
  focus: "",
  slots: { aim: "", context: "", marker: "" },
  agreed: false,
  relevant: false,
  reviewSession: null,
});

const tidy = (s: string) => scrubPHI(s).clean.replace(/\s+/g, " ").trim().replace(/[.;,\s]+$/, "");

/** The goal as one sentence, or "" until the aim is filled in. Slot text is scrubbed again here (G5). */
export function composeGoal(d: GoalDraft): string {
  const t = getGoalTemplate(d.templateId);
  if (!t) return "";
  const aim = tidy(d.slots.aim);
  if (!aim) return "";
  const parts = GOAL_SLOTS.map((id) => {
    const text = tidy(d.slots[id]);
    if (!text) return "";
    const lead = t.slots[id].lead;
    return lead && !text.toLowerCase().startsWith(lead) ? `${lead} ${text}` : text;
  }).filter(Boolean);
  const focus = t.focus?.options.includes(d.focus) ? d.focus : "";
  const review = d.reviewSession ? `, reviewed at session ${d.reviewSession}` : "";
  const body = parts.join(", ");
  const sentence = focus ? `${focus}: ${body}` : `${body.charAt(0).toUpperCase()}${body.slice(1)}`;
  return `${sentence}${review}.`;
}

/** Which SMART parts are present. Specific needs the aim and its situation; agreed and relevant are the clinician's ticks. */
export function smartCheck(d: GoalDraft): Record<SmartPart, boolean> {
  return {
    specific: tidy(d.slots.aim) !== "" && tidy(d.slots.context) !== "",
    measurable: tidy(d.slots.marker) !== "",
    agreed: d.agreed,
    relevant: d.relevant,
    timeBound: d.reviewSession !== null,
  };
}

/** Why a review session number cannot be used, or null when it is valid. */
export function reviewSessionError(n: number): string | null {
  return Number.isInteger(n) && n >= 1 && n <= MAX_REVIEW_SESSION ? null : `Review session must be a whole number from 1 to ${MAX_REVIEW_SESSION}.`;
}

/* ------------------------------------------------------------------ goal attainment scaling */

/** GAS levels from much less than expected (-2) to much more than expected (+2). */
export const GAS_LEVELS = [-2, -1, 0, 1, 2] as const;
export type GasLevel = (typeof GAS_LEVELS)[number];
export const GAS_LEVEL_LABELS: Record<GasLevel, string> = {
  [-2]: "Much less than expected",
  [-1]: "Somewhat less than expected",
  0: "Expected level",
  1: "Somewhat more than expected",
  2: "Much more than expected",
};
export const levelLabel = (l: GasLevel) => `${l > 0 ? `+${l}` : l} ${GAS_LEVEL_LABELS[l]}`;

/** Correlation between goal scores assumed by convention (Kiresuk and Sherman 1968; Turner-Stokes 2009). */
export const GAS_RHO = 0.3;
export const MAX_GAS_GOALS = 3;
export const GAS_WEIGHTS = [1, 2, 3] as const;
export type GasWeight = (typeof GAS_WEIGHTS)[number];

export interface GasGoal {
  title: string;
  /** Description of each level, keyed by level. */
  levels: Record<`${GasLevel}`, string>;
  weight: GasWeight;
  baseline: GasLevel;
  /** Level at review, or null until rated. */
  outcome: GasLevel | null;
}

export const emptyGasGoal = (expected = ""): GasGoal => ({
  title: "",
  levels: { "-2": "", "-1": "", "0": expected, "1": "", "2": "" },
  weight: 1,
  baseline: -1,
  outcome: null,
});

/**
 * Kiresuk and Sherman T-score: 50 + 10 * sum(w*x) / sqrt((1 - rho) * sum(w^2) + rho * (sum w)^2), rounded to one
 * decimal. 50 means goals were met as expected. Null when there are no goals.
 */
export function gasTScore(items: readonly { weight: number; level: number }[], rho = GAS_RHO): number | null {
  if (items.length === 0) return null;
  const sumWX = items.reduce((s, i) => s + i.weight * i.level, 0);
  const sumW2 = items.reduce((s, i) => s + i.weight * i.weight, 0);
  const sumW = items.reduce((s, i) => s + i.weight, 0);
  const t = 50 + (10 * sumWX) / Math.sqrt((1 - rho) * sumW2 + rho * sumW * sumW);
  return Math.round(t * 10) / 10;
}

export interface GasSummary {
  baselineT: number | null;
  /** Null until every goal has an outcome rating. */
  reviewT: number | null;
  rated: number;
}

export function gasSummary(goals: readonly GasGoal[]): GasSummary {
  const rated = goals.filter((g) => g.outcome !== null);
  return {
    baselineT: gasTScore(goals.map((g) => ({ weight: g.weight, level: g.baseline }))),
    reviewT: goals.length > 0 && rated.length === goals.length ? gasTScore(rated.map((g) => ({ weight: g.weight, level: g.outcome as number }))) : null,
    rated: rated.length,
  };
}

/** Plain meaning of a T-score, for the screen and export. Never a judgment about the client. */
export function gasMeaning(t: number): string {
  if (t > 50) return "Above 50: goals were met better than expected overall.";
  if (t < 50) return "Below 50: goals were met less than expected overall.";
  return "50: goals were met at the expected level overall.";
}

/* ------------------------------------------------------------------ export */

export const GOALS_SOURCES: Source[] = [
  {
    title: "Goal attainment scaling: a general method for evaluating comprehensive community mental health programs (Kiresuk and Sherman)",
    publisher: "Community Mental Health Journal, via PubMed",
    url: "https://pubmed.ncbi.nlm.nih.gov/24185570/",
    year: 1968,
  },
  {
    title: "Goal attainment scaling (GAS) in rehabilitation: a practical guide (Turner-Stokes)",
    publisher: "Clinical Rehabilitation, via PubMed",
    url: "https://pubmed.ncbi.nlm.nih.gov/19179355/",
    year: 2009,
  },
  {
    title: "Writing SMART rehabilitation goals and achieving goal attainment scaling: a practical guide (Bovend'Eerdt, Botell and Wade)",
    publisher: "Clinical Rehabilitation, via PubMed",
    url: "https://pubmed.ncbi.nlm.nih.gov/19237435/",
    year: 2009,
  },
];

export interface GoalsDocInput {
  goals: readonly string[];
  gas: readonly GasGoal[];
}

const clean = (s: string) => scrubPHI(s).clean.trim();

/** All typed text in the document, scrubbed: used for the Part 2 check. */
function allText(input: GoalsDocInput): string[] {
  return [...input.goals, ...input.gas.flatMap((g) => [g.title, ...Object.values(g.levels)])].map(clean);
}

/** True when any typed text mentions substance use, so the export carries the Part 2 notice (G6). */
export function goalsRecordSubstanceUse(input: GoalsDocInput): boolean {
  return allText(input).some((t) => t !== "" && mentionsSubstanceUse(t));
}

/** The printable goal sheet: blank lines for name and date, goals, the GAS table as text, crisis box (G9). */
export function goalsDoc(input: GoalsDocInput): DocSpec {
  const blocks: DocBlock[] = [
    { kind: "title", text: "Therapy goals" },
    // One blank name line, written by hand, as on every other export (G5).
    { kind: "fill", label: "Name" },
    { kind: "paragraph", text: "Agreed together and reviewed at the sessions named. Written without identifiers.", style: "muted" },
  ];
  const goals = input.goals.map(clean).filter(Boolean);
  if (goals.length) blocks.push({ kind: "heading", text: "Goals" }, { kind: "list", items: goals });
  const gas = input.gas.filter((g) => clean(g.title) || Object.values(g.levels).some((l) => clean(l)));
  if (gas.length) {
    blocks.push({ kind: "heading", text: "Goal attainment scaling" });
    gas.forEach((g, i) => {
      blocks.push({ kind: "paragraph", text: `Goal ${i + 1}: ${clean(g.title) || "(untitled)"} (weight ${g.weight})`, style: "bold" });
      blocks.push({
        kind: "list",
        items: [...GAS_LEVELS].reverse().map((l) => `${levelLabel(l)}: ${clean(g.levels[`${l}`]) || "____"}`),
      });
      blocks.push({
        kind: "paragraph",
        text: `Starting level: ${levelLabel(g.baseline)}. Level at review: ${g.outcome === null ? "____" : levelLabel(g.outcome)}.`,
      });
    });
    const s = gasSummary(gas);
    const lines = [
      s.baselineT !== null ? `Starting T-score: ${s.baselineT}.` : "",
      s.reviewT !== null ? `Review T-score: ${s.reviewT}. ${gasMeaning(s.reviewT)}` : "Review T-score: ____",
      `Kiresuk and Sherman formula, assumed correlation between goals ${GAS_RHO}. A personal scale: not comparable between people.`,
    ].filter(Boolean);
    blocks.push({ kind: "paragraph", text: lines.join(" "), style: "muted" });
  }
  blocks.push({ kind: "heading", text: "Notes" }, { kind: "write", lines: 3 }, { kind: "crisis" });
  return { title: "Therapy goals", blocks, part2: goalsRecordSubstanceUse(input) };
}
