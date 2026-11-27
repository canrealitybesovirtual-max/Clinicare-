/**
 * De-identified referral letter (tools/referral-letter). Pure: no React, no I/O.
 *
 * - The reason is built from curated items only: documented symptom labels, measure results and the reasons listed
 *   here, plus an optional short note that passed the PHI scrubber (and is scrubbed again here).
 * - No identifiers are typed (G5): the client's name and date of birth, and the referring clinician's details,
 *   print as blank lines to fill in by hand after export.
 * - Never states a diagnosis (G3); the receiving clinician is asked to complete their own assessment.
 * - Substance-use content (service, reasons or note) adds the 42 CFR Part 2 notice and a consent reminder (G6).
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import type { DocBlock, DocSpec } from "./doc-model";

export const REFERRAL_SERVICES = [
  { id: "medication-evaluation", label: "Psychiatric medication evaluation" },
  { id: "psychological-testing", label: "Psychological or neuropsychological testing" },
  { id: "specialty-therapy", label: "Specialty psychotherapy (for example, trauma-focused or exposure-based therapy)" },
  { id: "higher-level-care", label: "A higher level of care (intensive outpatient or partial hospitalization program)" },
  { id: "substance-use-treatment", label: "Substance use treatment", sud: true },
  { id: "medical-evaluation", label: "Medical evaluation by primary care" },
  { id: "sleep-medicine", label: "Sleep medicine evaluation" },
  { id: "couples-family", label: "Couples or family therapy" },
  { id: "group-therapy", label: "Group therapy or a skills group" },
  { id: "case-management", label: "Case management or social services" },
] as const satisfies readonly { id: string; label: string; sud?: boolean }[];
export type ReferralServiceId = (typeof REFERRAL_SERVICES)[number]["id"];

export const REFERRAL_TIMING = [
  { value: "routine", label: "Routine" },
  { value: "soon", label: "As soon as available" },
] as const;
export type ReferralTiming = (typeof REFERRAL_TIMING)[number]["value"];

/** Curated, original reasons that apply across presentations. */
export const REFERRAL_REASONS = [
  { id: "client-request", label: "The client asked for this service." },
  { id: "limited-progress", label: "Progress with the current treatment has been limited." },
  { id: "outside-scope", label: "The needs described are outside my scope of practice or training." },
  { id: "rule-out-medical", label: "Medical causes of the symptoms should be checked." },
  { id: "more-support", label: "The client may need more support or structure than weekly outpatient sessions." },
  { id: "diagnostic-clarity", label: "A specialist assessment would help clarify the clinical picture." },
  { id: "language-culture", label: "The client prefers a provider who offers a specific language or cultural approach." },
  { id: "continuity", label: "Continuity of care (the client is moving or changing coverage)." },
] as const;
export type ReferralReasonId = (typeof REFERRAL_REASONS)[number]["id"];

export const REFERRAL_NOTE_MAX = 400;

export interface ReferralLetterInput {
  serviceId: ReferralServiceId;
  timing: ReferralTiming;
  reasonIds: readonly ReferralReasonId[];
  /** Documented symptom labels the clinician chose to include. */
  concerns: readonly string[];
  /** Measure result lines the clinician chose to include. */
  measures: readonly string[];
  /** Optional short note (already scrubbed; scrubbed again here). */
  note: string;
  /** The session holds substance-use content that is included. */
  sessionSud: boolean;
}

const REFERRAL_TITLE = "Referral request";
const REFERRAL_CONSENT_LINE =
  "[  ] The client's written authorization to share this information is on file (required before sending).";
export const REFERRAL_PART2_CONSENT =
  "Substance use information: a 42 CFR Part 2 program may disclose it only with the client's written consent that meets Part 2 requirements.";

function serviceLabel(id: ReferralServiceId): string {
  return REFERRAL_SERVICES.find((s) => s.id === id)?.label ?? id;
}

export function referralRecordsSubstanceUse(input: ReferralLetterInput): boolean {
  const service = REFERRAL_SERVICES.find((s) => s.id === input.serviceId);
  return (
    input.sessionSud ||
    (!!service && "sud" in service && service.sud) ||
    [...input.concerns, ...input.measures, input.note].some(mentionsSubstanceUse)
  );
}

export function referralLetterDoc(input: ReferralLetterInput): DocSpec {
  const part2 = referralRecordsSubstanceUse(input);
  const reasons = [
    ...REFERRAL_REASONS.filter((r) => input.reasonIds.includes(r.id)).map((r) => r.label),
    ...input.concerns,
  ];
  const note = scrubPHI(input.note.trim()).clean;
  const timing = REFERRAL_TIMING.find((t) => t.value === input.timing)?.label ?? "Routine";

  const blocks: DocBlock[] = [
    { kind: "title", text: REFERRAL_TITLE },
    { kind: "fill", label: "To (service or clinician)" },
    { kind: "fill", label: "Client name" },
    { kind: "fill", label: "Date of birth" },
    { kind: "paragraph", text: "Dear colleague," },
    {
      kind: "paragraph",
      text: `I am referring the client named above for: ${serviceLabel(input.serviceId)}. Requested timing: ${timing}.`,
    },
    { kind: "heading", text: "Reason for referral" },
    reasons.length
      ? { kind: "list", items: reasons }
      : { kind: "paragraph", text: "(Reason to be added by the referring clinician.)", style: "muted" },
  ];
  if (input.measures.length) {
    blocks.push({ kind: "heading", text: "Screening results" }, { kind: "list", items: [...input.measures] });
    blocks.push({ kind: "paragraph", text: "Screening totals are not diagnoses.", style: "muted" });
  }
  if (note) blocks.push({ kind: "heading", text: "Additional notes" }, { kind: "paragraph", text: note });
  blocks.push(
    {
      kind: "paragraph",
      text: "This letter states no diagnosis. Please complete your own assessment. I am glad to discuss the referral; my contact details are below.",
    },
    { kind: "heading", text: "Consent" },
    { kind: "paragraph", text: REFERRAL_CONSENT_LINE },
  );
  if (part2) blocks.push({ kind: "paragraph", text: REFERRAL_PART2_CONSENT, style: "bold" });
  blocks.push(
    { kind: "heading", text: "Referring clinician" },
    { kind: "fill", label: "Name and credentials" },
    { kind: "fill", label: "Phone or secure contact" },
    { kind: "fill", label: "Signature" },
    { kind: "fill", label: "Date" },
  );
  return { title: REFERRAL_TITLE, blocks, part2 };
}
