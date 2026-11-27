/**
 * Training vignettes (tools/practice). FICTIONAL adult cases written for this app: no real people, no identifiers,
 * original wording. Each case unfolds in steps; every step adds documented features or context, and the practice
 * screen re-runs the app's own scorer in a sandbox so a clinician can see how the possible considerations change.
 * Nothing here touches the live session. Symptom ids are lexicon ids (tests check every one exists).
 */
import type { ScoringInput, Suggestion } from "@/lib/types";

export type VignetteContext = Omit<ScoringInput, "symptomIds">;

export interface VignetteStep {
  label: string;
  /** What the clinician learns at this step (fictional). */
  story: string;
  /** Lexicon ids documented at this step (added to the earlier steps' ids). */
  add: string[];
  /** Context set at this step (kept for later steps unless changed again). */
  context?: Partial<VignetteContext>;
  /** What to look for in the results. */
  teach: string;
}

export interface Vignette {
  id: string;
  title: string;
  summary: string;
  steps: VignetteStep[];
}

const VIGNETTE_START: VignetteContext = {
  duration: "unknown",
  impairment: "unknown",
  substancePossible: "unknown",
  medicalPossible: "unknown",
};

export const VIGNETTES: readonly Vignette[] = [
  {
    id: "worry-and-sleep",
    title: "Fictional case A: worry that will not switch off",
    summary: "An adult describes constant worry, then body tension and poor sleep. Timing changes the picture.",
    steps: [
      {
        label: "First minutes",
        story: "The client says they worry about everything: work, family, money. Once a worry starts they cannot put it down.",
        add: ["worry-excessive", "worry-hard-to-control"],
        context: { impairment: "yes" },
        teach: "Two key features alone are a thin picture. Look for the breadth flag holding the match back.",
      },
      {
        label: "Asking about the body",
        story: "They describe tight shoulders, feeling keyed up, poor sleep and losing the thread at work.",
        add: ["muscle-tension", "restlessness", "insomnia", "concentration-difficulty"],
        teach: "Supporting features across several areas lift the match. The duration is still unknown, so read the timing flag.",
      },
      {
        label: "Asking how long",
        story: "The worry started about three months ago, after a change at work.",
        context: { duration: "1to6m" },
        add: [],
        teach: "A duration shorter than this pattern usually needs lowers the match, and the flag says why. Ask more before reading anything into it.",
      },
      {
        label: "A correction",
        story: "Thinking it over, the client says the worry has been there most days for well over a year; work made it louder.",
        context: { duration: "gte6m" },
        add: [],
        teach: "With the timing clarified, the duration flag clears. The list is still for clinician review, not a diagnosis.",
      },
    ],
  },
  {
    id: "racing-heart",
    title: "Fictional case B: a racing heart",
    summary: "Sudden episodes with chest symptoms. Medical causes and the type of attack both matter.",
    steps: [
      {
        label: "The episodes",
        story: "The client reports attacks of a pounding heart, chest tightness and not getting a full breath. It is not yet clear what sets them off.",
        add: ["panic-attacks-unspecified", "palpitations", "chest-pain", "shortness-of-breath"],
        context: { impairment: "yes" },
        teach: "Attacks of an unclear type: see which pattern needs attacks that come without warning, and the flag that says so.",
      },
      {
        label: "Medical check still pending",
        story: "Chest pain is new for them and no medical check has been done yet.",
        add: [],
        context: { medicalPossible: "yes" },
        teach: "A possible medical cause lowers every match that lists one and names what to rule out first.",
      },
      {
        label: "After the medical visit",
        story: "Primary care found no medical cause. The attacks come out of nowhere, sometimes at night; the client now dreads the next one and carries water and sits near exits. This has gone on for about two months.",
        add: ["panic-attacks-unexpected", "persistent-concern-future-attacks", "behavior-change-avoid-attacks"],
        context: { medicalPossible: "no", substancePossible: "no", duration: "1to6m" },
        teach: "With the required feature documented and the medical question answered, compare how the ranking and flags change.",
      },
    ],
  },
  {
    id: "after-job-loss",
    title: "Fictional case C: low mood after a job loss",
    summary: "Low mood with a clear stressor. Two patterns stay in view, and a red flag appears.",
    steps: [
      {
        label: "First session",
        story: "The client feels low most days, sleeps badly and has stopped seeing friends.",
        add: ["depressed-mood", "insomnia", "social-withdrawal"],
        context: { impairment: "yes" },
        teach: "Mood features alone give a moderate feature match: open the missing features to see what has not been asked yet.",
      },
      {
        label: "The stressor",
        story: "They lost their job five weeks ago, keep replaying it, and their routines have fallen apart.",
        add: ["identifiable-stressor", "stressor-preoccupation", "difficulty-adjusting"],
        context: { duration: "1to6m" },
        teach: "A clear, recent stressor brings another pattern into view. Both stay for clinician review.",
      },
      {
        label: "A fuller picture",
        story: "Nothing feels enjoyable, they are drained by small tasks, blame themselves harshly and say they sometimes wish they would not wake up.",
        add: ["anhedonia", "fatigue", "worthlessness-guilt", "passive-death-wish"],
        teach: "Thoughts of death are a red flag: the app shows crisis information and asks you to assess directly. It never decides risk.",
      },
    ],
  },
  {
    id: "after-a-crash",
    title: "Fictional case D: after a car crash",
    summary: "Nightmares and alertness. The event itself, and how recent it is, change what fits.",
    steps: [
      {
        label: "Sleep and alertness",
        story: "The client has bad dreams, startles at loud noises and feels on guard all the time.",
        add: ["nightmares", "startle", "hypervigilance", "insomnia"],
        context: { impairment: "yes" },
        teach: "Without a documented event, look for the flag about a required feature.",
      },
      {
        label: "The event",
        story: "They were in a serious car crash. Images of it break in during the day, and they now take long detours to avoid that road.",
        add: ["traumatic-event-exposure", "intrusive-memories", "avoidance-trauma-reminders"],
        teach: "With the event and core features documented, see how the match and its flags change.",
      },
      {
        label: "How recent",
        story: "The crash happened ten days ago.",
        context: { duration: "lt2w" },
        add: [],
        teach: "Reactions in the first weeks are common and often settle. The duration flag explains why the match is lowered; reassess over time.",
      },
    ],
  },
];

/** The cases are original and fictional; their teaching points rest on these sources (also cited by the condition files). */
export const VIGNETTE_GOVERNANCE = {
  sources: [
    { title: "Anxiety Disorders (health topic)", publisher: "National Institute of Mental Health", url: "https://www.nimh.nih.gov/health/topics/anxiety-disorders" },
    { title: "Depression (health topic)", publisher: "National Institute of Mental Health", url: "https://www.nimh.nih.gov/health/topics/depression" },
    {
      title: "Post-traumatic stress disorder (NG116)",
      publisher: "National Institute for Health and Care Excellence (NICE)",
      url: "https://www.nice.org.uk/guidance/ng116",
      year: 2018,
    },
    {
      title: "ICD-11 for Mortality and Morbidity Statistics",
      publisher: "World Health Organization",
      url: "https://icd.who.int/browse/latest-release/mms/en",
    },
  ],
  license: "original",
  lastVerified: "2026-11-27",
  reviewedBy: "PENDING",
} as const;

/** Symptom ids and context documented by the end of step `index` (0-based). */
export function stateAtStep(v: Vignette, index: number): { symptomIds: string[]; context: VignetteContext } {
  const steps = v.steps.slice(0, index + 1);
  const ids = [...new Set(steps.flatMap((s) => s.add))];
  const context = steps.reduce<VignetteContext>((ctx, s) => ({ ...ctx, ...s.context }), { ...VIGNETTE_START });
  return { symptomIds: ids, context };
}

/* ------------------------------------------------------------------ comparing two scoring runs */

type Strength = Suggestion["strength"];
const RANK: Record<Strength, number> = { possible: 0, moderate: 1, strong: 2 };

export interface SuggestionChange {
  conditionId: string;
  name: string;
  before: Strength | null;
  now: Strength | null;
  kind: "new" | "stronger" | "weaker" | "same" | "dropped";
}

/** How each suggestion changed between two scoring runs (current order first, then dropped ones). */
export function compareRuns(before: readonly Suggestion[] | null, now: readonly Suggestion[]): SuggestionChange[] {
  const prev = new Map((before ?? []).map((s) => [s.conditionId, s]));
  const out: SuggestionChange[] = now.map((s) => {
    const p = prev.get(s.conditionId);
    const kind = !before ? "same" : !p ? "new" : RANK[s.strength] > RANK[p.strength] ? "stronger" : RANK[s.strength] < RANK[p.strength] ? "weaker" : "same";
    return { conditionId: s.conditionId, name: s.name, before: p?.strength ?? null, now: s.strength, kind };
  });
  const shown = new Set(now.map((s) => s.conditionId));
  for (const p of before ?? []) {
    if (!shown.has(p.conditionId)) out.push({ conditionId: p.conditionId, name: p.name, before: p.strength, now: null, kind: "dropped" });
  }
  return out;
}
