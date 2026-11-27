/**
 * Content contract (zod) for population adaptation profiles: content/populations/<id>.json -> PopulationSchema.
 *
 * A profile collects, in the app's own words, what research and practice guidance say about adapting assessment,
 * sessions and interventions for adults who share a context (a life stage, a culture or identity, a disability or
 * way of communicating, a kind of work, a circumstance or a health condition). It is clinician-facing reference only:
 * - Considerations to ASK ABOUT, never assumptions: every profile carries questions to explore with the person
 *   (askAbout, written as questions) and a stereotypeCaution, and sweeping claims such as "most refugees are..." are
 *   refused by the schema. People differ more within any group than between groups.
 * - Nothing about a person is collected: the app never asks for or stores identity, status, diagnosis or membership
 *   of any group (G5), and nothing here matches or scores a client. Adult scope only (G12).
 * - ORIGINAL wording only (G1, G2): every text field refuses double quotation marks, so no quoted passage from a
 *   manual, worksheet, book or code can be pasted in.
 * - Licensed measures other than the built-in GAD-7 and PHQ-9 appear only as link-outs (measuresPending) whose
 *   licenseKey is registered in content/licenses.json (G7). Safety notes sit next to the crisis resources, which the
 *   page always shows, and never produce a risk level (G9). Profiles whose wording touches substance use carry sud,
 *   which shows the 42 CFR Part 2 notice (G6).
 * - Governance on every item (G10): sources[], license "original", lastVerified, reviewedBy ("PENDING" until a
 *   licensed clinician signs off).
 * Cross-file checks (links, licenses, referral kinds, Part 2 tagging) live in src/lib/populations.ts.
 * Isomorphic: no server-only imports. Nothing here is ever sent to an external API (G5, G17).
 */
import { z } from "zod";
import { governance, isoDate, slug } from "./schemas";
import { PendingMeasureSchema } from "./schemas-practice";
import { ReferralKind } from "./schemas-referrals";

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

export const POPULATION_GROUPS = [
  "culture-and-identity",
  "life-stage",
  "disability-and-communication",
  "service-and-work",
  "circumstances",
  "health-and-body",
] as const;
export const PopulationGroup = z.enum(POPULATION_GROUPS);
export type PopulationGroup = z.infer<typeof PopulationGroup>;

/** Index headings, shown in the fixed order above (never a ranking). */
export const POPULATION_GROUP_LABELS: Record<PopulationGroup, { label: string; line: string }> = {
  "culture-and-identity": {
    label: "Culture, identity and belief",
    line: "Adapting care to culture, faith, gender and sexuality, without assuming what any of them means to the person.",
  },
  "life-stage": { label: "Life stages", line: "Pregnancy and early parenthood, later life and student life." },
  "disability-and-communication": {
    label: "Disability, neurodivergence and communication",
    line: "Access, communication and pacing for disabled, autistic, Deaf and brain-injured adults.",
  },
  "service-and-work": {
    label: "Military service and high-exposure work",
    line: "Veterans, service members, first responders and health workers.",
  },
  circumstances: {
    label: "Circumstances and systems",
    line: "Migration, the justice system, housing, rural life and surviving sexual violence or exploitation.",
  },
  "health-and-body": {
    label: "Physical health and sexual health",
    line: "Serious medical illness, post-exertional malaise and raising sexual concerns.",
  },
};

/* ------------------------------------------------------------------ */
/* Field helpers                                                       */
/* ------------------------------------------------------------------ */

const QUOTES = /["“”]/;
/** Original wording only: no quoted passages from manuals, worksheets, books or codes. */
const original = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !QUOTES.test(s), "original wording only: no quoted passages (remove double quotes)");

/** A 4-digit year, so an evidence statement always says when the cited body or study reported it (G13). */
const citesYear = (min: number, max: number) =>
  original(min, max).refine((s) => /\b(19|20)\d{2}\b/.test(s), "cite the body or study with its year");

const httpsUrl = z.url().refine((u) => u.startsWith("https://"), "https URLs only");

/**
 * Sweeping statements about what a whole group is, has or wants ("most veterans are...", "all autistic people
 * prefer..."). Profiles describe what to ask about; they never assign traits to people by group.
 */
export const GENERALIZATION =
  /\b(?:all|most|every|these)\s+(?:[a-z-]+\s){0,3}?(?:people|persons|clients|patients|men|women|veterans|refugees|immigrants|migrants|students|survivors|adults|parents|elders|families)\s+(?:are|have|will|tend|prefer|need|want|believe|feel|do not|don't|cannot|can't)\b/i;
const unassuming = (min: number, max: number) =>
  original(min, max).refine((s) => !GENERALIZATION.test(s), "describe what to ask about, not what a whole group is or wants");

/** A question to explore with the person (cultural humility): always phrased as a question. */
const question = original(10, 300)
  .refine((s) => s.trim().endsWith("?"), "write each prompt as a question to explore with the person")
  .refine((s) => !GENERALIZATION.test(s), "describe what to ask about, not what a whole group is or wants");

/**
 * How one library intervention or orientation changes for this context. Exactly one target: an intervention
 * (content/interventions id) or an orientation profile (content/orientations id).
 */
export const PopulationInterventionNoteSchema = z
  .strictObject({
    interventionId: slug.optional(),
    orientationId: slug.optional(),
    note: unassuming(20, 600),
  })
  .refine((n) => (n.interventionId === undefined) !== (n.orientationId === undefined), "name exactly one interventionId or orientationId");
export type PopulationInterventionNote = z.infer<typeof PopulationInterventionNoteSchema>;

/** A public page from an official body or community organization. Link-out only; nothing is copied. */
export const PopulationLinkOutSchema = z.strictObject({
  title: original(3, 200),
  publisher: original(2, 160),
  url: httpsUrl,
  note: original(5, 300).optional(),
  /** The day the link was checked online (or confirmed as linked from an official page that was). */
  lastVerified: isoDate,
});
export type PopulationLinkOut = z.infer<typeof PopulationLinkOutSchema>;

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => (seen.has(v) ? true : (seen.add(v), false)));
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

export const PopulationSchema = z
  .strictObject({
    id: slug,
    name: original(3, 90),
    group: PopulationGroup,
    /** One or two sentences for the index card. */
    summary: original(40, 360),
    /** Who the profile is for and what it never does (adult scope; nothing about the person is collected). */
    scopeNote: original(40, 500),
    /** Why the adaptation matters, citing the body or study and its year. */
    whyItMatters: citesYear(80, 1400),
    /** Questions to explore with the person, so the clinician asks rather than assumes. */
    askAbout: z.array(question).min(3).max(8),
    stereotypeCaution: original(40, 600),
    keyConsiderations: z.array(unassuming(10, 500)).min(3).max(10),
    assessmentAdaptations: z.array(unassuming(10, 500)).min(2).max(10),
    sessionAdaptations: z.array(unassuming(10, 500)).min(2).max(10),
    interventionNotes: z.array(PopulationInterventionNoteSchema).min(1).max(12),
    /** Validity cautions for self-report measures, including the built-in PHQ-9 and GAD-7. */
    measureNotes: z.array(unassuming(10, 500)).min(1).max(6),
    measuresPending: z.array(PendingMeasureSchema).max(6),
    /** Safety considerations shown next to the crisis resources; never a risk level (G9). */
    safetyNotes: z.array(unassuming(10, 500)).min(1).max(6),
    /** Contested or harmful practices to avoid or warn about (appear only here, never as a recommendation). */
    cautions: z.array(unassuming(10, 500)).max(6),
    /** Legal and ethics-practice topics (content/legal ids) and professional codes (content/ethics ids). */
    legalIds: z.array(slug).max(6),
    ethicsIds: z.array(slug).max(4),
    /** Curated directory entries (content/referrals ids) and the directory kinds worth browsing. */
    referralIds: z.array(slug).max(8),
    referralKinds: z.array(ReferralKind).max(4),
    /** Client handouts (content/handouts ids) and client topics (content/topics.json ids). */
    handoutIds: z.array(slug).max(8),
    topicIds: z.array(slug).max(4),
    /** Practice guides (content/practice ids) and formulation frameworks (content/formulations ids). */
    practiceIds: z.array(slug).max(8),
    formulationIds: z.array(slug).max(4),
    /** Official bodies and community organizations (link-out only). */
    linkOuts: z.array(PopulationLinkOutSchema).max(6),
    /** True when the wording touches substance use: the page shows the 42 CFR Part 2 notice (G6). */
    sud: z.boolean(),
    ...governance,
    license: z.literal("original"),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    const lists: [string, readonly string[]][] = [
      ["askAbout", p.askAbout],
      ["legalIds", p.legalIds],
      ["ethicsIds", p.ethicsIds],
      ["referralIds", p.referralIds],
      ["referralKinds", p.referralKinds],
      ["handoutIds", p.handoutIds],
      ["topicIds", p.topicIds],
      ["practiceIds", p.practiceIds],
      ["formulationIds", p.formulationIds],
      ["interventionNotes", p.interventionNotes.map((n) => n.interventionId ?? `orientation:${n.orientationId}`)],
      ["linkOuts", p.linkOuts.map((l) => l.url)],
      ["measuresPending", p.measuresPending.map((m) => m.licenseKey)],
    ];
    for (const [field, values] of lists) for (const d of duplicates(values)) issue(`duplicate ${d}`, [field]);
  });
export type Population = z.infer<typeof PopulationSchema>;
