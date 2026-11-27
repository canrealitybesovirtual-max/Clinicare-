/**
 * Client-mode topics (G3) from content/topics.json. Only the plain clientLabel / clientLabelEs, the flags and the
 * canonical MedlinePlus page links reach client components; the clinician-facing search keywords (en / es, which can
 * name a diagnosis) never do. The topic id is the only value sent to /api/health-topics (G5, G17).
 *
 * TOPIC_SKILLS maps each topic to related app-authored handouts (curated ids; original handouts written for clients).
 */
import topicsJson from "@content/topics.json";
import { HealthTopicsFileSchema } from "@/lib/schemas-topics";

export interface ClientTopic {
  id: string;
  label: string;
  labelEs: string;
  sud: boolean;
  crisis: boolean;
  pages: { en: string; es: string };
}

const file = HealthTopicsFileSchema.parse(topicsJson);

export const CLIENT_TOPICS: readonly ClientTopic[] = file.topics.map((t) => ({
  id: t.id,
  label: t.clientLabel,
  labelEs: t.clientLabelEs,
  sud: t.sud,
  crisis: t.crisis,
  pages: t.pages,
}));

export const getClientTopic = (id: string): ClientTopic | undefined => CLIENT_TOPICS.find((t) => t.id === id);

/**
 * Plain-language groups for the client topic list (curated ids). Crisis topics are pulled out and shown first;
 * any topic not listed here falls into "More topics", so a new topic is never hidden.
 */
const GROUPS: readonly { id: string; label: string; ids: readonly string[] }[] = [
  {
    id: "feelings",
    label: "Feelings",
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
      "focus-and-attention",
    ],
  },
  {
    id: "sleep-body",
    label: "Sleep and body",
    ids: ["trouble-sleeping", "healthy-sleep", "relaxation", "exercise", "eating-concerns", "feeling-better"],
  },
  {
    id: "life",
    label: "Life changes and relationships",
    ids: ["mood-after-baby", "seasonal-mood", "caregiving", "disasters", "later-life", "military-life"],
  },
  { id: "habits", label: "Alcohol, drugs and habits", ids: ["alcohol", "quitting-smoking"] },
  { id: "health", label: "Health conditions", ids: ["chronic-illness", "mental-health", "mental-health-conditions"] },
];

export interface ClientTopicGroup {
  id: string;
  label: string;
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
  if (other.length) groups.push({ id: "more", label: "More topics", topics: other });
  return { crisis, groups };
}

/** Related self-help skills (handout ids) per topic. Curated; every id must exist in content/handouts. */
export const TOPIC_SKILLS: Readonly<Record<string, readonly string[]>> = {
  anxiety: ["worry-log", "breathing-practice", "pmr-homework", "grounding-5-4-3-2-1"],
  "panic-attacks": ["panic-cycle", "breathing-practice", "behavioral-experiment-record", "exposure-ladder"],
  "low-mood": ["activity-schedule", "kind-self-talk", "thought-record", "values-compass"],
  "after-trauma": ["grounding-5-4-3-2-1", "breathing-practice", "hard-moment-plan"],
  "healthy-sleep": ["sleep-habits", "sleep-diary"],
  "trouble-sleeping": ["sleep-diary", "sleep-habits", "pmr-homework"],
  stress: ["breathing-practice", "pmr-homework", "problem-solving-steps", "mindful-check-in"],
  grief: ["grief-and-loss", "kind-self-talk"],
  alcohol: ["drinking-diary", "urge-surfing-log", "relapse-prevention-plan"],
  "strong-fears": ["exposure-ladder", "behavioral-experiment-record", "breathing-practice"],
  "unwanted-thoughts": ["unhooking-from-thoughts", "erp-practice-log"],
  "social-nervousness": ["social-situations-practice", "assertive-communication", "behavioral-experiment-record"],
  "self-harm-prevention": ["safety-plan", "hard-moment-plan", "coping-cards"],
  "suicide-prevention": ["safety-plan", "hard-moment-plan", "coping-cards"],
  "mental-health": ["mindful-check-in", "values-compass", "activity-schedule"],
  "feeling-better": ["activity-schedule", "movement-plan", "kind-self-talk"],
  relaxation: ["pmr-homework", "breathing-practice", "grounding-5-4-3-2-1"],
  exercise: ["movement-plan", "activity-schedule"],
  "mood-and-energy-shifts": ["sleep-diary", "mindful-check-in"],
  "eating-concerns": ["kind-self-talk", "mindful-check-in"],
  "mood-after-baby": ["activity-schedule", "kind-self-talk", "sleep-habits"],
  "seasonal-mood": ["activity-schedule", "movement-plan"],
  caregiving: ["problem-solving-steps", "kind-self-talk", "breathing-practice"],
  "relationship-safety": ["grounding-5-4-3-2-1", "breathing-practice"],
  "chronic-illness": ["problem-solving-steps", "pmr-homework", "values-compass"],
  disasters: ["grounding-5-4-3-2-1", "breathing-practice", "problem-solving-steps"],
  "later-life": ["activity-schedule", "movement-plan"],
  "military-life": ["grounding-5-4-3-2-1", "hard-moment-plan", "sleep-diary"],
  "focus-and-attention": ["problem-solving-steps", "activity-schedule"],
  "mental-health-conditions": ["mindful-check-in", "coping-cards"],
  "quitting-smoking": ["urge-surfing-log"],
};
