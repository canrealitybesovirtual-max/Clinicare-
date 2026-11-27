/**
 * Content contracts (zod) for the Ethics & Legal Hub (screen 8; docs/SPEC.md sections 7 and 8):
 *   content/ethics/<id>.json -> EthicsCodeSchema  (one professional code or framework per file)
 *   content/legal/<id>.json  -> LegalTopicSchema  (one legal or regulatory topic per file)
 *
 * Rules enforced here:
 * - ORIGINAL wording only. Summaries, reminders, key points and steps describe a code or law in the app's own
 *   words and never paste its text. As a mechanical guard, those fields may not contain double quotation marks
 *   (quoted passages). The only verbatim text allowed is a short notice from a US federal regulation
 *   (public domain) in LegalTopic.requiredText, quoted exactly so it can be printed as the law requires.
 * - Governance on every item (G10): sources[], license "original", lastVerified, reviewedBy ("PENDING" until a
 *   licensed clinician signs off, which the UI shows as "Not yet clinically reviewed").
 * - Every summary says the item is information, not legal advice.
 * - Every legal whatToDo list ends by telling the clinician to consult their licensing board or regulator,
 *   or a healthcare attorney.
 * - Verification honesty: lastVerified is the day the edition, dates and URLs were last checked online, and
 *   verification.method says how strong that check was:
 *     "official-page" = the official page itself was loaded and read;
 *     "search-index"  = confirmed only through search-engine results that index the official pages;
 *     "secondary"     = only secondary sources (law firms, journals, other boards) agreed;
 *     "not-verified"  = not checked online; do not show as current.
 *   Anything weaker than "official-page", any edition that is not plainly current, and any reviewedBy of
 *   "PENDING" makes needsHumanCheck() true, so the UI can show a "check the official source" badge.
 *
 * Isomorphic: no server-only imports. Nothing in the hub is ever sent to an external API (G5, G17); the hub
 * only links out to official pages.
 */
import { z } from "zod";
import { governance, isoDate, slug } from "./schemas";

/* ------------------------------------------------------------------ */
/* Tags, professions, places                                           */
/* ------------------------------------------------------------------ */

/** Situations in which an ethics code should be surfaced (screen 8 prompts). */
export const ETHICS_TAGS = [
  "informed-consent",
  "faith-based",
  "telehealth",
  "sud",
  "assessment",
  "confidentiality",
  "dual-relationships",
  "technology",
  "cultural-competence",
  "duty-to-warn",
] as const;
export const EthicsTag = z.enum(ETHICS_TAGS);
export type EthicsTag = z.infer<typeof EthicsTag>;

/** Legal topics use the ethics tags plus a few legal-only ones. */
export const LEGAL_TAGS = [
  ...ETHICS_TAGS,
  "privacy",
  "records",
  "crisis",
  "abuse-reporting",
  "licensure",
  "device-regulation",
  "international",
] as const;
export const LegalTag = z.enum(LEGAL_TAGS);
export type LegalTag = z.infer<typeof LegalTag>;

export const PROFESSIONS = [
  "counselor",
  "social-worker",
  "mft",
  "psychologist",
  "psychiatrist",
  "psychiatric-nurse",
  "addiction-professional",
  "peer-recovery-specialist",
  "rehabilitation-counselor",
  "faith-based-counselor",
  "psychotherapist",
  "allied-health",
] as const;
export const Profession = z.enum(PROFESSIONS);
export type Profession = z.infer<typeof Profession>;

export const PROFESSION_LABELS: Record<Profession, string> = {
  counselor: "Professional counselors (LPC, LPCC, LMHC, NCC and equivalents)",
  "social-worker": "Social workers (LCSW, LISW, LMSW and equivalents)",
  mft: "Marriage and family therapists (LMFT)",
  psychologist: "Psychologists",
  psychiatrist: "Psychiatrists",
  "psychiatric-nurse": "Psychiatric-mental health nurses and psychiatric nurse practitioners",
  "addiction-professional": "Addiction counselors and other addiction professionals",
  "peer-recovery-specialist": "Peer recovery support specialists",
  "rehabilitation-counselor": "Rehabilitation counselors (CRC)",
  "faith-based-counselor": "Christian and other faith-based counselors",
  psychotherapist: "Psychotherapists and counsellors (international titles)",
  "allied-health": "Other regulated health and care professions",
};

const httpsUrl = z.url().refine((u) => u.startsWith("https://"), "https URLs only");

/** ISO 3166-1 alpha-2 country code, upper case (e.g. "US", "GB", "CA", "AU"). */
export const Iso2 = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 country code");
export const CountryOrIntl = z.union([Iso2, z.literal("INTL")]);

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

const QUOTES = /["“”]/;
/** Original wording only: no quoted passages from codes, statutes or guidance. */
const original = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !QUOTES.test(s), "original wording only: no quoted passages (remove double quotes)");

/** Every hub summary must say this (case-insensitive). */
export const NOT_LEGAL_ADVICE = /not legal advice/i;
const CONSULT = /\bconsult/i;
const BOARD_OR_ATTORNEY = /licensing board|licensure board|regulator|regulatory college|attorney|lawyer|solicitor/i;

export const OfficialLinkSchema = z.strictObject({
  title: z.string().min(3).max(160),
  url: httpsUrl,
});
export type OfficialLink = z.infer<typeof OfficialLinkSchema>;

export const VerificationMethod = z.enum(["official-page", "search-index", "secondary", "not-verified"]);
export type VerificationMethod = z.infer<typeof VerificationMethod>;

export const VerificationSchema = z.strictObject({
  method: VerificationMethod,
  /** What was checked, how, and what is still unconfirmed. */
  note: z.string().min(10).max(900),
});
export type Verification = z.infer<typeof VerificationSchema>;

/** Indices of repeated values (used for duplicate checks inside superRefine). */
function duplicateIndices(values: readonly string[]): number[] {
  const seen = new Set<string>();
  const dupes: number[] = [];
  values.forEach((v, i) => {
    if (seen.has(v)) dupes.push(i);
    seen.add(v);
  });
  return dupes;
}

/* ------------------------------------------------------------------ */
/* Ethics codes                                                        */
/* ------------------------------------------------------------------ */

export const KeyReminderSchema = z.strictObject({
  topic: z.string().min(3).max(80),
  text: original(20, 420),
  /** Optional: which hub tags this reminder answers. Must also appear in the code's whenRelevant. */
  tags: z.array(EthicsTag).min(1).max(4).optional(),
});
export type KeyReminder = z.infer<typeof KeyReminderSchema>;

export const EditionStatus = z.enum(["current", "revision-in-progress", "edition-unconfirmed"]);
export type EditionStatus = z.infer<typeof EditionStatus>;

export const EthicsCodeSchema = z
  .strictObject({
    id: slug,
    name: z.string().min(5).max(180),
    shortName: z.string().min(2).max(40),
    organization: z.string().min(3).max(180),
    /** Year of the edition in use (e.g. 2014 for the ACA code, 2002 for the amended APA code). */
    edition: z.number().int().min(1990).max(2100),
    /** Human-readable edition line, e.g. "2002 code, amended effective 2010 and 2017". */
    editionLabel: z.string().min(4).max(200),
    effectiveDate: isoDate.optional(),
    editionStatus: EditionStatus,
    /** Required unless editionStatus is "current": what is pending or unconfirmed. */
    editionNote: z.string().min(10).max(700).optional(),
    appliesTo: z.array(Profession).min(1),
    /** ISO-2 countries where the code is relevant, or ["INTL"] for global frameworks. */
    countries: z.array(CountryOrIntl).min(1).max(40),
    scope: z.enum(["national", "regional", "global"]),
    /** Required for regional codes, e.g. "Europe (EFPA member associations)". */
    regionLabel: z.string().min(3).max(160).optional(),
    summary: original(120, 1100),
    keyReminders: z.array(KeyReminderSchema).min(3).max(10),
    whenRelevant: z.array(EthicsTag).min(1),
    /** Who licenses or registers the profession where the code applies; always point to the local regulator. */
    regulatorNote: original(20, 500),
    officialUrl: httpsUrl,
    relatedLinks: z.array(OfficialLinkSchema).max(6).optional(),
    verification: VerificationSchema,
    ...governance,
    license: z.literal("original"),
  })
  .superRefine((c, ctx) => {
    if (!NOT_LEGAL_ADVICE.test(c.summary)) {
      ctx.addIssue({ code: "custom", message: "summary must say it is information, not legal advice", path: ["summary"] });
    }
    const intl = c.countries.includes("INTL");
    if (c.scope === "global" && (!intl || c.countries.length !== 1)) {
      ctx.addIssue({ code: "custom", message: 'global codes use countries ["INTL"]', path: ["countries"] });
    }
    if (c.scope !== "global" && intl) {
      ctx.addIssue({ code: "custom", message: "national and regional codes list ISO-2 countries, not INTL", path: ["countries"] });
    }
    if (c.scope === "regional" && !c.regionLabel) {
      ctx.addIssue({ code: "custom", message: "regional codes need a regionLabel", path: ["regionLabel"] });
    }
    if (c.editionStatus !== "current" && !c.editionNote) {
      ctx.addIssue({ code: "custom", message: "explain a non-current edition status in editionNote", path: ["editionNote"] });
    }
    if (c.effectiveDate && Number(c.effectiveDate.slice(0, 4)) < c.edition) {
      ctx.addIssue({ code: "custom", message: "effectiveDate is earlier than the edition year", path: ["effectiveDate"] });
    }
    for (const i of duplicateIndices(c.countries)) ctx.addIssue({ code: "custom", message: "duplicate country", path: ["countries", i] });
    for (const i of duplicateIndices(c.appliesTo)) ctx.addIssue({ code: "custom", message: "duplicate profession", path: ["appliesTo", i] });
    for (const i of duplicateIndices(c.whenRelevant)) ctx.addIssue({ code: "custom", message: "duplicate tag", path: ["whenRelevant", i] });
    c.keyReminders.forEach((r, i) => {
      for (const t of r.tags ?? []) {
        if (!c.whenRelevant.includes(t)) {
          ctx.addIssue({ code: "custom", message: `reminder tag ${t} is missing from whenRelevant`, path: ["keyReminders", i, "tags"] });
        }
      }
    });
  });
export type EthicsCode = z.infer<typeof EthicsCodeSchema>;

/* ------------------------------------------------------------------ */
/* Legal topics                                                        */
/* ------------------------------------------------------------------ */

/** "US-federal", "US-state-varies", "INTL" or an ISO-2 country code. */
export const LegalJurisdiction = z.union([z.enum(["US-federal", "US-state-varies", "INTL"]), Iso2]);
export type LegalJurisdiction = z.infer<typeof LegalJurisdiction>;

export const RequiredTextSchema = z.strictObject({
  label: z.string().min(3).max(140),
  /** Exact wording from a US federal regulation (public domain). Quote it exactly; never paraphrase. */
  text: z.string().min(10).max(600),
  citation: z.string().min(3).max(140),
  sourceUrl: httpsUrl,
  note: z.string().min(10).max(900).optional(),
});
export type RequiredText = z.infer<typeof RequiredTextSchema>;

export const LegalTopicSchema = z
  .strictObject({
    id: slug,
    title: z.string().min(5).max(140),
    jurisdiction: LegalJurisdiction,
    /** For INTL topics: the ISO-2 countries the topic covers (used to filter by the user's country). */
    appliesIn: z.array(Iso2).min(1).max(40).optional(),
    summary: original(120, 1500),
    keyPoints: z.array(original(20, 700)).min(3).max(16),
    /** Practical steps. The LAST step always sends the clinician to their licensing board/regulator or a healthcare attorney. */
    whatToDo: z.array(original(15, 450)).min(2).max(10),
    officialLinks: z.array(OfficialLinkSchema).min(1).max(16),
    requiredText: z.array(RequiredTextSchema).max(4).optional(),
    /** How this app is designed around the topic (e.g. zero-PHI, Part 2 banner, clinician-only suggestions). */
    appPositioning: original(20, 900).optional(),
    whenRelevant: z.array(LegalTag).min(1),
    /** True when status changes often (compacts, pending rules): the UI shows a "check current status" badge. */
    changesOften: z.boolean(),
    /** Date the status described here was true (on or before lastVerified). */
    statusAsOf: isoDate,
    verification: VerificationSchema,
    ...governance,
    license: z.literal("original"),
  })
  .superRefine((t, ctx) => {
    if (!NOT_LEGAL_ADVICE.test(t.summary)) {
      ctx.addIssue({ code: "custom", message: "summary must say it is information, not legal advice", path: ["summary"] });
    }
    const last = t.whatToDo[t.whatToDo.length - 1] ?? "";
    if (!CONSULT.test(last) || !BOARD_OR_ATTORNEY.test(last)) {
      ctx.addIssue({
        code: "custom",
        message: "the last whatToDo step must say to consult the licensing board/regulator or a healthcare attorney",
        path: ["whatToDo", t.whatToDo.length - 1],
      });
    }
    if (t.appliesIn && t.jurisdiction !== "INTL") {
      ctx.addIssue({ code: "custom", message: "appliesIn is only for INTL topics", path: ["appliesIn"] });
    }
    if (t.statusAsOf > t.lastVerified) {
      ctx.addIssue({ code: "custom", message: "statusAsOf is after lastVerified", path: ["statusAsOf"] });
    }
    for (const i of duplicateIndices(t.whenRelevant)) ctx.addIssue({ code: "custom", message: "duplicate tag", path: ["whenRelevant", i] });
    for (const i of duplicateIndices(t.appliesIn ?? [])) ctx.addIssue({ code: "custom", message: "duplicate country", path: ["appliesIn", i] });
  });
export type LegalTopic = z.infer<typeof LegalTopicSchema>;

/* ------------------------------------------------------------------ */
/* Contextual prompts (screen 8: faith-based -> AACC consent, SUD -> Part 2, telehealth -> jurisdiction) */
/* ------------------------------------------------------------------ */

export const HUB_CONTEXTS = ["faith-based", "sud", "telehealth", "assessment", "duty-to-warn", "technology"] as const;
export type HubContext = (typeof HUB_CONTEXTS)[number];

export interface HubPrompt {
  /** Short, original clinician-facing reminder shown on the screen that triggers it. */
  message: string;
  ethicsIds: readonly string[];
  legalIds: readonly string[];
}

export const HUB_PROMPTS: Record<HubContext, HubPrompt> = {
  "faith-based": {
    message:
      "Faith-integrated work: explain what you propose and get the client's informed consent first, follow the client's lead, document it, and never impose beliefs.",
    ethicsIds: ["aacc-code-of-ethics", "aca-code-of-ethics"],
    legalIds: [],
  },
  sud: {
    message:
      "Substance use: 42 CFR Part 2 may protect these records in addition to HIPAA. This app stores nothing; exports carry the Part 2 notice. Check consent before any disclosure.",
    ethicsIds: ["naadac-ncc-ap-code-of-ethics"],
    legalIds: ["42-cfr-part-2", "hipaa-privacy-basics"],
  },
  telehealth: {
    message:
      "Telehealth: you generally need authority to practice where the client is physically located during the session. Check your license, any compact privilege, and that state's consent rules.",
    ethicsIds: ["aca-code-of-ethics", "nasw-code-of-ethics", "aamft-code-of-ethics", "apa-ethical-principles-psychologists"],
    legalIds: ["telehealth-jurisdiction", "informed-consent-technology"],
  },
  assessment: {
    message:
      "Measures and suggestions support your judgment and never replace it. Use validated tools as intended and interpret scores in cultural context.",
    ethicsIds: ["apa-ethical-principles-psychologists", "aca-code-of-ethics"],
    legalIds: ["fda-cds"],
  },
  "duty-to-warn": {
    message:
      "Threats of violence, abuse or imminent self-harm: duties differ by state and country. Follow your crisis protocol, consult, document, and call 988 or emergency services when needed.",
    ethicsIds: ["aca-code-of-ethics", "nasw-code-of-ethics"],
    legalIds: ["duty-to-warn-protect", "mandatory-reporting", "crisis-and-involuntary-holds", "crisis-988-or-911"],
  },
  technology: {
    message:
      "Technology: tell clients how the platform protects their information, its risks, and the backup plan, and use only tools covered by a business associate agreement where HIPAA applies.",
    ethicsIds: ["aca-code-of-ethics", "nasw-code-of-ethics", "naadac-ncc-ap-code-of-ethics"],
    legalIds: ["informed-consent-technology", "hipaa-privacy-basics", "international-privacy"],
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const SCOPE_RANK: Record<EthicsCode["scope"], number> = { national: 0, regional: 1, global: 2 };

/**
 * Codes relevant to a country, profession and/or tag. National codes first, then regional, then global;
 * alphabetical within each group. Global ("INTL") codes are always included for any country.
 */
export function ethicsCodesFor(
  codes: readonly EthicsCode[],
  opts: { country?: string; profession?: Profession; tag?: EthicsTag } = {},
): EthicsCode[] {
  const { country, profession, tag } = opts;
  return codes
    .filter((c) => !country || c.countries.includes(country) || c.countries.includes("INTL"))
    .filter((c) => !profession || c.appliesTo.includes(profession))
    .filter((c) => !tag || c.whenRelevant.includes(tag))
    .sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || a.name.localeCompare(b.name));
}

/** Legal topics relevant to a country and/or tag. US topics show for "US"; INTL topics follow appliesIn. */
export function legalTopicsFor(topics: readonly LegalTopic[], opts: { country?: string; tag?: LegalTag } = {}): LegalTopic[] {
  const { country, tag } = opts;
  const inCountry = (t: LegalTopic): boolean => {
    if (!country) return true;
    if (t.jurisdiction === "US-federal" || t.jurisdiction === "US-state-varies") return country === "US";
    if (t.jurisdiction === "INTL") return !t.appliesIn || t.appliesIn.includes(country);
    return t.jurisdiction === country;
  };
  return topics.filter((t) => inCountry(t) && (!tag || t.whenRelevant.includes(tag)));
}

/** True when a person must re-check the item against the official source before relying on it. */
export function needsHumanCheck(item: {
  verification: Verification;
  reviewedBy: string;
  editionStatus?: EditionStatus;
}): boolean {
  return (
    item.verification.method !== "official-page" ||
    item.reviewedBy.trim().toUpperCase() === "PENDING" ||
    (item.editionStatus !== undefined && item.editionStatus !== "current")
  );
}

/**
 * Cross-file checks for the content validator and tests. Returns error strings (empty = OK).
 * `files` maps each parsed item to the file name it came from, so id/file mismatches are caught.
 */
export function hubProblems(
  codes: readonly { file: string; item: EthicsCode }[],
  topics: readonly { file: string; item: LegalTopic }[],
  today: string = new Date().toISOString().slice(0, 10),
): string[] {
  const problems: string[] = [];
  const codeIds = new Set<string>();
  const topicIds = new Set<string>();
  for (const { file, item } of codes) {
    if (codeIds.has(item.id)) problems.push(`ethics/${item.id}: duplicate id`);
    codeIds.add(item.id);
    if (file.replace(/\.json$/, "") !== item.id) problems.push(`ethics/${file}: id ${item.id} does not match the file name`);
    if (item.lastVerified > today) problems.push(`ethics/${item.id}: lastVerified in the future`);
  }
  for (const { file, item } of topics) {
    if (topicIds.has(item.id)) problems.push(`legal/${item.id}: duplicate id`);
    topicIds.add(item.id);
    if (file.replace(/\.json$/, "") !== item.id) problems.push(`legal/${file}: id ${item.id} does not match the file name`);
    if (item.lastVerified > today) problems.push(`legal/${item.id}: lastVerified in the future`);
  }
  for (const [ctxName, p] of Object.entries(HUB_PROMPTS)) {
    for (const id of p.ethicsIds) if (!codeIds.has(id)) problems.push(`HUB_PROMPTS.${ctxName}: unknown ethics id ${id}`);
    for (const id of p.legalIds) if (!topicIds.has(id)) problems.push(`HUB_PROMPTS.${ctxName}: unknown legal id ${id}`);
  }
  const part2 = topics.find((t) => t.item.id === "42-cfr-part-2")?.item;
  if (part2 && !(part2.requiredText ?? []).some((r) => /42 CFR part 2/i.test(r.text))) {
    problems.push("legal/42-cfr-part-2: missing the required Part 2 notice in requiredText");
  }
  return problems;
}
