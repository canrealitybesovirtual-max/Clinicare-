/**
 * Population adaptation profiles (content/populations), validated with zod at load time (G10), and their links into
 * the library: interventions and orientations (with the profile's adaptation note), handouts, client topics,
 * practice guides, formulation frameworks, legal and ethics topics, and curated referral directory entries.
 * Links are two-way: a profile also shows the orientations, practice guides and formulations that point at it.
 * Like library.ts, import this from SERVER components only and pass client components the slices they need.
 * Profiles are reference content for clinicians. Nothing here asks for, stores, scores or decides anything about a
 * person, and nothing matches a client to a group.
 */
import usReferrals from "@content/referrals/us.json";
import intlReferrals from "@content/referrals/international.json";
import topicsJson from "@content/topics.json";
import { licenses, parseAll } from "./content";
import { formulations, getFormulation } from "./formulations";
import { populationsRaw } from "./generated/populations";
import { ethicsCodes, getAnyHandout, getIntervention, handouts, interventions, legalTopics } from "./library";
import { getOrientation, orientations } from "./orientations";
import { getPracticeGuide, practiceGuides } from "./practice";
import { PART2_NOTICE } from "./referral-links";
import type { Handout } from "./schemas";
import type { Formulation } from "./schemas-formulations";
import type { EthicsCode, LegalTopic } from "./schemas-hub";
import type { Orientation } from "./schemas-orientations";
import type { Intervention } from "./schemas-phase2";
import {
  POPULATION_GROUPS,
  POPULATION_GROUP_LABELS,
  PopulationSchema,
  type Population,
  type PopulationGroup,
} from "./schemas-populations";
import type { PracticeGuide } from "./schemas-practice";
import { ReferralDirectorySchema, type ReferralEntry, type ReferralKind } from "./schemas-referrals";
import { HealthTopicsFileSchema, type HealthTopic } from "./schemas-topics";

export { PART2_NOTICE };

/** Every profile, A to Z by name. */
export const populations: Population[] = parseAll(populationsRaw, PopulationSchema, "population").sort((a, b) =>
  a.name.localeCompare(b.name),
);

const populationMap = new Map(populations.map((p) => [p.id, p] as const));
export const getPopulation = (id: string): Population | undefined => populationMap.get(id);

const referralEntries: ReferralEntry[] = [ReferralDirectorySchema.parse(usReferrals), ReferralDirectorySchema.parse(intlReferrals)].flatMap(
  (d) => d.entries,
);
const referralMap = new Map(referralEntries.map((e) => [e.id, e] as const));
const topicMap = new Map(HealthTopicsFileSchema.parse(topicsJson).topics.map((t) => [t.id, t] as const));
const legalMap = new Map(legalTopics.map((t) => [t.id, t] as const));
const ethicsMap = new Map(ethicsCodes.map((c) => [c.id, c] as const));

export interface PopulationGroupList {
  group: PopulationGroup;
  label: string;
  line: string;
  items: Population[];
}

/** Profiles grouped in the fixed group order (never a ranking), A to Z within a group; empty groups are left out. */
export function populationsByGroup(list: readonly Population[] = populations): PopulationGroupList[] {
  return POPULATION_GROUPS.map((group) => ({
    group,
    ...POPULATION_GROUP_LABELS[group],
    items: list.filter((p) => p.group === group),
  })).filter((g) => g.items.length > 0);
}

const resolved = <T,>(ids: readonly string[], get: (id: string) => T | undefined): T[] =>
  ids.map(get).filter((x): x is T => x !== undefined);

/** One adaptation note with the library entry it belongs to. */
export type AdaptationTarget =
  | { kind: "intervention"; intervention: Intervention; note: string }
  | { kind: "orientation"; orientation: Orientation; note: string };

export interface PopulationLinks {
  adaptations: AdaptationTarget[];
  handouts: Handout[];
  topics: HealthTopic[];
  practice: PracticeGuide[];
  formulations: Formulation[];
  /** Orientation profiles that list this population among their related populations (and are not adapted above). */
  orientations: Orientation[];
  legal: LegalTopic[];
  ethics: EthicsCode[];
  referrals: ReferralEntry[];
}

/** Union of two id lists in order, without repeats. */
const merge = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

/**
 * The library entries a profile links to, in the profile's order, plus reverse links from practice guides,
 * formulation frameworks and orientation profiles that point at it. Unknown ids are skipped
 * (populationProblems reports them).
 */
export function populationLinks(p: Population): PopulationLinks {
  const adaptations = p.interventionNotes.flatMap((n): AdaptationTarget[] => {
    if (n.interventionId) {
      const intervention = getIntervention(n.interventionId);
      return intervention ? [{ kind: "intervention", intervention, note: n.note }] : [];
    }
    const orientation = n.orientationId ? getOrientation(n.orientationId) : undefined;
    return orientation ? [{ kind: "orientation", orientation, note: n.note }] : [];
  });
  const adaptedOrientations = new Set(p.interventionNotes.flatMap((n) => (n.orientationId ? [n.orientationId] : [])));
  return {
    adaptations,
    handouts: resolved(p.handoutIds, getAnyHandout),
    topics: resolved(p.topicIds, (id) => topicMap.get(id)),
    practice: resolved(
      merge(p.practiceIds, practiceGuides.filter((g) => g.relatedPopulationIds.includes(p.id)).map((g) => g.id)),
      getPracticeGuide,
    ),
    formulations: resolved(
      merge(p.formulationIds, formulations.filter((f) => f.populationIds.includes(p.id)).map((f) => f.id)),
      getFormulation,
    ),
    orientations: orientations.filter((o) => o.relatedPopulationIds.includes(p.id) && !adaptedOrientations.has(o.id)),
    legal: resolved(p.legalIds, (id) => legalMap.get(id)),
    ethics: resolved(p.ethicsIds, (id) => ethicsMap.get(id)),
    referrals: resolved(p.referralIds, (id) => referralMap.get(id)),
  };
}

/** What a population note can be attached to: one library intervention or one orientation profile. */
export type AdaptationTargetRef = { interventionId: string } | { orientationId: string };

/**
 * Population notes for one intervention or orientation, A to Z by population: the adaptations panel on
 * /interventions/[id] and /orientations/[id] (src/components/populations/population-notes-panel.tsx).
 */
export function populationNotesFor(target: AdaptationTargetRef): { population: Population; note: string }[] {
  const matches =
    "interventionId" in target
      ? (n: Population["interventionNotes"][number]) => n.interventionId === target.interventionId
      : (n: Population["interventionNotes"][number]) => n.orientationId === target.orientationId;
  return populations.flatMap((population) => population.interventionNotes.filter(matches).map((n) => ({ population, note: n.note })));
}

/** Ids the profiles may point at. A folder that does not exist yet is passed as undefined and not checked. */
export interface PopulationRefs {
  interventions: ReadonlySet<string>;
  orientations: ReadonlySet<string>;
  handouts: ReadonlySet<string>;
  /** Substance-use handouts (G6): linking one makes the profile a Part 2 profile. */
  sudHandouts: ReadonlySet<string>;
  topics: ReadonlySet<string>;
  /** Substance-use client topics (G6), likewise. */
  sudTopics: ReadonlySet<string>;
  practice: ReadonlySet<string>;
  formulations: ReadonlySet<string>;
  legal: ReadonlySet<string>;
  ethics: ReadonlySet<string>;
  referrals: ReadonlySet<string>;
  /** Referral kinds that have at least one directory entry. */
  referralKinds: ReadonlySet<ReferralKind>;
  licenses: Readonly<Record<string, { status: string }>>;
}

/** The ids of the loaded library, for scripts/validate-content.ts and the tests. */
export function loadedPopulationRefs(): PopulationRefs {
  return {
    interventions: new Set(interventions.map((i) => i.id)),
    orientations: new Set(orientations.map((o) => o.id)),
    handouts: new Set(handouts.map((h) => h.id)),
    sudHandouts: new Set(handouts.filter((h) => h.sud).map((h) => h.id)),
    topics: new Set(topicMap.keys()),
    sudTopics: new Set([...topicMap.values()].filter((t) => t.sud).map((t) => t.id)),
    practice: new Set(practiceGuides.map((g) => g.id)),
    formulations: new Set(formulations.map((f) => f.id)),
    legal: new Set(legalMap.keys()),
    ethics: new Set(ethicsMap.keys()),
    referrals: new Set(referralMap.keys()),
    referralKinds: new Set(referralEntries.map((e) => e.kind)),
    licenses: licenses.items,
  };
}

/** Cross-file checks used by scripts/validate-content.ts and the unit tests. Returns error strings. */
export function populationProblems(
  list: readonly Population[] = populations,
  refs: PopulationRefs = loadedPopulationRefs(),
  today = new Date().toISOString().slice(0, 10),
): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  for (const pop of list) {
    if (ids.has(pop.id)) p.push(`populations: duplicate id ${pop.id}`);
    ids.add(pop.id);
  }
  for (const pop of list) {
    const where = `populations/${pop.id}`;
    if (pop.lastVerified > today) p.push(`${where}: lastVerified in the future: ${pop.lastVerified}`);
    for (const l of pop.linkOuts) if (l.lastVerified > today) p.push(`${where}: link-out ${l.url} lastVerified in the future`);
    const unknown = (kind: string, values: readonly string[], known: ReadonlySet<string>) => {
      for (const id of values) if (!known.has(id)) p.push(`${where}: unknown ${kind} ${id}`);
    };
    unknown("intervention", pop.interventionNotes.flatMap((n) => (n.interventionId ? [n.interventionId] : [])), refs.interventions);
    unknown("orientation", pop.interventionNotes.flatMap((n) => (n.orientationId ? [n.orientationId] : [])), refs.orientations);
    unknown("handout", pop.handoutIds, refs.handouts);
    unknown("client topic", pop.topicIds, refs.topics);
    unknown("practice guide", pop.practiceIds, refs.practice);
    unknown("formulation", pop.formulationIds, refs.formulations);
    unknown("legal topic", pop.legalIds, refs.legal);
    unknown("ethics code", pop.ethicsIds, refs.ethics);
    unknown("referral entry", pop.referralIds, refs.referrals);
    for (const k of pop.referralKinds) if (!refs.referralKinds.has(k)) p.push(`${where}: referral kind ${k} has no directory entry`);

    // G7: other measures are link-outs only, with a licenses.json entry that is not confirmed.
    for (const m of pop.measuresPending) {
      const lic = refs.licenses[m.licenseKey];
      if (!lic) p.push(`${where}: pending measure ${m.name} has no licenses.json entry ${m.licenseKey} (G7)`);
      else if (lic.status === "confirmed") p.push(`${where}: ${m.name} is confirmed in licenses.json; build it in or drop it from measuresPending`);
    }

    // G6: a profile that links a substance-use handout or client topic shows the Part 2 notice.
    if (pop.handoutIds.some((h) => refs.sudHandouts.has(h)) && !pop.sud) p.push(`${where}: links a substance-use handout but sud is false (G6)`);
    if (pop.topicIds.some((t) => refs.sudTopics.has(t)) && !pop.sud) p.push(`${where}: links a substance-use client topic but sud is false (G6)`);
  }
  return p;
}
