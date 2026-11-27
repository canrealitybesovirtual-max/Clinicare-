/**
 * Intervention precaution screen (tools/precautions). Pure: no React, no I/O.
 *
 * The clinician ticks context the client has (heart or lung condition, pregnancy, history of mania, seizures,
 * safety-critical work, current psychosis, severe dissociation, post-exertional malaise, falls risk). For each
 * ticked context the screen lists, per intervention:
 *   1. curated notes below, each with its own sources (original wording, G1/G2, G10);
 *   2. the intervention's OWN caution lines from the library (content/interventions, already sourced there) that
 *      mention that context.
 * It never blocks, ranks, scores or decides anything (G9): every note is "For clinician review", and the list is in
 * A to Z order. Tick boxes only, no free text; the choices live in the screen's memory and are never stored (G5).
 */
import type { Source } from "@/lib/schemas";

export const PRECAUTION_CONTEXTS = [
  {
    id: "cardiac-respiratory",
    label: "Heart, blood-pressure or lung condition",
    pattern: /\b(?:heart|cardiac|blood[- ]pressure|hypertension|lungs?|asthma|COPD|respiratory)\b/i,
  },
  { id: "pregnancy", label: "Pregnancy or recently given birth", pattern: /\bpregnan/i },
  { id: "bipolar-history", label: "History of mania or hypomania", pattern: /\b(?:bipolar|mania|manic|hypomani\w*|elevated mood)\b/i },
  { id: "seizures", label: "Seizure disorder", pattern: /\b(?:seizures?|epilep\w*)\b/i },
  {
    id: "safety-critical-work",
    label: "Drives a lot or does safety-critical work",
    pattern: /\b(?:driv(?:e|es|ing)|machinery|safety-critical|safety-sensitive|high-risk work)\b/i,
  },
  { id: "active-psychosis", label: "Current psychotic symptoms", pattern: /\b(?:psychosis|psychotic)\b/i },
  { id: "severe-dissociation", label: "Severe dissociation", pattern: /\bdissociat\w*/i },
  {
    id: "post-exertional-malaise",
    label: "Symptoms flare after effort (post-exertional malaise)",
    pattern: /\bpost-exertional\b/i,
  },
  {
    id: "falls-risk",
    label: "Older adult or at risk of falls",
    pattern: /\b(?:falls? risk|risk of falls|frail\w*|a fall|older adults?)\b/i,
  },
] as const satisfies readonly { id: string; label: string; pattern: RegExp }[];

export type PrecautionContextId = (typeof PRECAUTION_CONTEXTS)[number]["id"];
export const PRECAUTION_CONTEXT_IDS: readonly PrecautionContextId[] = PRECAUTION_CONTEXTS.map((c) => c.id);

export interface PrecautionRule {
  id: string;
  contexts: readonly PrecautionContextId[];
  interventionIds: readonly string[];
  /** Original, short note for clinician review. Never a rule-out. */
  note: string;
  sources: readonly Source[];
}

const pubmed = (pmid: string, title: string, journal: string, year: number): Source => ({
  title,
  publisher: `${journal}, via PubMed (US National Library of Medicine)`,
  url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  year,
});

const AASM_2021 = pubmed(
  "33164742",
  "Behavioral and psychological treatments for chronic insomnia disorder in adults: an American Academy of Sleep Medicine clinical practice guideline (Edinger et al.)",
  "Journal of Clinical Sleep Medicine",
  2021,
);
const KYLE_2014 = pubmed(
  "24497651",
  "Sleep restriction therapy for insomnia is associated with reduced objective total sleep time, increased daytime somnolence, and objectively impaired vigilance (Kyle et al.)",
  "Sleep",
  2014,
);
const BOETTCHER_2016 = pubmed(
  "26596849",
  "Origins and outlook of interoceptive exposure (Boettcher, Brake and Barlow)",
  "Journal of Behavior Therapy and Experimental Psychiatry",
  2016,
);
const OST_1987 = pubmed(
  "3593159",
  "Applied tension: a specific behavioral method for treatment of blood phobia (Öst and Sterner)",
  "Behaviour Research and Therapy",
  1987,
);
const BRITTON_2021 = pubmed(
  "35174010",
  "Defining and measuring meditation-related adverse effects in mindfulness-based programs (Britton et al.)",
  "Clinical Psychological Science",
  2021,
);
const VAN_DEN_BERG_2015 = pubmed(
  "25607833",
  "Prolonged exposure vs eye movement desensitization and reprocessing vs waiting list for PTSD in patients with a psychotic disorder: a randomized clinical trial (van den Berg et al.)",
  "JAMA Psychiatry",
  2015,
);
const LAM_2020 = pubmed(
  "31826657",
  "Light therapy for patients with bipolar depression: systematic review and meta-analysis of randomized controlled trials (Lam et al.)",
  "Canadian Journal of Psychiatry",
  2020,
);
const NCCIH_RELAXATION: Source = {
  title: "Relaxation techniques: what you need to know",
  publisher: "National Center for Complementary and Integrative Health",
  url: "https://www.nccih.nih.gov/health/relaxation-techniques-what-you-need-to-know",
};
const PAG_2018: Source = {
  title: "Physical Activity Guidelines for Americans, 2nd edition: executive summary",
  publisher: "US Department of Health and Human Services",
  url: "https://health.gov/sites/default/files/2019-10/PAG_ExecutiveSummary.pdf",
  year: 2018,
};
const NICE_NG116: Source = {
  title: "Post-traumatic stress disorder (NG116)",
  publisher: "National Institute for Health and Care Excellence",
  url: "https://www.nice.org.uk/guidance/ng116",
  year: 2018,
};
const NICE_NG206: Source = {
  title: "Myalgic encephalomyelitis (or encephalopathy)/chronic fatigue syndrome: diagnosis and management (NG206)",
  publisher: "National Institute for Health and Care Excellence",
  url: "https://www.nice.org.uk/guidance/ng206",
  year: 2021,
};

const SLEEP_SCHEDULING = ["cbti-sleep-restriction", "brief-behavioral-treatment-insomnia", "cbti-stimulus-control"] as const;
const TRAUMA_MEMORY = ["prolonged-exposure", "emdr", "cognitive-processing-therapy", "written-exposure-therapy", "imagery-rescripting"] as const;
const MEDITATIVE = ["mindfulness-meditation", "mindfulness-based-cognitive-therapy", "compassion-focused-imagery"] as const;

/** Curated, sourced notes. Each one is a prompt for the clinician's own judgment, never a contraindication verdict. */
export const PRECAUTION_RULES: readonly PrecautionRule[] = [
  {
    id: "arousal-exercises-heart-lung",
    contexts: ["cardiac-respiratory"],
    interventionIds: ["interoceptive-exposure", "one-session-treatment-phobia"],
    note: "Arousal exercises such as over-breathing, straw breathing, spinning or running on the spot load the heart and lungs. Get medical clearance first, choose or adapt exercises with the medical team's advice, and stop for symptoms that do not fit the expected anxiety response.",
    sources: [BOETTCHER_2016],
  },
  {
    id: "muscle-tension-blood-pressure",
    contexts: ["cardiac-respiratory", "pregnancy"],
    interventionIds: ["applied-tension", "progressive-muscle-relaxation"],
    note: "Repeated strong muscle tensing raises blood pressure for a short time. With heart disease, high blood pressure or pregnancy, ask the medical or obstetric clinician first and use lighter tension.",
    sources: [OST_1987, NCCIH_RELAXATION],
  },
  {
    id: "activity-medical-advice",
    contexts: ["cardiac-respiratory", "pregnancy"],
    interventionIds: ["physical-activity", "behavioral-activation", "yoga-mind-body"],
    note: "Physical activity is generally encouraged, including in pregnancy, but plans should follow the advice of the client's medical or obstetric clinician about type and intensity, and new warning symptoms need medical review.",
    sources: [PAG_2018],
  },
  {
    id: "sleep-scheduling-mania",
    contexts: ["bipolar-history"],
    interventionIds: SLEEP_SCHEDULING,
    note: "Limiting time in bed can cut sleep at first, and sleep loss can set off a mood episode. Coordinate with the prescriber, consider a gentler schedule and watch for early signs of a high.",
    sources: [AASM_2021],
  },
  {
    id: "light-therapy-mania",
    contexts: ["bipolar-history"],
    interventionIds: ["bright-light-therapy"],
    note: "Trials of light therapy in bipolar depression mostly gave light alongside mood-stabilizing medicine and monitored for a switch into a high. Agree the plan with the prescriber and track mood closely.",
    sources: [LAM_2020],
  },
  {
    id: "sleep-scheduling-seizures",
    contexts: ["seizures"],
    interventionIds: ["cbti-sleep-restriction", "brief-behavioral-treatment-insomnia"],
    note: "Sleep loss can make seizures more likely. Coordinate with the client's neurologist or medical clinician before restricting time in bed.",
    sources: [AASM_2021],
  },
  {
    id: "sleep-scheduling-vigilance",
    contexts: ["safety-critical-work"],
    interventionIds: SLEEP_SCHEDULING,
    note: "Daytime sleepiness and reduced vigilance are common in the first weeks of sleep restriction. Plan around driving and safety-critical work, or use a gentler schedule, and agree what the client will do if they feel sleepy.",
    sources: [KYLE_2014, AASM_2021],
  },
  {
    id: "sleep-scheduling-falls",
    contexts: ["falls-risk"],
    interventionIds: SLEEP_SCHEDULING,
    note: "Getting out of bed at night and daytime sleepiness both raise the chance of a fall. Plan a lit, clear route or a chair beside the bed, and check sedating medicines with the prescriber.",
    sources: [AASM_2021],
  },
  {
    id: "trauma-therapy-psychosis",
    contexts: ["active-psychosis"],
    interventionIds: ["prolonged-exposure", "emdr"],
    note: "Psychotic symptoms alone are not a reason to withhold trauma-focused therapy: a randomized trial in people with psychotic disorders found prolonged exposure and EMDR effective without more adverse events. Stabilize acute symptoms first and choose a trained provider experienced with psychosis.",
    sources: [VAN_DEN_BERG_2015, NICE_NG116],
  },
  {
    id: "meditation-adverse-effects",
    contexts: ["active-psychosis", "severe-dissociation"],
    interventionIds: MEDITATIVE,
    note: "Meditation and imagery can bring on distressing experiences, including dissociation, for some people. Prefer short, eyes-open, grounded practice, defer long or intensive practice and ask about unwanted effects after each session.",
    sources: [BRITTON_2021],
  },
  {
    id: "trauma-memory-dissociation",
    contexts: ["severe-dissociation"],
    interventionIds: TRAUMA_MEMORY,
    note: "Check whether the client can stay present while recalling trauma. Build in extra time for safety, stability and grounding skills first, and let a provider trained in the method decide on pacing.",
    sources: [NICE_NG116],
  },
  {
    id: "activity-post-exertional-malaise",
    contexts: ["post-exertional-malaise"],
    interventionIds: ["physical-activity", "behavioral-activation", "graded-in-vivo-exposure", "yoga-mind-body"],
    note: "Do not use fixed, stepwise increases in physical activity or exercise when symptoms flare after effort. Plan activity within the client's energy limits, with flexible adjustment up or down.",
    sources: [NICE_NG206],
  },
];

export const PRECAUTIONS_GOVERNANCE = { license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" } as const;

/** Every distinct source used by the curated notes (shown once on the screen). */
export const PRECAUTION_SOURCES: readonly Source[] = [
  ...new Map(PRECAUTION_RULES.flatMap((r) => r.sources).map((s) => [s.url, s] as const)).values(),
];

/** The slice of a library intervention this screen needs (passed from the server page). */
export interface InterventionCautions {
  id: string;
  name: string;
  contraindications: readonly string[];
}

export interface PrecautionEntry {
  interventionId: string;
  name: string;
  /** Curated notes for this context and intervention. */
  notes: readonly Pick<PrecautionRule, "id" | "note" | "sources">[];
  /** The intervention's own caution lines that mention this context. */
  cautionLines: readonly string[];
}

export function contextOf(id: PrecautionContextId) {
  return PRECAUTION_CONTEXTS.find((c) => c.id === id)!;
}

/** Caution lines of one intervention that mention the context (curated library text, matched on this device). */
export function matchingCautions(intervention: InterventionCautions, context: PrecautionContextId): string[] {
  const { pattern } = contextOf(context);
  return intervention.contraindications.filter((line) => pattern.test(line));
}

/**
 * For one ticked context: every intervention with a curated note or a matching caution line, A to Z by name.
 * Interventions with nothing to say about the context are left out; that is not a statement that they are safe.
 */
export function precautionsFor(context: PrecautionContextId, interventions: readonly InterventionCautions[]): PrecautionEntry[] {
  const rules = PRECAUTION_RULES.filter((r) => r.contexts.includes(context));
  return interventions
    .map((iv) => ({
      interventionId: iv.id,
      name: iv.name,
      notes: rules.filter((r) => r.interventionIds.includes(iv.id)).map(({ id, note, sources }) => ({ id, note, sources })),
      cautionLines: matchingCautions(iv, context),
    }))
    .filter((e) => e.notes.length > 0 || e.cautionLines.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}
