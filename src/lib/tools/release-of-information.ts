/**
 * Release-of-information authorization builder (tools/release-of-information). Pure: no React, no I/O.
 *
 * - Builds a printable authorization from tick boxes and choices. Every identifier (client name, provider,
 *   recipient, dates, signature, representative's authority) prints as a blank line written by hand (G5).
 * - Covers the HIPAA authorization core elements and required statements (45 CFR 164.508(c)), in the app's own
 *   plain wording. Psychotherapy notes get their own form, because an authorization for them may not be combined
 *   with one for other records (45 CFR 164.508(b)(3)(ii)).
 * - Substance use disorder records from a Part 2 program (tick box, or substance-use wording in the optional note)
 *   add the 42 CFR Part 2 consent points (42 CFR 2.31) and the Part 2 notice at the top and in every footer (G6).
 * - Not legal advice: state law and the organization's own forms may add requirements. Never states a diagnosis.
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import type { Source } from "@/lib/schemas";
import type { DocBlock, DocSpec } from "./doc-model";

export const ROI_RECORD_KINDS = [
  { value: "general", label: "Health records" },
  { value: "psychotherapy-notes", label: "Psychotherapy notes" },
] as const;
export type RoiRecordKind = (typeof ROI_RECORD_KINDS)[number]["value"];

export const ROI_DIRECTIONS = [
  { value: "release", label: "Send to the recipient" },
  { value: "exchange", label: "Exchange both ways" },
] as const;
export type RoiDirection = (typeof ROI_DIRECTIONS)[number]["value"];

/** Categories of information, described specifically (HIPAA asks for a specific and meaningful description). */
export const ROI_INFO = [
  { id: "attendance", label: "Dates of attendance and appointments" },
  { id: "assessment", label: "Assessment and evaluation summaries" },
  { id: "diagnoses", label: "Diagnoses and diagnostic codes" },
  { id: "treatment-plan", label: "Treatment plan and progress summaries" },
  { id: "medications", label: "Medication information" },
  { id: "screening", label: "Screening and test results" },
  { id: "safety-plan", label: "Safety plan and crisis information" },
  { id: "discharge", label: "Discharge or transfer summary" },
  { id: "billing", label: "Billing and payment information" },
  { id: "sud-records", label: "Substance use disorder treatment records from a 42 CFR Part 2 program", sud: true },
] as const satisfies readonly { id: string; label: string; sud?: boolean }[];
export type RoiInfoId = (typeof ROI_INFO)[number]["id"];

export const ROI_PURPOSES = [
  { id: "client-request", label: "At the client's request" },
  { id: "treatment", label: "Coordination of treatment" },
  { id: "continuity", label: "Continuity of care after a referral, move or discharge" },
  { id: "payment", label: "Payment or insurance" },
  { id: "accommodation", label: "A disability, work or school accommodation request" },
  { id: "legal", label: "A legal matter (talk with counsel before sending)" },
] as const;
export type RoiPurposeId = (typeof ROI_PURPOSES)[number]["id"];

export const ROI_NOTE_MAX = 300;

export interface RoiInput {
  recordKind: RoiRecordKind;
  direction: RoiDirection;
  infoIds: readonly RoiInfoId[];
  purposeIds: readonly RoiPurposeId[];
  /** Optional limits, for example a date range in words. Already scrubbed; scrubbed again here. */
  note: string;
}

/** HIPAA authorization content (45 CFR 164.508(c)), in plain words, and how the template covers each point. */
export const ROI_HIPAA_ELEMENTS = [
  { id: "description", label: "A specific, meaningful description of the information", how: "Tick boxes, plus optional limits." },
  { id: "discloser", label: "Who may make the disclosure", how: "Blank line for the provider or program." },
  { id: "recipient", label: "Who may receive the information", how: "Blank lines for the recipient." },
  { id: "purpose", label: "The purpose of each disclosure", how: "Tick boxes; at the client's request is enough when the client asks." },
  { id: "expiration", label: "An expiration date or event", how: "Blank line." },
  { id: "signature", label: "The client's signature and date, or a representative's with their authority", how: "Blank lines." },
  { id: "revocation", label: "The right to revoke in writing, its limits and how to revoke", how: "Fixed statement and a blank line." },
  { id: "conditioning", label: "Whether treatment or payment depends on signing", how: "Fixed statement." },
  { id: "redisclosure", label: "That the recipient may redisclose and the information may lose federal protection", how: "Fixed statement." },
  { id: "plain-language", label: "Plain language, and a copy for the client", how: "Plain wording and a copy statement." },
] as const;

/** 42 CFR Part 2 consent points (42 CFR 2.31, 2024 rule), in plain words, shown when Part 2 records are included. */
export const ROI_PART2_ELEMENTS = [
  "The client's name.",
  "The Part 2 program or person allowed to disclose, by name or general designation.",
  "A specific description of the substance use disorder information, including how much and what kind.",
  "The recipient, by name or class of recipients (a single consent for future treatment, payment and health care operations may describe recipients more generally).",
  "The purpose of each disclosure.",
  "The right to revoke in writing, its limits and how to revoke.",
  "An expiration date or event (for a treatment, payment and operations consent, an event such as the end of treatment may be used).",
  "The client's signature and the date.",
  "A statement that the records may be redisclosed by some recipients, and about whether care depends on signing.",
  "SUD counseling notes need their own consent and are not covered by a general consent.",
] as const;

export const ROI_SOURCES: readonly Source[] = [
  {
    title: "45 CFR 164.508: Uses and disclosures for which an authorization is required",
    publisher: "Electronic Code of Federal Regulations (US Government)",
    url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.508",
  },
  {
    title: "42 CFR 2.31: Consent requirements",
    publisher: "Electronic Code of Federal Regulations (US Government)",
    url: "https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2/subpart-C/section-2.31",
  },
  {
    title: "42 CFR 2.32: Notice and copy of consent to accompany disclosure",
    publisher: "Electronic Code of Federal Regulations (US Government)",
    url: "https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2/subpart-C/section-2.32",
  },
  { title: "HIPAA and 42 CFR Part 2", publisher: "US Department of Health and Human Services", url: "https://www.hhs.gov/hipaa/part-2/" },
  {
    title: "Minimum necessary requirement",
    publisher: "US Department of Health and Human Services",
    url: "https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html",
  },
];

export const ROI_GOVERNANCE = { license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" } as const;

export const ROI_REVOKE =
  "I may revoke this authorization at any time by writing to the provider named above. Revoking it does not undo anything already done in reliance on it.";
export const ROI_CONDITIONING =
  "Signing is my choice. My treatment, payment, enrollment or eligibility for benefits will not depend on whether I sign.";
export const ROI_REDISCLOSURE =
  "Information shared under this authorization may be shared again by the recipient and may then no longer be protected by federal privacy law.";
export const ROI_COPY = "I may refuse to sign this form, and I am entitled to a copy of it once signed.";
export const ROI_PSYCHOTHERAPY_ONLY =
  "This authorization covers psychotherapy notes only. It cannot be combined with an authorization for any other records.";
export const ROI_PART2_LINE =
  "Substance use disorder records from a 42 CFR Part 2 program are included. They may be used or disclosed only as this consent and 42 CFR Part 2 allow. SUD counseling notes are not included and need a separate consent.";
export const ROI_TEMPLATE_NOTE =
  "Template from the Clinician Resource Companion. Not legal advice: check federal rules, state law and your organization's policies before use.";

export function roiIncludesPart2(input: RoiInput): boolean {
  return (
    input.recordKind === "general" &&
    (input.infoIds.some((id) => ROI_INFO.find((i) => i.id === id && "sud" in i && i.sud)) || mentionsSubstanceUse(input.note))
  );
}

export function roiDoc(input: RoiInput): DocSpec {
  const notes = input.recordKind === "psychotherapy-notes";
  const part2 = roiIncludesPart2(input);
  const title = notes ? "Authorization to disclose psychotherapy notes" : "Authorization to release health information";
  const note = scrubPHI(input.note.trim()).clean;
  const info = ROI_INFO.filter((i) => input.infoIds.includes(i.id)).map((i) => i.label);
  const purposes = ROI_PURPOSES.filter((p) => input.purposeIds.includes(p.id)).map((p) => p.label);

  const blocks: DocBlock[] = [
    { kind: "title", text: title },
    { kind: "fill", label: "Client name" },
    { kind: "heading", text: "Who may share the information" },
    { kind: "fill", label: "Provider or program" },
    { kind: "heading", text: "Who may receive it" },
    { kind: "fill", label: "Recipient (person or organization)" },
    { kind: "fill", label: "Recipient's address or secure contact" },
  ];
  if (input.direction === "exchange")
    blocks.push({ kind: "paragraph", text: "The provider and the recipient named above may share the information below with each other." });

  blocks.push({ kind: "heading", text: "Information to be shared" });
  if (notes) {
    blocks.push(
      { kind: "paragraph", text: "Psychotherapy notes kept by the provider named above." },
      { kind: "paragraph", text: ROI_PSYCHOTHERAPY_ONLY, style: "bold" },
    );
  } else if (info.length) {
    blocks.push({ kind: "list", items: info });
  } else {
    blocks.push({ kind: "paragraph", text: "Describe the information specifically:", style: "muted" }, { kind: "write", lines: 2 });
  }
  if (note) blocks.push({ kind: "paragraph", text: `Limits: ${note}` });
  if (part2) blocks.push({ kind: "paragraph", text: ROI_PART2_LINE, style: "bold" });

  blocks.push({ kind: "heading", text: "Purpose" });
  if (purposes.length) blocks.push({ kind: "list", items: purposes });
  else blocks.push({ kind: "paragraph", text: "Describe each purpose:", style: "muted" }, { kind: "write", lines: 2 });

  blocks.push(
    { kind: "heading", text: "When this authorization ends" },
    { kind: "fill", label: "End date or event" },
    { kind: "heading", text: "My rights" },
    { kind: "list", items: [ROI_REVOKE, ROI_CONDITIONING, ROI_REDISCLOSURE, ROI_COPY] },
    { kind: "fill", label: "Send a written revocation to" },
    { kind: "heading", text: "Signature" },
    { kind: "fill", label: "Signature" },
    { kind: "fill", label: "Date signed" },
    { kind: "fill", label: "If signed by a representative: their name and authority to act" },
    { kind: "paragraph", text: ROI_TEMPLATE_NOTE, style: "muted" },
  );
  return { title, blocks, part2 };
}
