/**
 * Theoretical orientation / modality families for filtering the interventions library.
 * Derived from each intervention's curated `modality` and `name` (content/interventions); an intervention can
 * belong to several families (for example religiously integrated CBT is both CBT and spiritually integrated).
 * Pure and isomorphic.
 */

export interface Orientation {
  id: string;
  label: string;
  match: RegExp;
}

export const ORIENTATIONS: readonly Orientation[] = [
  { id: "cbt", label: "CBT and cognitive therapy", match: /\bCBT\b|cognitive therapy|cognitive restructuring|problem-solving/i },
  { id: "behavioral", label: "Behavioral", match: /behavioral activation|behavioral skills|contingency management|stimulus control|sleep restriction/i },
  { id: "exposure", label: "Exposure-based", match: /\bexposure\b|safety-behavior/i },
  { id: "act", label: "Acceptance and commitment therapy (ACT)", match: /\bACT\b/ },
  { id: "dbt", label: "Dialectical behavior therapy (DBT) skills", match: /\bDBT\b/ },
  { id: "mindfulness", label: "Mindfulness and compassion", match: /mindful|\bMBCT\b|\bMBSR\b|\bMBRP\b|compassion/i },
  { id: "relaxation", label: "Relaxation, breathing and grounding", match: /relaxation|breathing|grounding|stabiliz/i },
  { id: "trauma", label: "Trauma-focused", match: /trauma|\bEMDR\b|\bSTAIR\b/i },
  { id: "motivational", label: "Motivational interviewing", match: /motivational interviewing|decisional balance/i },
  { id: "psychodynamic", label: "Psychodynamic, interpersonal and emotion-focused", match: /psychodynamic|interpersonal psychotherapy|emotion-focused/i },
  { id: "humanistic", label: "Humanistic, narrative and solution-focused", match: /person-centered|humanistic|narrative therapy|solution-focused/i },
  { id: "systemic", label: "Family and systemic", match: /family systems|genogram/i },
  { id: "grief", label: "Grief-focused", match: /grief/i },
  { id: "safety", label: "Suicide prevention and safety", match: /suicide prevention|safety planning|lethal means/i },
  { id: "integrative", label: "Complementary and integrative", match: /complementary and integrative/i },
  { id: "spiritual", label: "Spiritually integrated", match: /spiritually integrated|religiously integrated/i },
  { id: "care", label: "Assessment and care coordination", match: /care coordination|culturally responsive assessment/i },
];

export const OTHER_ORIENTATION: Orientation = { id: "other", label: "Other approaches", match: /$^/ };

/** Family ids for one intervention (never empty: unmatched items fall under "other"). */
export function orientationsOf(i: { name: string; modality: string }): string[] {
  const text = `${i.modality} ${i.name}`;
  const ids = ORIENTATIONS.filter((o) => o.match.test(text)).map((o) => o.id);
  return ids.length ? ids : [OTHER_ORIENTATION.id];
}

export function orientationLabel(id: string): string {
  return ORIENTATIONS.find((o) => o.id === id)?.label ?? OTHER_ORIENTATION.label;
}
