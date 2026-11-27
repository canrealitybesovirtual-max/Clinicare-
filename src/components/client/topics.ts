/**
 * Client-mode topics (G3) from content/topics.json. Only the plain clientLabel / clientLabelEs, the flags, the related
 * handout ids and the canonical MedlinePlus page links reach client components; the clinician-facing search keywords
 * (en / es, which can name a diagnosis) never do. Import this module from SERVER components only and pass ClientTopic
 * objects down, so topics.json itself stays out of client bundles. The topic id is the only value sent to
 * /api/health-topics (G5, G17).
 */
import topicsJson from "@content/topics.json";
import type { Text } from "@/lib/i18n/core";
import { HealthTopicsFileSchema } from "@/lib/schemas-topics";

export interface ClientTopic {
  id: string;
  label: Text;
  sud: boolean;
  crisis: boolean;
  /** App-authored client handouts to offer as skills (content/topics.json handoutIds). */
  handoutIds: readonly string[];
  pages: { en: string; es: string };
  /** Substance-use topics: the topic's own safety line (content/topics.json safetyNote). */
  safetyNote?: Text;
}

const file = HealthTopicsFileSchema.parse(topicsJson);

export const CLIENT_TOPICS: readonly ClientTopic[] = file.topics.map((t) => ({
  id: t.id,
  label: { en: t.clientLabel, es: t.clientLabelEs },
  sud: t.sud,
  crisis: t.crisis,
  handoutIds: t.handoutIds,
  pages: t.pages,
  ...(t.safetyNote ? { safetyNote: t.safetyNote } : {}),
}));

export const getClientTopic = (id: string): ClientTopic | undefined => CLIENT_TOPICS.find((t) => t.id === id);

/**
 * Plain-language groups for the client topic list (curated ids). Crisis topics are pulled out and shown first;
 * any topic not listed here falls into "More topics", so a new topic is never hidden.
 */
const GROUPS: readonly { id: string; label: Text; ids: readonly string[] }[] = [
  {
    id: "feelings",
    label: { en: "Feelings", es: "Sentimientos" },
    ids: [
      "anxiety",
      "panic-attacks",
      "low-mood",
      "stress",
      "grief",
      "strong-fears",
      "social-nervousness",
      "unwanted-thoughts",
      "after-trauma",
      "mood-and-energy-shifts",
      "intense-emotions",
      "unusual-experiences",
      "focus-and-attention",
    ],
  },
  {
    id: "sleep-body",
    label: { en: "Sleep and body", es: "El sueño y el cuerpo" },
    ids: ["trouble-sleeping", "healthy-sleep", "relaxation", "exercise", "eating-concerns", "feeling-better"],
  },
  {
    id: "life",
    label: { en: "Life changes and relationships", es: "Cambios en la vida y relaciones" },
    ids: ["mood-after-baby", "seasonal-mood", "caregiving", "disasters", "later-life", "military-life"],
  },
  { id: "habits", label: { en: "Alcohol, drugs and habits", es: "Alcohol, drogas y hábitos" }, ids: ["alcohol", "cannabis", "opioids", "stimulants", "quitting-smoking"] },
  {
    id: "health",
    label: { en: "Health conditions", es: "Problemas de salud" },
    ids: ["chronic-illness", "mental-health", "mental-health-conditions"],
  },
];

export interface ClientTopicGroup {
  id: string;
  label: Text;
  topics: ClientTopic[];
}

export function groupClientTopics(topics: readonly ClientTopic[] = CLIENT_TOPICS): {
  crisis: ClientTopic[];
  groups: ClientTopicGroup[];
} {
  const crisis = topics.filter((t) => t.crisis);
  const rest = topics.filter((t) => !t.crisis);
  const placed = new Set<string>();
  const groups: ClientTopicGroup[] = [];
  for (const g of GROUPS) {
    const list = g.ids.flatMap((id) => rest.filter((t) => t.id === id));
    list.forEach((t) => placed.add(t.id));
    if (list.length) groups.push({ id: g.id, label: g.label, topics: list });
  }
  const other = rest.filter((t) => !placed.has(t.id));
  if (other.length) groups.push({ id: "more", label: { en: "More topics", es: "Más temas" }, topics: other });
  return { crisis, groups };
}
