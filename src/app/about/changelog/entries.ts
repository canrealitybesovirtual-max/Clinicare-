/**
 * Content changelog: what changed in the clinical content, newest first. Static data written by hand when content
 * changes (no git or build-time history), so the page shows exactly what was recorded. Items are named by
 * "type/id" (src/app/about/report/content-items.ts); tests/unit/governance-changelog.test.ts checks every one
 * resolves, so a renamed or removed item cannot leave a dead entry behind.
 */

export const CHANGE_KINDS = ["added", "changed", "corrected", "removed"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export interface ChangelogEntry {
  date: string;
  kind: ChangeKind;
  title: string;
  summary: string;
  /** Content items this entry is about; summary-only entries (process or licensing changes) list none. */
  items: readonly string[];
  /** In-app page with more detail, for entries without items. */
  link?: { href: string; label: string };
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-11-27",
    kind: "changed",
    title: "Session check-in card rewritten",
    summary:
      "The end-of-visit items are now open prompts with no ratings, in English and Spanish, and the practice log asks what helped most. The card is not offered in client mode until its review is complete.",
    items: ["handout/session-check-in-card"],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Theoretical orientation profiles",
    summary:
      "One profile per major family of therapy: how it understands problems and change, the therapist stance, typical techniques from the library, evidence in brief, cautions, and where to train. Proprietary models link to their certifying body.",
    items: [
      "orientation/acceptance-and-commitment-therapy", "orientation/behavior-therapy",
      "orientation/cognitive-therapy", "orientation/dialectical-behavior-therapy", "orientation/existential-therapy",
      "orientation/humanistic-experiential-therapy", "orientation/integrative-common-factors",
      "orientation/interpersonal-therapies", "orientation/mindfulness-and-compassion-based-therapies",
      "orientation/multicultural-feminist-liberation", "orientation/narrative-and-solution-focused-therapy",
      "orientation/positive-psychology", "orientation/psychodynamic-therapy",
      "orientation/somatic-and-parts-based-therapies", "orientation/systemic-family-and-couples-therapy",
      "orientation/trauma-focused-therapies",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Case formulation frameworks",
    summary:
      "Frameworks for building a shared, collaborative formulation, from the five Ps and the CBT three-level model to minority stress, moral injury and level-of-care thinking, with prompts and links into the library.",
    items: [
      "formulation/act-flexibility", "formulation/cbt-three-level", "formulation/co-occurring-and-level-of-care",
      "formulation/dimensional-personality", "formulation/disorder-maintenance-models",
      "formulation/fear-avoidance-pain", "formulation/five-ps-biopsychosocial-spiritual",
      "formulation/functional-analysis", "formulation/minority-stress", "formulation/moral-injury",
      "formulation/phase-based-trauma-sequencing", "formulation/psychodynamic-ccrt",
      "formulation/transdiagnostic-process-map",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Interventions across orientations",
    summary:
      "New library interventions, each with sources, cautions and cultural adaptations; trained-only models give an overview and point to the certifying body. Many carry structured evidence grades (body, year, direction and the body’s own strength term).",
    items: [
      "intervention/behavioral-chain-analysis", "intervention/behavioral-couples-therapy",
      "intervention/bipolar-relapse-signature-plan", "intervention/brief-alcohol-intervention",
      "intervention/brief-behavioral-treatment-insomnia", "intervention/bright-light-therapy",
      "intervention/cbasp-situational-analysis", "intervention/cbct-for-ptsd",
      "intervention/cbt-and-act-for-chronic-pain", "intervention/cognitive-therapy-for-ptsd",
      "intervention/community-reinforcement-approach", "intervention/core-belief-work",
      "intervention/counselling-for-depression", "intervention/craft-for-family-members",
      "intervention/culturally-adapted-cbt", "intervention/dementia-caregiver-support",
      "intervention/dynamic-interpersonal-therapy", "intervention/eating-disorder-specialist-therapies",
      "intervention/family-focused-therapy-bipolar", "intervention/good-psychiatric-management",
      "intervention/guided-self-help", "intervention/imagery-rehearsal-therapy",
      "intervention/integrated-ptsd-sud-treatment", "intervention/intolerance-of-uncertainty-cbt",
      "intervention/ipv-safety-planning", "intervention/late-life-depression-programs",
      "intervention/lgbtq-affirmative-cbt", "intervention/meaning-centered-and-dignity-therapy",
      "intervention/metacognitive-therapy", "intervention/mindfulness-oriented-recovery-enhancement",
      "intervention/neuromodulation-referral", "intervention/ocd-appraisal-cognitive-therapy",
      "intervention/one-session-treatment-phobia", "intervention/perinatal-depression-programs",
      "intervention/positive-psychology-practices", "intervention/power-and-gender-role-analysis",
      "intervention/present-centered-therapy", "intervention/problem-management-plus",
      "intervention/psychological-first-aid-and-recovery-skills", "intervention/racial-trauma-and-race-based-stress",
      "intervention/rebt-disputation", "intervention/reminiscence-and-life-review",
      "intervention/rumination-focused-cbt", "intervention/smi-community-support-referral",
      "intervention/social-connection-and-loneliness", "intervention/stress-inoculation-training",
      "intervention/suicide-bereavement-support", "intervention/suicide-specific-psychotherapies",
      "intervention/supportive-psychotherapy", "intervention/systemic-circular-questioning",
      "intervention/transference-focused-psychotherapy", "intervention/twelve-step-and-mutual-help-facilitation",
      "intervention/unified-protocol", "intervention/well-being-therapy",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Client handouts with Spanish versions",
    summary:
      "New client handouts in plain language (grade 6 to 8, plus easy-read versions), each with a machine-assisted Spanish version that still needs a fluent human review. Substance-use handouts carry the 42 CFR Part 2 notice.",
    items: [
      "handout/activity-and-mood-log", "handout/activity-ideas-menu", "handout/after-a-crisis-next-steps",
      "handout/after-a-disaster-self-care", "handout/after-a-suicide-loss", "handout/anger-cycle-and-time-out",
      "handout/applied-relaxation-steps", "handout/asking-for-changes-at-work",
      "handout/between-session-practice-plan", "handout/body-checking-log", "handout/body-sensation-practice-log",
      "handout/breathing-and-grounding-easy-read", "handout/chain-analysis-sheet",
      "handout/common-reactions-after-trauma", "handout/couples-pause-and-repair",
      "handout/cutting-down-alcohol-safely", "handout/daily-emotion-and-urge-tracker",
      "handout/eating-concerns-warning-signs", "handout/facing-fears-what-to-expect", "handout/from-why-to-how",
      "handout/gambling-change-plan", "handout/grief-rebuilding-log", "handout/habit-reversal-practice",
      "handout/health-worry-cycle", "handout/helping-someone-at-risk", "handout/high-risk-situations-plan",
      "handout/how-sleep-works", "handout/listening-to-someone-you-love", "handout/medicine-taper-support",
      "handout/medicines-for-opioid-use", "handout/monthly-mood-tracker", "handout/mood-highs-and-lows-plan",
      "handout/mutual-help-options", "handout/my-health-information-rights", "handout/my-quit-tobacco-plan",
      "handout/my-relationships-map", "handout/my-story-in-my-words", "handout/my-therapy-summary",
      "handout/new-parent-mood-help", "handout/nightmare-rescripting-practice", "handout/pacing-and-flare-plan",
      "handout/positive-data-log", "handout/questions-about-my-care", "handout/questions-for-my-prescriber",
      "handout/racing-mind-at-bedtime", "handout/relationship-safety-help-card", "handout/safer-home-for-family",
      "handout/safety-plan-easy-read", "handout/scary-thoughts-after-baby", "handout/session-check-in-card",
      "handout/sleep-habits-easy-read", "handout/sleep-window-guide", "handout/social-connection-plan",
      "handout/social-nervousness-cycle", "handout/substance-use-diary", "handout/thinking-traps",
      "handout/three-emotion-systems", "handout/three-good-things", "handout/trauma-therapy-what-to-expect",
      "handout/understanding-low-mood", "handout/understanding-unusual-experiences",
      "handout/understanding-unwanted-thoughts", "handout/video-session-guide", "handout/voices-coping-plan",
      "handout/weighing-a-change", "handout/what-keeps-it-going", "handout/what-to-expect-in-therapy",
      "handout/why-worry-sticks",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Condition cards",
    summary:
      "New condition cards in original clinical wording with ICD-10-CM and ICD-11 codes and a See DSM-5-TR pointer.",
    items: [
      "condition/acute-stress-disorder", "condition/body-focused-repetitive-behaviors",
      "condition/gambling-disorder", "condition/premenstrual-dysphoric-disorder",
      "condition/sedative-hypnotic-use-disorder", "condition/tobacco-use-disorder",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Plan modules",
    summary:
      "Cross-cutting problems the plan builder can add to any plan or to listed conditions, such as safety, sleep, engagement, care coordination and psychosocial problems.",
    items: [
      "plan-module/care-coordination-and-social-needs", "plan-module/chronic-pain-with-mood-or-anxiety",
      "plan-module/engagement-and-attendance", "plan-module/maintenance-and-ending",
      "plan-module/perfectionism-self-esteem-procrastination", "plan-module/perinatal-adaptations",
      "plan-module/psychosocial-problems", "plan-module/sleep-disturbance", "plan-module/substance-use-as-coping",
      "plan-module/suicide-and-self-harm-safety", "plan-module/work-stress-and-return-to-work",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Practice guides",
    summary:
      "Guides for the process of therapy (alliance, outcome monitoring, goals, session structure, interpreters, supervision) and for safety and care coordination (caring contacts, warm handoffs, de-escalation, medical red flags). None scores or decides risk.",
    items: [
      "practice/alliance-and-rupture-repair", "practice/between-session-practice",
      "practice/care-transitions-and-warm-handoffs", "practice/caring-contacts", "practice/clinician-postvention",
      "practice/clinician-reactions-and-self-disclosure", "practice/collaborative-care-and-pcbh",
      "practice/combined-care-decision-points", "practice/couples-and-conjoint-sessions",
      "practice/diagnostic-reasoning-checks", "practice/eating-disorder-medical-risk",
      "practice/ending-therapy-and-boosters", "practice/first-sessions-and-role-induction",
      "practice/goal-attainment-scaling", "practice/goals-by-orientation", "practice/group-formats",
      "practice/in-session-de-escalation", "practice/intake-assessment", "practice/involving-family-and-supports",
      "practice/ipv-screening-and-first-line-support", "practice/medication-induced-psychiatric-symptoms",
      "practice/mental-health-app-evaluation", "practice/mental-status-exam",
      "practice/multicultural-orientation-and-broaching", "practice/outcome-monitoring",
      "practice/postpartum-psychosis-vs-intrusive-thoughts", "practice/preferences-goals-and-readiness",
      "practice/problem-prioritization", "practice/psychotropic-red-flags", "practice/recovery-and-harm-reduction",
      "practice/self-harm-assessment-and-formulation", "practice/session-structure",
      "practice/shared-decision-making", "practice/socratic-questioning", "practice/stepped-care-and-level-of-care",
      "practice/supervision-and-consultation", "practice/teach-back-and-plain-language",
      "practice/telehealth-sessions", "practice/trauma-informed-care", "practice/unwanted-effects-of-therapy",
      "practice/validation-levels", "practice/violence-risk-prompts", "practice/working-with-interpreters",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Population profiles",
    summary:
      "Prompts for adapting engagement, assessment and interventions with specific groups of adults, written as questions to explore with each client rather than assumptions about a group.",
    items: [
      "population/autistic-adults", "population/college-students", "population/cultural-adaptation",
      "population/deaf-and-hard-of-hearing", "population/disability-affirming",
      "population/first-responders-and-health-workers", "population/housing-instability",
      "population/indigenous-peoples", "population/intellectual-disability", "population/justice-involved",
      "population/lgbtq-affirmative", "population/men-and-masculinity", "population/military-and-veterans",
      "population/older-adults", "population/perinatal", "population/post-exertional-malaise",
      "population/refugees-and-asylum-seekers", "population/rural-and-agricultural",
      "population/serious-medical-illness", "population/sexual-health-in-therapy",
      "population/sexual-violence-and-trafficking-survivors", "population/spiritually-integrated",
      "population/traumatic-brain-injury",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Legal and practice topics",
    summary:
      "New legal and ethics-practice topics, including competence and scope, boundaries, decision-making capacity, contested practices and safeguards around memory and suggestion.",
    items: [
      "legal/ai-in-clinical-practice", "legal/asylum-and-immigration-evaluations",
      "legal/between-session-contact-policy", "legal/clinician-personal-safety",
      "legal/clinician-wellbeing-and-impairment", "legal/competence-and-scope-of-practice",
      "legal/contested-practices", "legal/continuity-and-professional-will", "legal/conversion-practices",
      "legal/decision-making-capacity", "legal/digital-accessibility", "legal/documentation-and-medical-necessity",
      "legal/emerging-treatments-and-psychedelics", "legal/erpo-and-firearm-transfer",
      "legal/ethical-decision-making", "legal/group-confidentiality", "legal/international-mental-health-law",
      "legal/memory-and-suggestion-safeguards", "legal/military-confidentiality",
      "legal/multiple-relationships-and-boundaries", "legal/psychiatric-advance-directives",
      "legal/reproductive-health-privacy", "legal/touch-and-body-based-work", "legal/treating-and-forensic-roles",
      "legal/treatment-plans-and-client-access",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Client topics",
    summary:
      "New client-mode topics with plain-language labels, MedlinePlus pages and matching handouts.",
    items: [
      "topic/college-life", "topic/disability-and-wellbeing", "topic/living-with-pain",
      "topic/money-and-housing-stress", "topic/racism-and-discrimination-stress", "topic/sexual-health",
      "topic/work-stress",
    ],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Statistics",
    summary:
      "Prevalence figures for the new condition cards, each with its publisher and data year.",
    items: [
      "stat/us-gambling-problems", "stat/us-pmdd-prevalence", "stat/us-sedative-misuse-past-year",
      "stat/us-tobacco-use-adults", "stat/us-trichotillomania-prevalence",
    ],
  },
  {
    date: "2026-11-27",
    kind: "changed",
    title: "Measure license queue",
    summary:
      "35 more measures (among them the EPDS, GDS, Mini-Cog, MoCA, PC-PTSD-5, WHO-5, WHODAS 2.0, ORS and SRS) are recorded as license pending with the publisher's terms. Pages may link out to them; none is built in until the owner confirms terms in writing. The AGS Beers Criteria are recorded as not licensed: pages point to them and never reproduce them.",
    items: [],
    link: { href: "/about#licensing-heading", label: "License status" },
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Lactation lookup and Beers link-out",
    summary:
      "Medication pages can open the NIH LactMed record on demand. Only the drug name is sent, and LactMed shares the NCBI key and rate limit with PubMed. The older-adults profile links out to the AGS Beers Criteria (2023) and does not reproduce them.",
    items: [],
  },
  {
    date: "2026-11-27",
    kind: "added",
    title: "Content checks",
    summary:
      "Content validation now fails when a client handout has no Spanish version or no page offers it, and checks structured evidence grades. A report-only queue lists items awaiting clinical sign-off, Spanish awaiting a fluent human review, and evidence grades more than five years old.",
    items: [],
  },
  {
    date: "2026-11-27",
    kind: "changed",
    title: "Spanish client mode",
    summary:
      "Client mode, client topics and every client handout can be shown in Spanish. The translations are machine-assisted and still need a fluent human review.",
    items: [],
  },
  {
    date: "2026-11-26",
    kind: "changed",
    title: "42 CFR Part 2 notice wording",
    summary:
      "Substance-use handouts and exports carry the owner-approved notice: 42 CFR Part 2 prohibits unauthorized use or disclosure of these records.",
    items: [],
  },
  {
    date: "2026-11-26",
    kind: "added",
    title: "Interventions, handouts and plan libraries",
    summary:
      "The offline library: interventions across theoretical orientations, client handouts and a treatment-plan library for each condition, with a source verification report.",
    items: [],
  },
  {
    date: "2026-11-26",
    kind: "added",
    title: "Phase 1 knowledge base",
    summary:
      "The symptom lexicon, condition cards with ICD-10-CM and ICD-11 codes, the GAD-7 and PHQ-9, curated statistics with publisher and data year, and crisis lines.",
    items: [],
  },
];
