/**
 * Content contract for the curated, link-out-only referral directories:
 *   content/referrals/us.json, content/referrals/international.json
 * Guardrails: G8 (link out only, never re-host), G9 (crisis entries must carry a way to reach help),
 * G10 (sources + license + verification on every entry), G12 (adult-only scope: no youth-only services;
 * age-limited services carry an adult ageRange), G4 (no unproven-treatment listings; see scripts/guardrail-scan.sh).
 *
 * Verification: an entry's lastVerified is an ISO date ONLY when its official source was checked online that day;
 * otherwise it is "unverified" and `verification` says what was cross-checked and how. A person must confirm
 * every "unverified" crisis entry against the official site before release.
 */
import { z } from "zod";
import { SourceSchema, isoDate, slug } from "./schemas";

export const REFERRAL_KINDS = [
  "crisis",
  "helpline",
  "directory",
  "low-cost",
  "peer-support",
  "veterans",
  "substance-use",
  "medication",
  "lgbtq",
  "deaf-hoh",
  // Population services (content/populations links to these kinds); add a kind only with at least one entry.
  "violence-and-abuse",
  "perinatal",
  "older-adults-and-caregivers",
  "disability",
  "basic-needs",
  "indigenous",
] as const;
export const ReferralKind = z.enum(REFERRAL_KINDS);
export type ReferralKind = z.infer<typeof ReferralKind>;

/**
 * Kinds whose call and text buttons use the crisis colour (clinician directory and client help): 24/7 crisis
 * lines, the Veterans Crisis Line group, the ASL crisis line and the violence and sexual assault hotlines.
 */
export const CRISIS_LIKE_KINDS: ReadonlySet<ReferralKind> = new Set(["crisis", "veterans", "deaf-hoh", "violence-and-abuse"]);

const httpsUrl = z.url().refine((u) => u.startsWith("https://"), "https URLs only");

/** ISO 3166-1 alpha-2 country, optional ISO 3166-2 subdivision (e.g. "GB-ENG"), or "INTL". */
export const ReferralRegion = z.string().regex(/^(?:INTL|[A-Z]{2}(?:-[A-Z0-9]{1,3})?)$/, "ISO 3166 region or INTL");

/** Dialable public number as printed by the service: digits, spaces, hyphens, parentheses, leading +. */
export const PublicPhone = z.string().regex(/^\+?[0-9][0-9 ()-]{1,22}[0-9]$/, "public phone number");

export const ReferralLastVerified = z.union([isoDate, z.literal("unverified")]);

export const ReferralEntrySchema = z
  .strictObject({
    id: slug,
    name: z.string().min(3).max(100),
    description: z.string().min(20).max(400), // original wording, clinician-facing
    url: httpsUrl,
    phone: PublicPhone.optional(),
    phoneNote: z.string().min(3).max(120).optional(), // e.g. "Dial 988, then press 1"
    text: z.string().min(3).max(100).optional(), // e.g. "Text HOME to 741741"
    chat: httpsUrl.optional(),
    videophone: z.string().min(3).max(120).optional(),
    region: ReferralRegion,
    kind: ReferralKind,
    languages: z.array(z.string().regex(/^[a-z]{2,3}$/, "ISO 639 code")).min(1).optional(),
    hours: z.string().min(3).max(140).optional(),
    audience: z.string().min(3).max(200).optional(),
    /** Adult-only app (G12): a service with an age limit may be listed only for its adult band. */
    ageRange: z.strictObject({ min: z.number().int().min(18), max: z.number().int().min(18).max(120).optional() }).optional(),
    commercial: z.boolean().optional(), // commercial directory: show "listings are paid / not vetted"
    cost: z.string().min(3).max(200).optional(),
    notes: z.array(z.string().min(5).max(300)).max(6).optional(),
    lastVerified: ReferralLastVerified,
    verification: z.string().min(10).max(500),
    sources: z.array(SourceSchema).min(1),
  })
  .superRefine((e, ctx) => {
    if ((e.kind === "crisis" || e.kind === "helpline") && !e.phone && !e.text && !e.chat) {
      ctx.addIssue({ code: "custom", message: "crisis/helpline entries need a phone, text or chat route", path: ["phone"] });
    }
    if (e.ageRange?.max !== undefined && e.ageRange.max < e.ageRange.min) {
      ctx.addIssue({ code: "custom", message: "ageRange.max < ageRange.min", path: ["ageRange"] });
    }
    if (e.ageRange && !e.audience) {
      ctx.addIssue({ code: "custom", message: "age-limited entries must state the audience", path: ["audience"] });
    }
  });
export type ReferralEntry = z.infer<typeof ReferralEntrySchema>;

export const ReferralDirectorySchema = z
  .strictObject({
    _rule: z.string().min(20),
    scope: z.enum(["US", "international"]),
    sources: z.array(SourceSchema).min(1),
    license: z.literal("original"), // descriptions are app-authored; services are linked, never re-hosted
    /** Null: the file as a whole has not been verified by a person; see each entry's lastVerified. */
    lastVerified: isoDate.nullable(),
    compiledOn: isoDate,
    reviewedBy: z.string().min(1), // "PENDING" until a licensed clinician signs off
    entries: z.array(ReferralEntrySchema).min(1),
  })
  .superRefine((dir, ctx) => {
    const seen = new Set<string>();
    dir.entries.forEach((e, i) => {
      if (seen.has(e.id)) ctx.addIssue({ code: "custom", message: `duplicate id ${e.id}`, path: ["entries", i, "id"] });
      seen.add(e.id);
      if (dir.scope === "US" && !/^US(?:-|$)/.test(e.region)) {
        ctx.addIssue({ code: "custom", message: "US directory entries must have a US region", path: ["entries", i, "region"] });
      }
      if (dir.scope === "international" && /^US(?:-|$)/.test(e.region)) {
        ctx.addIssue({ code: "custom", message: "US entries belong in us.json", path: ["entries", i, "region"] });
      }
    });
  });
export type ReferralDirectory = z.infer<typeof ReferralDirectorySchema>;

/** True only when the entry's official source was checked online (see file header). */
export function isVerified(entry: Pick<ReferralEntry, "lastVerified">): boolean {
  return entry.lastVerified !== "unverified";
}

/** Entries of one kind, crisis entries first within a region; stable otherwise. */
export function referralsFor(dir: ReferralDirectory, opts: { kind?: ReferralKind; region?: string } = {}): ReferralEntry[] {
  return dir.entries
    .filter((e) => (!opts.kind || e.kind === opts.kind) && (!opts.region || e.region === opts.region || e.region.startsWith(`${opts.region}-`) || e.region === "INTL"))
    .sort((a, b) => Number(b.kind === "crisis") - Number(a.kind === "crisis"));
}
