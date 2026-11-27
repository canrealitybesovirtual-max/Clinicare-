/**
 * Curated substance-use term detector (G6, 42 CFR Part 2). Runs on this device only, on wording that is already
 * PHI-scrubbed (plan library items and the clinician's own plan wording). It never sends, stores or logs text: it only
 * decides whether an export must carry the Part 2 notice and the Ethics & Legal Hub prompt must show.
 * Errs toward showing the notice (a false positive adds a protective notice; a miss could leave records unmarked).
 */
const SUBSTANCE_RE =
  /\b(?:alcohol\w*|drink(?:s|ing)?|drank|drunk(?:enness)?|binge\w*|substances?|drugs?|cannabis|marijuana|weed|opioids?|opiates?|heroin|fentanyl|cocaine|crack|methamphetamine|meth|amphetamines?|stimulant misuse|benzodiazepines?|benzos?|sedatives?|hypnotics? misuse|intoxicat\w*|withdrawal|overdos\w*|hangovers?|sober\w*|relapse|naloxone|naltrexone|buprenorphine|methadone|acamprosate|disulfiram|AUD|SUD)\b/i;

/** True when the wording mentions alcohol or other substance use. */
export function mentionsSubstanceUse(text: string): boolean {
  return SUBSTANCE_RE.test(text);
}
