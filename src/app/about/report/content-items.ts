/**
 * Curated list of every content item a clinician can point at: its type, id, display title and page. Used by the
 * "Report a content problem" page (the only things a report can name) and by the content changelog. Server only:
 * it reads the whole library.
 */
import { conditions, measures, stats } from "@/lib/content";
import { ethicsCodes, getAnyCondition, handouts, interventions, legalTopics, planLibraries } from "@/lib/library";
import { formulations } from "@/lib/formulations";
import { orientations } from "@/lib/orientations";
import { planModules } from "@/lib/plan-modules";
import { practiceGuides } from "@/lib/practice";
import { populations } from "@/lib/populations";
import { MEDICATIONS } from "@/lib/schemas-medications";
import { HealthTopicsFileSchema } from "@/lib/schemas-topics";
import topicsJson from "@content/topics.json";

export const CONTENT_TYPES = [
  { type: "condition", label: "Condition card" },
  { type: "intervention", label: "Intervention" },
  { type: "handout", label: "Client handout" },
  { type: "measure", label: "Built-in measure" },
  { type: "plan", label: "Plan library" },
  { type: "plan-module", label: "Plan module" },
  { type: "orientation", label: "Orientation profile" },
  { type: "formulation", label: "Formulation framework" },
  { type: "practice", label: "Practice guide" },
  { type: "population", label: "Population profile" },
  { type: "legal", label: "Legal or practice topic" },
  { type: "ethics", label: "Ethics code" },
  { type: "medication", label: "Medication page" },
  { type: "topic", label: "Client topic" },
  { type: "stat", label: "Statistic" },
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number]["type"];

export interface ContentItem {
  type: ContentType;
  id: string;
  title: string;
  /** In-app page for the item; conditions and statistics have no page of their own, plans open in the builder. */
  href?: string;
}

/** "handout/worry-log": how a report and a changelog entry name an item. */
export const itemRef = (i: Pick<ContentItem, "type" | "id">): string => `${i.type}/${i.id}`;

const byTitle = (a: ContentItem, b: ContentItem) => a.title.localeCompare(b.title);

function buildItems(): ContentItem[] {
  const topics = HealthTopicsFileSchema.parse(topicsJson).topics;
  const list: ContentItem[][] = [
    conditions.map((c) => ({ type: "condition", id: c.id, title: c.name })),
    interventions.map((i) => ({ type: "intervention", id: i.id, title: i.name, href: `/interventions/${i.id}` })),
    handouts.map((h) => ({ type: "handout", id: h.id, title: h.title, href: `/handouts/${h.id}` })),
    measures.map((m) => ({ type: "measure", id: m.id, title: m.name, href: `/measures/${m.id}` })),
    planLibraries.map((pl) => ({ type: "plan", id: pl.conditionId, title: `${getAnyCondition(pl.conditionId)?.name ?? pl.conditionId} plan library`, href: "/plan" })),
    planModules.map((m) => ({ type: "plan-module", id: m.id, title: m.title, href: "/plan" })),
    orientations.map((o) => ({ type: "orientation", id: o.id, title: o.name, href: `/orientations/${o.id}` })),
    formulations.map((f) => ({ type: "formulation", id: f.id, title: f.name, href: `/formulations/${f.id}` })),
    practiceGuides.map((g) => ({ type: "practice", id: g.id, title: g.title, href: `/practice/${g.id}` })),
    populations.map((p) => ({ type: "population", id: p.id, title: p.name, href: `/populations/${p.id}` })),
    legalTopics.map((t) => ({ type: "legal", id: t.id, title: t.title, href: `/ethics#${t.id}` })),
    ethicsCodes.map((e) => ({ type: "ethics", id: e.id, title: e.name, href: `/ethics#${e.id}` })),
    MEDICATIONS.map((m) => ({ type: "medication", id: m.id, title: m.generic, href: `/medications/${m.id}` })),
    topics.map((t) => ({ type: "topic", id: t.id, title: t.clientLabel, href: `/client/topics/${t.id}` })),
    stats.map((s) => ({ type: "stat", id: s.id, title: `${s.value}: ${s.text.length > 80 ? `${s.text.slice(0, 79)}…` : s.text}` })),
  ];
  return list.flatMap((group) => [...group].sort(byTitle));
}

let cache: { items: ContentItem[]; byRef: Map<string, ContentItem> } | undefined;

function catalog() {
  if (!cache) {
    const items = buildItems();
    cache = { items, byRef: new Map(items.map((i) => [itemRef(i), i] as const)) };
  }
  return cache;
}

/** Every item, grouped in CONTENT_TYPES order and sorted by title within a type. */
export const contentItems = (): readonly ContentItem[] => catalog().items;

/** The item a "type/id" reference names, or undefined for anything not in the curated list. */
export const findContentItem = (ref: string): ContentItem | undefined => catalog().byRef.get(ref);
