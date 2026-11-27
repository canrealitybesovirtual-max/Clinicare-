/**
 * Accommodation support letter (tools/accommodation-letter). Pure: no React, no I/O.
 *
 * - Describes functional limitations and requested accommodations from curated, original lists, never a diagnosis
 *   (G3). If a formal process needs the condition named, the letter can carry a blank line the clinician fills in
 *   by hand with the client's written consent; the app never prints a condition name.
 * - Written from the treating role only: it states what the treating clinician knows from care. Fitness-for-duty
 *   or disability determinations are evaluator work (legal hub: treating and forensic roles).
 * - No identifiers are typed (G5): client, recipient, clinician and dates print as blank lines.
 * - An optional short note passes the PHI scrubber while typing and again here; substance-use wording in it adds
 *   the 42 CFR Part 2 notice (G6).
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import type { Source } from "@/lib/schemas";
import type { DocBlock, DocSpec } from "./doc-model";

export const LETTER_SETTINGS = [
  { value: "work", label: "Work" },
  { value: "education", label: "College or training" },
] as const;
export type LetterSetting = (typeof LETTER_SETTINGS)[number]["value"];

export const LETTER_DURATIONS = [
  { value: "temporary", label: "For a set time" },
  { value: "ongoing", label: "Ongoing, with review" },
] as const;
export type LetterDuration = (typeof LETTER_DURATIONS)[number]["value"];

export const CONDITION_LINE = [
  { value: "none", label: "Do not name it" },
  { value: "blank-line", label: "Blank line to fill by hand" },
] as const;
export type ConditionLine = (typeof CONDITION_LINE)[number]["value"];

/** Functional limitations in plain words: what is harder, never why. */
export const LIMITATIONS = [
  { id: "concentration", label: "Keeping concentration for long stretches without a break" },
  { id: "multitasking", label: "Handling several tasks or frequent interruptions at once" },
  { id: "deadlines", label: "Working to short or suddenly changed deadlines" },
  { id: "early-start", label: "Starting early in the day" },
  { id: "noise", label: "Working in noisy, busy or crowded spaces" },
  { id: "change", label: "Coping with sudden changes in routine or tasks" },
  { id: "verbal-instructions", label: "Remembering spoken instructions" },
  { id: "appointments", label: "Attending regular health appointments during working or class hours" },
  { id: "energy", label: "Keeping energy steady across a full day" },
  { id: "public-contact", label: "Long periods of contact with the public" },
  { id: "flares", label: "Symptoms that come and go, with some harder days" },
  { id: "exams", label: "Timed tests and exams" },
] as const;
export type LimitationId = (typeof LIMITATIONS)[number]["id"];

/** Requested changes, each linked to the limitations it can help with. */
export const ACCOMMODATIONS = [
  { id: "breaks", label: "Short, scheduled breaks", helps: ["concentration", "energy", "flares"] },
  { id: "quiet-space", label: "A quieter space, a screen or noise-cancelling headphones", helps: ["noise", "concentration"] },
  { id: "written-instructions", label: "Instructions and priorities in writing", helps: ["verbal-instructions", "multitasking", "change"] },
  { id: "check-ins", label: "Brief, regular check-ins with a supervisor or tutor", helps: ["deadlines", "multitasking", "change"] },
  { id: "flexible-start", label: "A flexible or later start time", helps: ["early-start", "energy"] },
  { id: "appointment-time", label: "Schedule flexibility for treatment appointments", helps: ["appointments"] },
  { id: "remote", label: "Working or studying remotely on some days", helps: ["noise", "energy", "flares", "public-contact"] },
  { id: "advance-notice", label: "Advance notice of changes where possible", helps: ["change", "deadlines"] },
  { id: "adjusted-load", label: "A temporarily adjusted workload or course load", helps: ["energy", "flares", "deadlines"] },
  { id: "task-swap", label: "Swapping some public-facing tasks for other duties", helps: ["public-contact"] },
  { id: "extended-time", label: "Extra time and a quieter room for tests", helps: ["exams", "concentration", "noise"] },
  { id: "step-out", label: "Permission to step away briefly when symptoms rise", helps: ["flares", "public-contact", "exams"] },
] as const satisfies readonly { id: string; label: string; helps: readonly LimitationId[] }[];
export type AccommodationId = (typeof ACCOMMODATIONS)[number]["id"];

export const LETTER_NOTE_MAX = 400;

export interface AccommodationLetterInput {
  setting: LetterSetting;
  limitationIds: readonly LimitationId[];
  accommodationIds: readonly AccommodationId[];
  duration: LetterDuration;
  conditionLine: ConditionLine;
  /** Optional note on how the changes would help (already scrubbed; scrubbed again here). */
  note: string;
}

export const LETTER_SOURCES: readonly Source[] = [
  {
    title: "The mental health provider's role in a client's request for a reasonable accommodation at work",
    publisher: "US Equal Employment Opportunity Commission",
    url: "https://www.eeoc.gov/laws/guidance/mental-health-providers-role-clients-request-reasonable-accommodation-work",
  },
  {
    title: "Depression, PTSD, and other mental health conditions in the workplace: your legal rights",
    publisher: "US Equal Employment Opportunity Commission",
    url: "https://www.eeoc.gov/publications/depression-ptsd-other-mental-health-conditions-workplace-your-legal-rights",
  },
  { title: "Job Accommodation Network (JAN)", publisher: "US Department of Labor, Office of Disability Employment Policy", url: "https://askjan.org/" },
];

export const LETTER_GOVERNANCE = { license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" } as const;

/** Accommodations that relate to at least one ticked limitation (a suggestion for clinician review, never automatic). */
export function relatedAccommodations(limitationIds: readonly LimitationId[]): Set<AccommodationId> {
  const ticked = new Set<string>(limitationIds);
  return new Set(ACCOMMODATIONS.filter((a) => a.helps.some((h) => ticked.has(h))).map((a) => a.id));
}

export function letterIncludesSubstanceUse(input: AccommodationLetterInput): boolean {
  return mentionsSubstanceUse(input.note);
}

const SETTING_WORDS: Record<LetterSetting, { title: string; place: string; process: string }> = {
  work: { title: "Workplace accommodation request: supporting letter", place: "work", process: "the employer's accommodation process" },
  education: { title: "Study accommodation request: supporting letter", place: "study", process: "the disability services process" },
};

export function accommodationLetterDoc(input: AccommodationLetterInput): DocSpec {
  const words = SETTING_WORDS[input.setting];
  const part2 = letterIncludesSubstanceUse(input);
  const limits = LIMITATIONS.filter((l) => input.limitationIds.includes(l.id)).map((l) => l.label);
  const changes = ACCOMMODATIONS.filter((a) => input.accommodationIds.includes(a.id)).map((a) => a.label);
  const note = scrubPHI(input.note.trim()).clean;

  const blocks: DocBlock[] = [
    { kind: "title", text: words.title },
    { kind: "fill", label: "To (office, person or organization)" },
    { kind: "fill", label: "Client name" },
    { kind: "fill", label: "Date" },
    {
      kind: "paragraph",
      text: "I am the treating clinician for the person named above and am writing at their request, with their written consent, to support a request for changes at " +
        `${words.place}. I describe how their health affects ${words.place}, from my own knowledge of their care.`,
    },
    { kind: "fill", label: "In my care since (month and year)" },
    {
      kind: "paragraph",
      text: `In my professional opinion, the person named above has a health condition that limits the activities listed below. ${
        input.conditionLine === "none"
          ? "To protect their privacy, I have not named the condition. With their further written consent, I can give more information if the formal process requires it."
          : "The condition is named below only because the formal process requires it and the person has agreed in writing."
      }`,
    },
  ];
  if (input.conditionLine === "blank-line") blocks.push({ kind: "fill", label: "Condition, in general terms (only if required and agreed)" });

  blocks.push({ kind: "heading", text: "What is harder at present" });
  blocks.push(limits.length ? { kind: "list", items: limits } : { kind: "write", lines: 3 });
  blocks.push({ kind: "heading", text: "Changes that would help" });
  blocks.push(changes.length ? { kind: "list", items: changes } : { kind: "write", lines: 3 });
  if (note) blocks.push({ kind: "heading", text: "How these changes would help" }, { kind: "paragraph", text: note });

  blocks.push(
    { kind: "heading", text: "How long" },
    input.duration === "temporary"
      ? { kind: "fill", label: "Expected to be needed until (date or event)" }
      : { kind: "fill", label: "Suggested review date" },
    {
      kind: "paragraph",
      text: `These are suggestions to support the person at ${words.place}. Decisions are made through ${words.process}, and other effective changes may work equally well. I am glad to answer questions with the person's consent.`,
    },
    { kind: "paragraph", text: "[  ] The client's written consent to share this letter is on file." },
    { kind: "heading", text: "Treating clinician" },
    { kind: "fill", label: "Name and credentials" },
    { kind: "fill", label: "License number and state" },
    { kind: "fill", label: "Phone or secure contact" },
    { kind: "fill", label: "Signature" },
  );
  return { title: words.title, blocks, part2 };
}
