/**
 * Collaborative safety-planning worksheet (tools/safety-plan). Pure: no React, no I/O.
 *
 * - Original wording, built on the app's own safety-plan handout (content/handouts/safety-plan.json): reasons to
 *   keep going first, then early signs, calming down alone, connecting with people (company and help in one part),
 *   making the space safer, and getting help now. It is not the Stanley-Brown Safety Plan (that form is copyrighted
 *   and needs the authors' written permission for electronic use; licenses.json lists it as pending), so the app
 *   only links to the official site (G7, G8).
 * - It never scores, grades or decides risk (G9). Crisis lines are printed on every plan and can never be removed.
 * - Names and phone numbers are never typed (G5): those parts print blank lines to fill in by hand on the client's
 *   own paper copy. What is typed (signs, calming ideas, kinds of places, safety steps, reasons) passes the PHI
 *   scrubber while typing and again here.
 * - Substance-use wording (for example "keep alcohol out of the house") adds the 42 CFR Part 2 notice (G6).
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import type { Source } from "@/lib/schemas";
import type { DocBlock, DocSpec } from "./doc-model";

export type SafetyPlanSectionId = "reasons" | "early-signs" | "calm-down" | "connect" | "safer-space" | "get-help";

export interface SafetyPlanSection {
  id: SafetyPlanSectionId;
  heading: string;
  /** Plain-language prompt, printed under the heading. */
  prompt: string;
  /** Whether the clinician may type items for this part (never names or numbers). */
  typed: boolean;
  /** Ruled lines printed when nothing is typed. */
  blankLines: number;
  /** Handwritten rows: printed as blank "label" lines, never typed. */
  handwritten?: { label: string; rows: number };
  /** Fixed wording that is always printed (crisis lines). */
  fixed?: string[];
}

export const SAFETY_PLAN_SECTIONS: readonly SafetyPlanSection[] = [
  {
    id: "reasons",
    heading: "My reasons to keep going",
    prompt: "What matters to me: people, pets, faith, plans or things I love to do.",
    typed: true,
    blankLines: 2,
  },
  {
    id: "early-signs",
    heading: "Part 1: Notice my early signs",
    prompt: "What came first the last few hard times: thoughts, feelings in my mood or body, things I start or stop doing.",
    typed: true,
    blankLines: 3,
  },
  {
    id: "calm-down",
    heading: "Part 2: Calm down and get through the next hour",
    prompt: "Things I can do by myself, right where I am, to calm my body, keep my mind busy or bring comfort.",
    typed: true,
    blankLines: 3,
  },
  {
    id: "connect",
    heading: "Part 3: Connect with people",
    prompt:
      "Kinds of places with other people where I feel okay (no addresses). People to be around, and people I can tell that I am not okay, go on the paper copy by hand.",
    typed: true,
    blankLines: 2,
    handwritten: { label: "Person and how to reach them (write by hand)", rows: 3 },
  },
  {
    id: "safer-space",
    heading: "Part 4: Make my space safer",
    prompt: "Steps that put time and distance between me and things I could use to hurt myself, and who will help.",
    typed: true,
    blankLines: 3,
  },
  {
    id: "get-help",
    heading: "Part 5: Get help now",
    prompt: "Help I can reach at any time, day or night. I do not have to wait until things feel bad enough.",
    typed: false,
    blankLines: 0,
    handwritten: { label: "My counselor, doctor or clinic, and how to reach them (write by hand)", rows: 2 },
    fixed: [
      "In the US, call or text 988 (988 Suicide & Crisis Lifeline), or chat at 988lifeline.org.",
      "In danger right now: call 911 or your local emergency number, or go to the nearest emergency room.",
      "Outside the US: find a crisis line at findahelpline.com.",
    ],
  },
];

export const SAFETY_PLAN_TYPED_MAX = 400;

/** Typed items per section: one item per line, scrubbed text only. */
export type SafetyPlanEntries = Partial<Record<SafetyPlanSectionId, string>>;

/** Lines of a typed section, scrubbed again, trimmed, empties dropped. */
export function sectionItems(text: string | undefined): string[] {
  if (!text) return [];
  return scrubPHI(text)
    .clean.split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function safetyPlanMentionsSubstances(entries: SafetyPlanEntries): boolean {
  return Object.values(entries).some((t) => !!t && mentionsSubstanceUse(t));
}

const SAFETY_PLAN_TITLE = "My safety plan";
export const SAFETY_PLAN_ORIGIN_NOTE =
  "This plan was written for this resource in its own words. It is not the Stanley-Brown Safety Plan, which is a separate form your counselor may use instead.";
const SAFETY_PLAN_USE_NOTE =
  "When you notice your early signs, start with Part 2 and keep going down the page. If one idea does not help, try the next. You can go straight to Part 5 at any time.";

/** Official Stanley-Brown resources (link out only, G8). */
export const STANLEY_BROWN_URL = "https://suicidesafetyplan.com/";

export const SAFETY_PLAN_SOURCES: readonly Source[] = [
  {
    title: "Safety planning intervention: a brief intervention to mitigate suicide risk (Stanley & Brown)",
    publisher: "Cognitive and Behavioral Practice",
    url: "https://doi.org/10.1016/j.cbpra.2011.01.001",
    year: 2012,
  },
  {
    title: "VA/DoD Clinical Practice Guideline: Assessment and Management of Patients at Risk for Suicide",
    publisher: "US Department of Veterans Affairs and Department of Defense",
    url: "https://www.healthquality.va.gov/guidelines/MH/srb/",
    year: 2024,
  },
  {
    title: "CALM: Counseling on Access to Lethal Means",
    publisher: "Suicide Prevention Resource Center (SPRC)",
    url: "https://sprc.org/online-library/calm-counseling-on-access-to-lethal-means",
  },
  { title: "988 Suicide & Crisis Lifeline", publisher: "988 Lifeline", url: "https://988lifeline.org" },
];
export const SAFETY_PLAN_GOVERNANCE = { license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" } as const;

/**
 * The client's printable plan. Typed items print as a list; parts with nothing typed print ruled lines; names and
 * numbers always print as blank lines. The crisis lines and the crisis box are always included.
 */
export function safetyPlanDoc(entries: SafetyPlanEntries): DocSpec {
  const blocks: DocBlock[] = [
    { kind: "title", text: SAFETY_PLAN_TITLE },
    { kind: "fill", label: "Name" },
    { kind: "paragraph", text: SAFETY_PLAN_USE_NOTE },
  ];
  for (const s of SAFETY_PLAN_SECTIONS) {
    blocks.push({ kind: "heading", text: s.heading });
    blocks.push({ kind: "paragraph", text: s.prompt, style: "muted" });
    if (s.fixed) blocks.push({ kind: "list", items: s.fixed });
    const items = s.typed ? sectionItems(entries[s.id]) : [];
    if (items.length) blocks.push({ kind: "list", items });
    else if (s.blankLines) blocks.push({ kind: "write", lines: s.blankLines });
    for (let i = 0; i < (s.handwritten?.rows ?? 0); i++) blocks.push({ kind: "fill", label: s.handwritten!.label });
  }
  blocks.push({ kind: "crisis" });
  blocks.push({ kind: "paragraph", text: SAFETY_PLAN_ORIGIN_NOTE, style: "muted" });
  blocks.push({
    kind: "paragraph",
    style: "muted",
    text: `Based on information from: ${SAFETY_PLAN_SOURCES.map((s) => s.publisher).join("; ")}.`,
  });
  return { title: SAFETY_PLAN_TITLE, blocks, part2: safetyPlanMentionsSubstances(entries) };
}
