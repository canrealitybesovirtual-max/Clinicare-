/**
 * Session note helper (tools/note): SOAP, DAP, BIRP and GIRP drafts prefilled from the memory-only session.
 * Pure: no React, no I/O.
 *
 * - Prefill uses curated wording only: documented symptom labels from the lexicon, measure totals with their
 *   published severity bands, chosen intervention names and plan objectives (already PHI-scrubbed). No typed
 *   session text is copied in.
 * - Never states a diagnosis (G3): the note speaks of "Presenting concerns" and leaves "Clinical impressions
 *   (clinician to complete)". Safety items are prompts to document the clinician's own assessment; nothing here
 *   grades or decides risk (G9).
 * - No identifiers (G5): one blank, handwritten "Client: ____" line; "Session #" instead of a date.
 * - Every section is edited through the scrubbed field; export scrubs each section again (idempotent).
 * - Substance-use content (G6) adds the 42 CFR Part 2 notice; see noteRecordsSubstanceUse.
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import type { DocBlock, DocSpec } from "@/lib/tools/doc-model";

export type NoteFormat = "soap" | "dap" | "birp" | "girp";

type Slot = "concerns" | "measures" | "observations" | "impressions" | "safety" | "interventions" | "response" | "plan" | "goals";

interface SectionDef {
  id: string;
  heading: string;
  hint: string;
  slots: Slot[];
}

export interface NoteFormatDef {
  id: NoteFormat;
  label: string;
  expansion: string;
  sections: SectionDef[];
}

export const NOTE_FORMATS: readonly NoteFormatDef[] = [
  {
    id: "soap",
    label: "SOAP",
    expansion: "Subjective, Objective, Assessment, Plan",
    sections: [
      { id: "subjective", heading: "Subjective", hint: "What the client reports, in their own words where possible.", slots: ["concerns"] },
      { id: "objective", heading: "Objective", hint: "Measure results and what you observed in session.", slots: ["measures", "observations"] },
      { id: "assessment", heading: "Assessment", hint: "Your clinical impressions and safety assessment.", slots: ["impressions", "safety"] },
      { id: "plan", heading: "Plan", hint: "Interventions, objectives, between-session practice and next steps.", slots: ["interventions", "plan"] },
    ],
  },
  {
    id: "dap",
    label: "DAP",
    expansion: "Data, Assessment, Plan",
    sections: [
      { id: "data", heading: "Data", hint: "What the client reported, measure results and observations.", slots: ["concerns", "measures", "observations"] },
      { id: "assessment", heading: "Assessment", hint: "Your clinical impressions and safety assessment.", slots: ["impressions", "safety"] },
      { id: "plan", heading: "Plan", hint: "Interventions, objectives, between-session practice and next steps.", slots: ["interventions", "plan"] },
    ],
  },
  {
    id: "birp",
    label: "BIRP",
    expansion: "Behavior, Intervention, Response, Plan",
    sections: [
      { id: "behavior", heading: "Behavior", hint: "Presenting concerns, measure results and what you observed.", slots: ["concerns", "measures", "observations"] },
      { id: "intervention", heading: "Intervention", hint: "What you did in session.", slots: ["interventions"] },
      { id: "response", heading: "Response", hint: "How the client responded, your clinical impressions and safety assessment.", slots: ["response", "impressions", "safety"] },
      { id: "plan", heading: "Plan", hint: "Objectives, between-session practice and next steps.", slots: ["plan"] },
    ],
  },
  {
    id: "girp",
    label: "GIRP",
    expansion: "Goals, Intervention, Response, Plan",
    sections: [
      { id: "goals", heading: "Goals", hint: "The plan objectives this session worked on.", slots: ["goals"] },
      { id: "intervention", heading: "Intervention", hint: "What you did in session.", slots: ["interventions"] },
      {
        id: "response",
        heading: "Response",
        hint: "Presenting concerns, measure results, the client's response, your clinical impressions and safety assessment.",
        slots: ["concerns", "measures", "response", "impressions", "safety"],
      },
      { id: "plan", heading: "Plan", hint: "Between-session practice and next steps.", slots: ["plan"] },
    ],
  },
];

export function noteFormat(id: NoteFormat): NoteFormatDef {
  return NOTE_FORMATS.find((f) => f.id === id) ?? NOTE_FORMATS[0]!;
}

/* ------------------------------------------------------------------ session context */

export interface NoteMeasure {
  shortName: string;
  total: number;
  max: number;
  answered: number;
  items: number;
  /** Severity band label once every item is answered. */
  band: string | null;
  /** Risk-item follow-up prompts (e.g. PHQ-9 item 9). */
  riskMessages: string[];
}

export interface NoteContext {
  /** Documented symptom labels (lexicon wording). */
  concerns: string[];
  /** Cultural concepts of distress named this session (shown, never scored). */
  cultural: string[];
  /** Red-flag symptom labels documented this session. */
  redFlags: string[];
  measures: NoteMeasure[];
  /** Intervention names chosen in the plan. */
  interventions: string[];
  /** Plan objectives (already scrubbed). */
  objectives: string[];
}

export interface NoteSection {
  id: string;
  heading: string;
  hint: string;
  text: string;
}

export const IMPRESSIONS_LINE = "Clinical impressions (clinician to complete):";
const TO_COMPLETE = "(clinician to complete)";

/** "PHQ-9 total 14 of 27 (Moderate range)" or "PHQ-9: 6 of 9 items answered, total not final". */
export function measureLine(m: NoteMeasure): string {
  if (m.answered < m.items) return `${m.shortName}: ${m.answered} of ${m.items} items answered, total not final.`;
  return `${m.shortName} total ${m.total} of ${m.max}${m.band ? ` (${m.band} range)` : ""}.`;
}

const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

function slotText(slot: Slot, ctx: NoteContext): string {
  switch (slot) {
    case "concerns": {
      const parts = [
        ctx.concerns.length
          ? `Presenting concerns documented this session:\n${bullets(ctx.concerns)}`
          : `Presenting concerns: ${TO_COMPLETE}`,
      ];
      if (ctx.cultural.length) parts.push(`Cultural concepts of distress named (explore with the client):\n${bullets(ctx.cultural)}`);
      return parts.join("\n");
    }
    case "measures":
      return ctx.measures.length
        ? `Measures:\n${bullets(ctx.measures.map(measureLine))}`
        : `Measures: ${TO_COMPLETE}`;
    case "observations":
      return `Observations in session: ${TO_COMPLETE}`;
    case "impressions":
      return IMPRESSIONS_LINE;
    case "response":
      return `Client response: ${TO_COMPLETE}`;
    case "safety": {
      const risk = ctx.measures.flatMap((m) => m.riskMessages.map((r) => `${m.shortName}: ${r}`));
      if (!ctx.redFlags.length && !risk.length) return `Safety: ${TO_COMPLETE}`;
      const lines = [
        "Safety: documented this session and calling for direct follow-up. Record your own assessment and actions:",
        ...ctx.redFlags.map((l) => `- ${l}`),
        ...risk.map((r) => `- ${r}`),
      ];
      return lines.join("\n");
    }
    case "interventions":
      return ctx.interventions.length
        ? `Interventions used or planned:\n${bullets(ctx.interventions)}`
        : `Interventions used: ${TO_COMPLETE}`;
    case "goals":
      return ctx.objectives.length ? `Plan objectives addressed:\n${bullets(ctx.objectives)}` : `Goals addressed: ${TO_COMPLETE}`;
    case "plan": {
      const parts: string[] = [];
      if (ctx.objectives.length) parts.push(`Plan objectives:\n${bullets(ctx.objectives)}`);
      parts.push(`Between-session practice: ${TO_COMPLETE}`, `Next session: ${TO_COMPLETE}`);
      return parts.join("\n");
    }
  }
}

/** Sections for a format, prefilled from the session context. */
export function prefillNote(format: NoteFormat, ctx: NoteContext): NoteSection[] {
  // GIRP lists the objectives under Goals; its Plan section does not repeat them.
  const planCtx = format === "girp" ? { ...ctx, objectives: [] } : ctx;
  return noteFormat(format).sections.map((s) => ({
    id: s.id,
    heading: s.heading,
    hint: s.hint,
    text: s.slots.map((slot) => slotText(slot, slot === "plan" ? planCtx : ctx)).join("\n\n"),
  }));
}

/* ------------------------------------------------------------------ export */

export const NOTE_REVIEW_LINE =
  "For clinician review. Draft prepared on this device; edit and verify every line before it enters the record.";
const NOTE_NO_DIAGNOSIS_LINE =
  "This draft states no diagnosis. Clinical impressions and any diagnosis or codes come only from your own assessment.";

/** G6: substance-use content in the session or anywhere in the note's wording. */
export function noteRecordsSubstanceUse(sections: readonly NoteSection[], sessionSud: boolean): boolean {
  return sessionSud || sections.some((s) => mentionsSubstanceUse(s.text));
}

function noteTitle(format: NoteFormat): string {
  return `Session note draft (${noteFormat(format).label})`;
}

/** The note as an export outline. Section text is scrubbed again here. */
export function noteDoc(format: NoteFormat, sections: readonly NoteSection[], opts: { sessionNumber: number | null; sud: boolean }): DocSpec {
  const def = noteFormat(format);
  const blocks: DocBlock[] = [
    { kind: "title", text: noteTitle(format) },
    { kind: "fill", label: "Client" },
    { kind: "paragraph", text: NOTE_REVIEW_LINE, style: "bold" },
    {
      kind: "paragraph",
      text: `Session #: ${opts.sessionNumber ?? "____"} · Format: ${def.label} (${def.expansion})`,
    },
  ];
  for (const s of sections) {
    const text = scrubPHI(s.text.trim()).clean;
    blocks.push({ kind: "heading", text: s.heading });
    blocks.push(text ? { kind: "paragraph", text } : { kind: "paragraph", text: "(left blank)", style: "muted" });
  }
  blocks.push({ kind: "paragraph", text: NOTE_NO_DIAGNOSIS_LINE, style: "muted" });
  return { title: noteTitle(format), blocks, part2: opts.sud };
}
