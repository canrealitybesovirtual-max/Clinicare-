/**
 * Shared decision option grid (tools/option-grid). Pure: no React, no I/O, no storage.
 *
 * - Options come only from curated library data: the interventions that list the chosen condition, plus one curated
 *   "wait and review" option the clinician can add. Nothing is ranked, scored or chosen for the client.
 * - Facts shown per option: what it involves, session length, between-session practice (the intervention has client
 *   handouts), whether it needs a specially trained clinician, the evidence summary and the main caution. Long text
 *   is shortened at a sentence boundary; the intervention page has the full text.
 * - The client view and the client sheet never name a condition or code (G3): an option whose name is not
 *   client-safe is shown by its approach, or as "Option N"; the clinician's plain-language description is shown
 *   only when it is client-safe. Typed text is scrubbed again before export (G5).
 * - A substance-use condition makes the sheet carry the 42 CFR Part 2 notice (G6).
 */
import { isClientSafeText } from "@/lib/client-safe";
import { scrubPHI } from "@/lib/phi-scrubber";
import type { Intervention } from "@/lib/schemas-phase2";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import type { DocBlock, DocSpec } from "./doc-model";

/**
 * Whole sentences up to about `max` characters (always at least the first sentence). A sentence ends at . ! or ?
 * followed by a space and a capital letter, digit or bracket, so abbreviations such as e.g. do not split it.
 */
export function summarize(text: string, max = 280): string {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9(])/);
  let out = sentences[0] ?? "";
  for (const s of sentences.slice(1)) {
    if (out.length + 1 + s.length > max) break;
    out = `${out} ${s}`;
  }
  return out;
}

export interface OptionFacts {
  id: string;
  name: string;
  modality: string;
  minutes: { min: number; max: number };
  /** The intervention has client handouts for practice between sessions. */
  practice: boolean;
  /** Needs a specially trained clinician. */
  training: boolean;
  purpose: string;
  evidence: string;
  caution: string;
  /** Link to the full entry, or null for the curated wait-and-review option. */
  href: string | null;
}

/** The facts the grid shows for one library intervention (shortened at sentence boundaries). */
export function optionFacts(i: Intervention): OptionFacts {
  return {
    id: i.id,
    name: i.name,
    modality: i.modality,
    minutes: i.minutes,
    practice: i.handoutIds.length > 0,
    training: Boolean(i.trainingRequired),
    purpose: summarize(i.purpose),
    evidence: summarize(i.evidenceLevel),
    caution: summarize(i.contraindications[0] ?? "", 220),
    href: `/interventions/${i.id}`,
  };
}

export const WAIT_AND_REVIEW_ID = "wait-and-review";

/** The curated option of not starting a new treatment yet. Opt-in; never offered when there are safety concerns. */
export const WAIT_AND_REVIEW: OptionFacts = {
  id: WAIT_AND_REVIEW_ID,
  name: "Wait and review",
  modality: "Active monitoring",
  minutes: { min: 10, max: 30 },
  practice: false,
  training: false,
  purpose:
    "No new treatment for now. You agree what to watch for, when you will meet again to review, and what would mean starting treatment sooner.",
  evidence:
    "Not a treatment. A choice some people make when difficulties are mild, there are no safety concerns, and they prefer to wait. Agree a review session.",
  caution: "Not suitable when there are safety concerns, when symptoms are severe or worsening, or when waiting has not helped before.",
  href: null,
};

export const MAX_OPTIONS = 4;

/** Client-safe name for an option: its own name, else its approach, else "Option N" (G3). */
export function clientOptionLabel(o: OptionFacts, index: number): string {
  if (o.id === WAIT_AND_REVIEW_ID) return "Wait and check in again";
  if (isClientSafeText(o.name)) return o.name;
  if (isClientSafeText(o.modality)) return `Option ${index + 1} (${o.modality})`;
  return `Option ${index + 1}`;
}

export function minutesText(m: { min: number; max: number }): string {
  return m.min === m.max ? `About ${m.min} minutes` : `About ${m.min} to ${m.max} minutes`;
}

export interface ClientRow {
  label: string;
  value: string;
}

/** Plain-language facts the client sees for one option. `plain` is the clinician's description (already scrubbed). */
export function clientRows(o: OptionFacts, plain: string): ClientRow[] {
  const described = plain.trim() && isClientSafeText(plain) ? plain.trim() : "";
  return [
    ...(described ? [{ label: "What you would do", value: described }] : []),
    { label: o.id === WAIT_AND_REVIEW_ID ? "Check-in visits" : "Each session", value: minutesText(o.minutes) },
    { label: "Practice between sessions", value: o.practice ? "Yes, with a short written plan or worksheet" : "Not usually" },
    { label: "Therapist", value: o.training ? "Needs a therapist with special training in this method" : "Most trained therapists can offer it" },
  ];
}

/** What can matter to a client when choosing. Original wording; the client ticks what fits. */
export const PRIORITIES = [
  { id: "quick", label: "Feeling better as soon as possible" },
  { id: "time", label: "Fitting sessions around work, care or study" },
  { id: "talk", label: "Talking things through more than doing exercises" },
  { id: "skills", label: "Learning skills I can practice on my own" },
  { id: "past", label: "Not having to go into the past in detail" },
  { id: "no-medicine", label: "Avoiding medicine, or its side effects" },
  { id: "medicine-ok", label: "Being open to medicine if it could help" },
  { id: "family", label: "Including family or people close to me" },
  { id: "faith", label: "Fitting with my faith or culture" },
  { id: "privacy", label: "Keeping things private" },
] as const;
export type PriorityId = (typeof PRIORITIES)[number]["id"];

/** Questions a client can ask about any option. Original wording. */
export const CLIENT_QUESTIONS = [
  "What would I actually do in this option, and how often?",
  "How long until I might notice a difference?",
  "What are the downsides or side effects?",
  "What happens if it does not help?",
  "Can I change my mind later?",
] as const;

export const PLAIN_MAX = 240;

export interface OptionGridDocInput {
  options: readonly OptionFacts[];
  /** Clinician's plain description per option id (scrubbed again here). */
  plain: Readonly<Record<string, string>>;
  priorities: readonly PriorityId[];
  /** The chosen condition is a substance-use condition (G6). */
  sud: boolean;
}

const scrub = (s: string) => scrubPHI(s).clean.trim();

/** True when the sheet would carry substance-use content (G6). */
export function optionGridRecordsSubstanceUse(input: OptionGridDocInput): boolean {
  return input.sud || Object.values(input.plain).some((t) => mentionsSubstanceUse(scrub(t)));
}

/** The client sheet: options in plain words, what matters to the client, questions, blank name line, crisis box. */
export function optionGridDoc(input: OptionGridDocInput): DocSpec {
  const blocks: DocBlock[] = [
    { kind: "title", text: "Comparing my options" },
    { kind: "fill", label: "Name" },
    { kind: "paragraph", text: "Options we talked about. There is no single right choice: it depends on what matters to you.", style: "muted" },
  ];
  input.options.forEach((o, i) => {
    blocks.push({ kind: "heading", text: clientOptionLabel(o, i) });
    blocks.push({ kind: "list", items: clientRows(o, scrub(input.plain[o.id] ?? "")).map((r) => `${r.label}: ${r.value}`) });
  });
  const priorities = PRIORITIES.filter((p) => input.priorities.includes(p.id)).map((p) => p.label);
  blocks.push({ kind: "heading", text: "What matters most to me" });
  blocks.push(priorities.length ? { kind: "list", items: priorities } : { kind: "write", lines: 2 });
  blocks.push({ kind: "heading", text: "Questions I can ask" }, { kind: "list", items: [...CLIENT_QUESTIONS] });
  blocks.push({ kind: "heading", text: "What we decided, or when we will decide" }, { kind: "write", lines: 2 }, { kind: "crisis" });
  return { title: "Comparing my options", blocks, part2: optionGridRecordsSubstanceUse(input) };
}
