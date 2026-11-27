/**
 * "Where to get help" for client mode (G3, G9): crisis lines and helplines from the curated referral directories
 * (content/referrals/us.json and international.json), reduced to what a client needs: name, how to reach the
 * service, hours, website, and the description only when it passes the client-mode text filter.
 * Server-side only (reads content JSON); the page passes plain data down.
 */
import usJson from "@content/referrals/us.json";
import intlJson from "@content/referrals/international.json";
import type { Text } from "@/lib/i18n/core";
import { COUNTRY_NAMES } from "@/lib/i18n/shell";
import { ReferralDirectorySchema, isVerified, type ReferralEntry } from "@/lib/schemas-referrals";
import { isPlainSafe } from "./plain-text";

export interface HelpEntry {
  id: string;
  name: string;
  description: string | null;
  audience: string | null;
  phone: string | null;
  /** Digits (and a leading +) for a tel: link. */
  tel: string | null;
  phoneNote: string | null;
  text: string | null;
  chat: string | null;
  url: string;
  hours: string | null;
  verified: boolean;
  /** A 24/7 crisis, veterans or deaf/hard-of-hearing crisis line: its call button uses the crisis colour. */
  crisis: boolean;
}

export interface HelpRegion {
  region: string;
  /** Country name in English and Spanish (shell COUNTRY_NAMES). */
  label: Text;
  entries: HelpEntry[];
}

const REGION_ORDER = ["US", "CA", "GB", "IE", "AU", "NZ"] as const satisfies readonly (keyof typeof COUNTRY_NAMES)[];

/** Kinds a client can call, text or chat with directly. */
const KINDS = new Set<ReferralEntry["kind"]>(["crisis", "helpline", "veterans", "deaf-hoh", "lgbtq"]);

function isHelpLine(e: ReferralEntry): boolean {
  if (KINDS.has(e.kind)) return Boolean(e.phone || e.text || e.chat);
  // The SAMHSA National Helpline is filed under substance-use; locators and directories are not helplines.
  return e.kind === "substance-use" && /helpline/i.test(e.name) && Boolean(e.phone);
}

const plainOrNull = (s: string | undefined) => (s && isPlainSafe(s) ? s : null);

function toEntry(e: ReferralEntry): HelpEntry {
  return {
    id: e.id,
    name: e.name,
    description: plainOrNull(e.description),
    audience: plainOrNull(e.audience),
    phone: e.phone ?? null,
    tel: e.phone ? e.phone.replace(/[^\d+]/g, "") : null,
    phoneNote: plainOrNull(e.phoneNote),
    text: plainOrNull(e.text),
    chat: e.chat ?? null,
    url: e.url,
    hours: plainOrNull(e.hours),
    verified: isVerified(e),
    crisis: e.kind === "crisis" || e.kind === "veterans" || e.kind === "deaf-hoh",
  };
}

export function helpRegions(): HelpRegion[] {
  const entries = [ReferralDirectorySchema.parse(usJson), ReferralDirectorySchema.parse(intlJson)]
    .flatMap((d) => d.entries)
    .filter(isHelpLine)
    .filter((e) => isPlainSafe(e.name));
  const byRegion = new Map<string, ReferralEntry[]>();
  for (const e of entries) {
    const region = e.region.split("-")[0] ?? e.region;
    byRegion.set(region, [...(byRegion.get(region) ?? []), e]);
  }
  return REGION_ORDER.filter((r) => byRegion.has(r)).map((r) => ({
    region: r,
    label: COUNTRY_NAMES[r],
    entries: (byRegion.get(r) ?? [])
      .sort((a, b) => Number(b.kind === "crisis") - Number(a.kind === "crisis"))
      .map(toEntry),
  }));
}
