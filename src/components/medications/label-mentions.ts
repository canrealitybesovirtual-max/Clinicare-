/**
 * Finds the sentences of a current FDA label section that mention mood, behavior, sleep or thinking, for the
 * mental-health label check on /medications/effects. Pure and isomorphic. It runs on label text the server already
 * returned for a curated medicine; nothing typed by the clinician is involved, and nothing here judges a client.
 * Type-only import of the content module, so client bundles never load the content files through this helper.
 */
import type { PsychEffect } from "@/lib/schemas-care";

/** Label wording that maps to each effect group (case-insensitive word starts). */
const EFFECT_TERMS: Record<PsychEffect, RegExp> = {
  // Not "respiratory depression" or "depressed myocardial function", which are not about mood.
  "low-mood":
    /(?<!(?:respiratory|CNS|nervous system|bone marrow|marrow)\s)\bdepress(?:ion|ive|ed)\b(?!\s+(?:myocardial|respiratory|cardiac))|\bmood (?:change|disturbance|swings?)|\bdysphori/i,
  "suicidal-thoughts": /\bsuicid/i,
  "anxiety-agitation": /\b(?:anxi(?:ety|ous)|agitat|restless|akathisia|panic|nervousness)/i,
  "irritability-aggression": /\b(?:irritab|aggress|hostil|violen|anger)/i,
  "sleep-change": /\b(?:insomnia|sleep (?:disturbance|problems?)|nightmares?|abnormal dreams?|vivid dreams?|dream abnormalit)/i,
  psychosis: /\b(?:psychos[ie]s|psychotic|hallucinat|delusion|paranoi)/i,
  "mania-activation": /\b(?:mania|manic|hypomani|activation of mania)/i,
  confusion: /\b(?:confusion|confused|disorientation|delirium|memory impairment)/i,
};

export interface LabelMention {
  sentence: string;
  effects: PsychEffect[];
}

export const MENTION_MAX = 8;

/** Sentences (in label order) that mention at least one effect group, with the groups each one mentions. */
export function labelMentions(text: string | null | undefined, max = MENTION_MAX): LabelMention[] {
  if (!text) return [];
  const out: LabelMention[] = [];
  for (const raw of text.split(/(?<=[.!?])\s+/)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const effects = (Object.keys(EFFECT_TERMS) as PsychEffect[]).filter((k) => EFFECT_TERMS[k].test(sentence));
    if (effects.length) out.push({ sentence, effects });
    if (out.length >= max) break;
  }
  return out;
}
