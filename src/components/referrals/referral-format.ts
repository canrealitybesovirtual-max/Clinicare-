/**
 * Pure display helpers for the Referrals screen (spec screen 7). Isomorphic; no I/O.
 * Phone and text links are built only from curated directory entries or public listing data, never typed text.
 */
import type { ReferralKind } from "@/lib/schemas-referrals";

/** "1-800-662-4357" -> "tel:18006624357"; "301-555-0123 ext. 12" -> "tel:3015550123". Null when nothing dialable. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const main = phone.replace(/\s*(?:ext\.?|x|extension)\s*\d+\s*$/i, "");
  const digits = main.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return /\d{3,}/.test(digits) ? `tel:${digits}` : null;
}

/**
 * Number to text from a curated instruction: "Text HOME to 741741" -> "741741", "Text 988" -> "988",
 * "Text START to 678-678" -> "678678", "Text 0477 13 11 14" -> "0477131114". Null when none.
 */
export function smsNumber(instruction: string | null | undefined): string | null {
  if (!instruction) return null;
  const to = /\bto\s+([+\d][\d\s()-]*)\s*$/i.exec(instruction);
  const raw = to ? to[1]! : instruction.replace(/^\s*text\s+/i, "");
  if (!/^[+\d][\d\s()-]*$/.test(raw.trim())) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  return /^\+?\d{3,15}$/.test(digits) ? digits : null;
}

/**
 * Keyword and number of a curated text instruction, as written: "Text HOME to 741741" -> { keyword: "HOME",
 * number: "741741" }; "Text 988" -> { keyword: null, number: "988" }. Null when the instruction has no number.
 */
export function smsParts(instruction: string | null | undefined): { keyword: string | null; number: string } | null {
  if (!instruction || !smsNumber(instruction)) return null;
  const to = /^\s*text\s+(.+?)\s+to\s+([+\d][\d\s()-]*)\s*$/i.exec(instruction);
  if (to) return { keyword: to[1]!.trim(), number: to[2]!.trim() };
  return { keyword: null, number: instruction.replace(/^\s*text\s+/i, "").trim() };
}

export function smsHref(instruction: string | null | undefined): string | null {
  const n = smsNumber(instruction);
  return n ? `sms:${n}` : null;
}

/** Display order of the directory groups: ways to reach help now come first. */
export const KIND_ORDER: readonly ReferralKind[] = [
  "crisis",
  "helpline",
  "violence-and-abuse",
  "veterans",
  "deaf-hoh",
  "lgbtq",
  "perinatal",
  "older-adults-and-caregivers",
  "disability",
  "indigenous",
  "basic-needs",
  "peer-support",
  "low-cost",
  "directory",
  "substance-use",
  "medication",
];

export const KIND_LABELS: Record<ReferralKind, string> = {
  crisis: "Crisis lines",
  helpline: "Helplines",
  veterans: "Veterans and service members",
  "deaf-hoh": "Deaf and hard of hearing",
  lgbtq: "LGBTQ+ support",
  "peer-support": "Peer support and mutual help",
  "low-cost": "Low-cost and sliding-fee care",
  directory: "Provider directories",
  "substance-use": "Substance use treatment",
  medication: "Medication treatment for opioid use disorder",
  "violence-and-abuse": "Violence and abuse",
  perinatal: "Pregnancy and after birth",
  "older-adults-and-caregivers": "Older adults and caregivers",
  disability: "Disability and workplace accommodations",
  indigenous: "Indigenous health services",
  "basic-needs": "Housing and basic needs",
};

/** Kinds whose listings concern substance use care: show the 42 CFR Part 2 hub prompt. */
export const SUD_KINDS: readonly ReferralKind[] = ["substance-use", "medication"];

/** Directory regions offered in the region select (ISO-2 plus INTL). */
export const DIRECTORY_REGIONS = ["US", "CA", "GB", "IE", "AU", "NZ", "INTL"] as const;

const REGION_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  "GB-ENG": "England",
  "GB-SCT": "Scotland",
  "GB-WLS": "Wales",
  "GB-NIR": "Northern Ireland",
  IE: "Ireland",
  AU: "Australia",
  NZ: "New Zealand",
  INTL: "International",
};

export function regionLabel(region: string): string {
  return REGION_NAMES[region] ?? region;
}

const languageNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" });
  } catch {
    return null;
  }
})();

/** ["en", "es"] -> "English, Spanish"; unknown codes are shown as given. */
export function languageList(codes: readonly string[] | undefined): string {
  if (!codes?.length) return "";
  return codes
    .map((c) => {
      try {
        return languageNames?.of(c) ?? c;
      } catch {
        return c;
      }
    })
    .join(", ");
}

/** "2.4" -> "2.4 mi"; null -> null. */
export function milesLabel(miles: number | null | undefined): string | null {
  return typeof miles === "number" && Number.isFinite(miles) ? `${miles} mi` : null;
}
