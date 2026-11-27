/**
 * Resource hints: which built-in measures, interventions, client handouts and referral kinds fit the current
 * picture. Pure and deterministic; the catalog is passed in (build it with catalog.ts on the server, or call
 * catalog.ts resourceHints() directly). Every id returned exists in the catalog; nothing is fetched.
 *
 * Order of contribution (de-duplicated, first reason wins):
 *   1. Safety: documented red flags and the surfaces chosen in answers (crisis, safety plan, lethal means,
 *      urgent medical, psychiatric, medical referral). Static links only; never a risk level.
 *   2. Trigger categories, in order of first mention (content/trigger-objects.json category hints), e.g.
 *      animal -> graded in vivo exposure, exposure ladder handout, psychologist / professional counselor.
 *   3. The top 3 suggestions, in rank order: license-confirmed measures (G7), up to 3 interventions written for
 *      the condition (plan-library order first, then by id; other plan-library items only fill empty slots), and
 *      their handouts.
 * Measures are only ever ids from catalog.measureIds (license confirmed). `part2` is true whenever any
 * substance-use content is involved (G6): show PART2_NOTICE with the hints.
 */
import { PART2_NOTICE } from "@/lib/referral-links";
import {
  TRIGGER_CATEGORIES,
  type FollowUpReferralKind,
  type Surface,
  type TriggerCategory,
  type TriggerObjectsFile,
} from "@/lib/schemas-follow-up";
import type { RedFlagType } from "@/lib/schemas";
import type { ScoringResult } from "@/lib/types";
import { triggerDictionary } from "./dictionary";
import type { TriggerHit } from "./triggers";

/** Serializable slice of the content library (ids and names only), safe to pass to a client component. */
export interface ResourceCatalog {
  conditions: { id: string; name: string; measures: string[]; handouts: string[]; sud: boolean }[];
  /** suggestWith: offered for a condition only when one of these symptoms is documented (content suggestWith). */
  interventions: { id: string; name: string; conditions: string[]; handoutIds: string[]; suggestWith?: string[] }[];
  /** conditionId -> intervention ids in plan-library order. */
  planInterventions: Record<string, string[]>;
  handouts: { id: string; title: string; sud: boolean; suggestWith?: string[] }[];
  /** Built-in measures whose license is confirmed in content/licenses.json (G7). */
  measureIds: string[];
}

export type ResourceHintKind = "measure" | "intervention" | "handout" | "referral";

export interface ResourceHint {
  kind: ResourceHintKind;
  id: string;
  /** Why it is suggested (original wording; names a category or a condition, never typed text). */
  why: string;
}

export interface ResourceHints {
  measureIds: string[];
  interventionIds: string[];
  handoutIds: string[];
  referralKinds: FollowUpReferralKind[];
  reasons: ResourceHint[];
  /** Substance-use content is involved: show the 42 CFR Part 2 notice with these hints (G6). */
  part2: boolean;
  part2Notice?: string;
  label: "For clinician review";
}

export interface ResourceHintOptions {
  /** Surfaces from applyAnswers() (crisis, safety plan, referrals chosen through answers). */
  surfaces?: readonly Surface[];
  /** Extra trigger categories from applyAnswers(). */
  triggerCategories?: readonly TriggerCategory[];
  dictionary?: TriggerObjectsFile;
  limits?: Partial<Record<"measures" | "interventions" | "handouts" | "referrals", number>>;
}

const DEFAULT_LIMITS = { measures: 3, interventions: 6, handouts: 6, referrals: 5 } as const;

interface Contribution {
  interventions?: string[];
  handouts?: string[];
  measures?: string[];
  referrals?: FollowUpReferralKind[];
  why: string;
  part2?: boolean;
}

const SURFACE_CONTRIBUTIONS: Record<Surface, Contribution> = {
  "crisis-resources": { referrals: ["crisis"], why: "A safety answer was recorded: keep crisis resources (988, local emergency, findahelpline.com) in view." },
  "safety-plan": {
    interventions: ["collaborative-safety-planning"],
    handouts: ["safety-plan", "hard-moment-plan"],
    why: "A safety answer was recorded: offer to build or review a safety plan together.",
  },
  "lethal-means": { interventions: ["lethal-means-counseling"], why: "A safety answer was recorded: talk about limiting access to lethal means." },
  "psychiatric-referral": {
    interventions: ["medication-referral"],
    referrals: ["psychiatrist", "psychiatric-np"],
    why: "An answer suggests a psychiatric evaluation.",
  },
  "urgent-medical": { referrals: ["urgent-medical", "primary-care"], why: "An answer suggests an urgent medical assessment." },
  "medical-referral": { referrals: ["primary-care"], why: "An answer suggests a medical review." },
  "part2-notice": { why: "Substance-use information was discussed (42 CFR Part 2).", part2: true },
};

const RED_FLAG_CONTRIBUTIONS: Record<RedFlagType, Contribution> = {
  suicidality: {
    interventions: ["collaborative-safety-planning", "lethal-means-counseling"],
    handouts: ["safety-plan", "hard-moment-plan"],
    referrals: ["crisis"],
    why: "A suicide-related statement is documented.",
  },
  homicidality: { referrals: ["crisis"], why: "A statement about harming others is documented." },
  psychosis: { referrals: ["psychiatrist", "crisis"], why: "Possible psychotic symptoms are documented: consider an urgent psychiatric evaluation." },
  mania: {
    interventions: ["medication-referral"],
    referrals: ["psychiatrist", "psychiatric-np"],
    why: "Possible mood elevation is documented: consider a psychiatric evaluation.",
  },
  "eating-disorder-medical": { referrals: ["urgent-medical", "primary-care"], why: "Possible medical instability from eating problems is documented." },
  withdrawal: {
    referrals: ["urgent-medical", "addiction-counselor", "substance-use"],
    why: "Possible alcohol or sedative withdrawal is documented: arrange an urgent medical assessment.",
    part2: true,
  },
};

const RED_FLAG_ORDER: readonly RedFlagType[] = ["suicidality", "homicidality", "psychosis", "mania", "eating-disorder-medical", "withdrawal"];
const SUD_REFERRALS: ReadonlySet<FollowUpReferralKind> = new Set(["addiction-counselor", "substance-use"]);

/** Pure: compute hints from a scoring result, triggers and a catalog. */
export function computeResourceHints(
  result: ScoringResult,
  triggers: readonly TriggerHit[],
  catalog: ResourceCatalog,
  opts: ResourceHintOptions = {},
): ResourceHints {
  const dict = opts.dictionary ?? triggerDictionary;
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const interventionIds = new Set(catalog.interventions.map((i) => i.id));
  const handoutById = new Map(catalog.handouts.map((h) => [h.id, h] as const));
  const measureIds = new Set(catalog.measureIds);
  const conditionById = new Map(catalog.conditions.map((c) => [c.id, c] as const));
  const interventionById = new Map(catalog.interventions.map((i) => [i.id, i] as const));

  const out = {
    measure: [] as string[],
    intervention: [] as string[],
    handout: [] as string[],
    referral: [] as FollowUpReferralKind[],
  };
  const reasons: ResourceHint[] = [];
  let part2 = false;
  const cap: Record<ResourceHintKind, number> = {
    measure: limits.measures,
    intervention: limits.interventions,
    handout: limits.handouts,
    referral: limits.referrals,
  };
  const push = (kind: ResourceHintKind, id: string, why: string) => {
    const list = out[kind] as string[];
    if (list.includes(id) || list.length >= cap[kind]) return;
    if (kind === "intervention" && !interventionIds.has(id)) return;
    if (kind === "handout" && !handoutById.has(id)) return;
    if (kind === "measure" && !measureIds.has(id)) return; // G7: license-confirmed measures only
    list.push(id);
    reasons.push({ kind, id, why });
    if (kind === "handout" && handoutById.get(id)?.sud) part2 = true;
    if (kind === "referral" && SUD_REFERRALS.has(id as FollowUpReferralKind)) part2 = true;
  };
  const contribute = (c: Contribution) => {
    for (const id of c.interventions ?? []) push("intervention", id, c.why);
    for (const id of c.handouts ?? []) push("handout", id, c.why);
    for (const id of c.measures ?? []) push("measure", id, c.why);
    for (const id of c.referrals ?? []) push("referral", id, c.why);
    if (c.part2) part2 = true;
  };

  // 1. Safety first.
  const flags = new Set(result.redFlags.map((f) => f.type));
  for (const t of RED_FLAG_ORDER) if (flags.has(t)) contribute(RED_FLAG_CONTRIBUTIONS[t]);
  const surfaces = new Set(opts.surfaces ?? []);
  for (const s of Object.keys(SURFACE_CONTRIBUTIONS) as Surface[]) if (surfaces.has(s)) contribute(SURFACE_CONTRIBUTIONS[s]);

  // 2. Trigger categories, first mention first (base categories right after their trauma-reminder hit).
  const cats: TriggerCategory[] = [];
  for (const h of triggers) {
    if (h.negated) continue;
    for (const c of [h.category, h.baseCategory]) if (c && !cats.includes(c)) cats.push(c);
  }
  for (const c of TRIGGER_CATEGORIES) if (opts.triggerCategories?.includes(c) && !cats.includes(c)) cats.push(c);
  for (const c of cats) {
    const info = dict.categories[c];
    contribute({
      interventions: info.interventionIds,
      handouts: info.handoutIds,
      measures: info.measureIds,
      referrals: info.referralKinds,
      why: `Fits a fear of ${info.label.toLowerCase()}.`,
    });
  }

  // 3. The top suggestions, in rank order.
  for (const s of result.suggestions.slice(0, 3)) {
    const cond = conditionById.get(s.conditionId);
    const why = `Commonly used for ${s.name}, one of the possible considerations.`;
    if (cond?.sud) part2 = true;
    for (const m of cond?.measures ?? []) push("measure", m, why);
    // Interventions written for this condition come first (in plan-library order, then by id); plan items written
    // for other problems (for example, drinking to cope in a social-anxiety plan) only fill remaining slots.
    const planned = catalog.planInterventions[s.conditionId] ?? [];
    const listed = new Set(catalog.interventions.filter((i) => i.conditions.includes(s.conditionId)).map((i) => i.id));
    // Items written for one kind of presentation (applied tension: blood-injection-injury fears) wait until one of
    // their symptoms is documented for this suggestion, so a fear of dogs is never offered applied tension.
    const documented = new Set(s.matched.map((f) => f.symptomId));
    const suits = (suggestWith?: readonly string[]) => !suggestWith || suggestWith.some((id) => documented.has(id));
    const chosen = [...new Set([...planned.filter((id) => listed.has(id)), ...[...listed].sort(), ...planned])]
      .filter((id) => interventionIds.has(id) && suits(interventionById.get(id)?.suggestWith))
      .slice(0, 3);
    for (const id of chosen) push("intervention", id, why);
    // Substance-use handouts only for a substance-use consideration (they would otherwise raise Part 2 for, say, a
    // needle fear whose relapse-prevention intervention also serves substance use).
    const fits = (h: string) => (cond?.sud === true || handoutById.get(h)?.sud !== true) && suits(handoutById.get(h)?.suggestWith);
    for (const h of cond?.handouts ?? []) if (fits(h)) push("handout", h, why);
    for (const id of chosen) for (const h of interventionById.get(id)?.handoutIds ?? []) if (fits(h)) push("handout", h, why);
    for (const r of (cond?.sud ? ["addiction-counselor", "substance-use"] : ["psychologist", "professional-counselor"]) as FollowUpReferralKind[])
      push("referral", r, why);
  }

  const hints: ResourceHints = {
    measureIds: out.measure,
    interventionIds: out.intervention,
    handoutIds: out.handout,
    referralKinds: out.referral,
    reasons,
    part2,
    label: "For clinician review",
  };
  if (part2) hints.part2Notice = PART2_NOTICE;
  return hints;
}
