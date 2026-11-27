/**
 * Server-side view model for the handouts library (/handouts) and handout pages (/handouts/[id]).
 * Import from SERVER components only: it reads the full content library. Client components get the small
 * HandoutCardData slices, never whole content files.
 */
import { allHandouts, getAnyHandout, interventions } from "@/lib/library";
import type { Handout } from "@/lib/schemas";
import type { Intervention } from "@/lib/schemas-phase2";
import { orientationLabel, orientationsOf } from "@/components/interventions/orientation";

export interface FilterOption {
  id: string;
  label: string;
  count: number;
}

export interface HandoutCardData {
  id: string;
  title: string;
  /** Intro, clipped for the card. Original, client-facing wording. */
  blurb: string;
  readingLevel: string;
  minutes: number;
  hasLog: boolean;
  sud: boolean;
  reviewPending: boolean;
  /** Approach families of the interventions that use this handout (see interventions/orientation.ts). */
  practiceTypes: string[];
  interventionIds: string[];
  /** Lower-case text the on-device search matches against (title, intro, section headings). */
  searchText: string;
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}…`;
}

/** Interventions whose handoutIds include this handout, by name. */
export function relatedInterventions(handoutId: string): Intervention[] {
  return interventions.filter((i) => i.handoutIds.includes(handoutId));
}

export function handoutCard(h: Handout): HandoutCardData {
  const related = relatedInterventions(h.id);
  return {
    id: h.id,
    title: h.title,
    blurb: clip(h.intro, 170),
    readingLevel: h.readingLevel,
    minutes: h.estimatedMinutes,
    hasLog: Boolean(h.practiceLog),
    sud: h.sud,
    reviewPending: h.reviewedBy === "PENDING",
    practiceTypes: [...new Set(related.flatMap((i) => orientationsOf(i)))],
    interventionIds: related.map((i) => i.id),
    searchText: [h.title, h.intro, ...h.sections.map((s) => s.heading)].join(" ").toLowerCase(),
  };
}

export function handoutCards(): HandoutCardData[] {
  return allHandouts.map(handoutCard);
}

export function practiceTypeOptions(cards: readonly HandoutCardData[]): FilterOption[] {
  const ids = [...new Set(cards.flatMap((c) => c.practiceTypes))];
  return ids
    .map((id) => ({ id, label: orientationLabel(id), count: cards.filter((c) => c.practiceTypes.includes(id)).length }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function interventionOptions(cards: readonly HandoutCardData[]): FilterOption[] {
  const ids = new Set(cards.flatMap((c) => c.interventionIds));
  return interventions
    .filter((i) => ids.has(i.id))
    .map((i) => ({ id: i.id, label: i.name, count: cards.filter((c) => c.interventionIds.includes(i.id)).length }));
}

/** Handouts by id, in the order given, skipping unknown ids. */
export function handoutsById(ids: readonly string[]): Handout[] {
  return ids.map((id) => getAnyHandout(id)).filter((h): h is Handout => h !== undefined);
}
