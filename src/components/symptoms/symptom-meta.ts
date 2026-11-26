import type { Symptom } from "@/lib/schemas";
import { DURATION_BANDS, type DurationBand, type Onset, type TriState } from "@/lib/types";
import type { Choice } from "@/components/ui/choice-group";

type Category = Symptom["category"];

/** Display order and names for symptom categories in the chip picker. */
export const CATEGORY_ORDER: { id: Category; label: string }[] = [
  { id: "panic", label: "Panic" },
  { id: "anxiety", label: "Worry and anxiety" },
  { id: "avoidance", label: "Avoidance" },
  { id: "mood", label: "Mood" },
  { id: "cognitive", label: "Thinking and perception" },
  { id: "somatic", label: "Body sensations" },
  { id: "sleep", label: "Sleep" },
  { id: "trauma", label: "Trauma responses" },
  { id: "behavioral", label: "Behavior" },
  { id: "context", label: "Context and history" },
  { id: "safety", label: "Safety (red flags)" },
];

export const DURATION_CHOICES: Choice<DurationBand>[] = [
  { value: "unknown", label: "Not recorded" },
  ...(Object.entries(DURATION_BANDS) as [Exclude<DurationBand, "unknown">, { label: string }][]).map(([value, b]) => ({
    value,
    label: b.label,
  })),
];

export const ONSET_CHOICES: Choice<Onset>[] = [
  { value: "unknown", label: "Not recorded" },
  { value: "sudden", label: "Sudden" },
  { value: "gradual", label: "Gradual" },
  { value: "after-event", label: "After a specific event" },
];

export const TRI_CHOICES: Choice<TriState>[] = [
  { value: "unknown", label: "Not assessed" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const AGE_CHOICES: Choice<"adult" | "minor">[] = [
  { value: "adult", label: "No (adult)" },
  { value: "minor", label: "Yes, under 18" },
];

export function durationLabel(d: DurationBand): string {
  return d === "unknown" ? "not recorded" : DURATION_BANDS[d].label.toLowerCase();
}

export function triLabel(t: TriState): string {
  return t === "unknown" ? "not assessed" : t;
}

/**
 * De-identified practice vignettes (original wording, no identifiers). They exercise the matcher:
 * panic with agoraphobic avoidance, worry with low mood, trauma with nightmares.
 */
export const EXAMPLES = [
  {
    id: "panic-agoraphobia",
    label: "Panic with avoidance",
    text: "Adult client describes random panic attacks for several months, with heart racing, short of breath, dizzy, and felt like I was dying. Always worried I will panic and dreads having another attack. Avoids crowds, cant ride the bus, cant go in stores and is afraid to leave home alone. Says what if I cant escape. Needs someone with them to go anywhere.",
  },
  {
    id: "worry-low-mood",
    label: "Worry and low mood",
    text: "Adult client says they worry about everything: work, money, family health. Cant stop worrying and cant turn my brain off at night. Feels keyed up, tired all the time, cant concentrate, tight shoulders and trouble sleeping. Over the past few weeks also feeling down and has lost interest in hobbies. Denies suicidal thoughts.",
  },
  {
    id: "trauma-nightmares",
    label: "Trauma with nightmares",
    text: "Adult client was in a car accident and has had nightmares since. Memories keep popping up and they replay the event, with flashbacks when driving. Wont drive since the accident and avoids anything that reminds me. Always on guard, jumps at loud noises, and feels emotionally numb and detached from people.",
  },
] as const;
