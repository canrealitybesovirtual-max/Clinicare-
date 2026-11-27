/**
 * Display helpers shared by the AI panels. Curated wording only; nothing here reads clinical text.
 */
import { getSymptom } from "@/lib/content";
import type { FollowUpReferralKind } from "@/lib/schemas-follow-up";
import { PROVIDER_TYPE_OPTIONS } from "@/components/referrals/search-options";

const PROVIDER_LABELS = new Map<string, string>(PROVIDER_TYPE_OPTIONS.map((p) => [p.id, p.label]));

/** Plain names for the referral kinds the follow-up engine and the assistant point to. All open /referrals. */
export const REFERRAL_LABELS: Readonly<Record<FollowUpReferralKind, string>> = {
  psychologist: PROVIDER_LABELS.get("psychologist") ?? "Psychologist",
  "clinical-psychologist": PROVIDER_LABELS.get("clinical-psychologist") ?? "Clinical psychologist",
  "professional-counselor": PROVIDER_LABELS.get("professional-counselor") ?? "Licensed professional counselor",
  "mental-health-counselor": PROVIDER_LABELS.get("mental-health-counselor") ?? "Mental health counselor",
  "clinical-social-worker": PROVIDER_LABELS.get("clinical-social-worker") ?? "Licensed clinical social worker",
  "marriage-family-therapist": PROVIDER_LABELS.get("marriage-family-therapist") ?? "Marriage and family therapist",
  psychiatrist: PROVIDER_LABELS.get("psychiatrist") ?? "Psychiatrist",
  "psychiatric-np": PROVIDER_LABELS.get("psychiatric-np") ?? "Psychiatric nurse practitioner",
  "addiction-counselor": PROVIDER_LABELS.get("addiction-counselor") ?? "Addiction counselor",
  "primary-care": "Primary care or a community health center",
  "urgent-medical": "Urgent medical assessment",
  "sleep-medicine": "Sleep medicine",
  crisis: "Crisis lines (988 in the US)",
  "substance-use": "Substance-use services",
  "peer-support": "Peer support groups",
};

/**
 * The lexicon label up to its first clause ("Fear tied to one kind of thing or situation (an animal, ...)" ->
 * "Fear tied to one kind of thing or situation"), for chips. Full labels stay on the Diagnoses cards.
 */
export function shortSymptomLabel(id: string): string {
  const label = (getSymptom(id)?.label ?? id).replace(/^context:\s*/i, "");
  const cut = label.search(/\s\(|[:;]/);
  const short = (cut > 12 ? label.slice(0, cut) : label).trim();
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** "F40.210, F40.218, F40.220 +11 more". */
export function codeSummary(codes: readonly { code: string }[], max = 3): string {
  const shown = codes
    .slice(0, max)
    .map((c) => c.code)
    .join(", ");
  return codes.length > max ? `${shown} +${codes.length - max} more` : shown;
}
