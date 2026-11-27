/**
 * Client-mode text limits (G3): anything a client sees or receives (client screens, client handout
 * PDFs, client page payloads) must not name a diagnosis, show a code or mention scoring. Source titles
 * often name conditions ("... generalized anxiety disorder ..."), and outside text (MedlinePlus titles,
 * referral descriptions) can too, in English or Spanish, so all of it passes through this one filter.
 * Conservative on purpose: when in doubt, the text is not shown. Pure; isomorphic.
 */
import type { Source } from "./schemas";

const CLINICAL_TERMS = [
  // Diagnosis vocabulary, DSM/ICD references and scoring terms (English)
  "disorder",
  "anxiety",
  "depress",
  "panic",
  "ptsd",
  "post-?traumatic",
  "phobia",
  "agoraphob",
  "diagnos",
  "\\bdsm\\b",
  "\\bicd\\b",
  "\\bscore",
  "severity",
  "bipolar",
  "schizo",
  "psychos[ie]s",
  "psychotic",
  "\\bOCD\\b",
  "\\bADHD\\b",
  "obsessive",
  "compulsive",
  "insomnia",
  "\\bAUD\\b",
  "\\bSUD\\b",
  "anorexi",
  "bulimi",
  "binge[- ]?eat",
  "borderline",
  "\\bBPD\\b",
  "hoard",
  "dysmorph",
  "\\bBDD\\b",
  "cyclothym",
  "\\bmanic\\b",
  "\\bmania\\b",
  "hypomani",
  "hypochondri",
  "attention[- ]deficit",
  "somatic symptom",
  "prolonged grief",
  "\\b(?:cannabis|opioid|stimulant)[- ]use\\b",
  "acute stress",
  "anxiolytic",
  "sedative[-, ]+hypnotic",
  "nicotine dependence",
  "pathological gambling",
  "trichotillomani",
  "excoriation",
  "dermatillomani",
  "body[- ]focused repetitive",
  "\\bBFRBs?\\b",
  "dysphori",
  "\\bPMDD\\b",
  // Codes: ICD-10-CM F-codes with or without a decimal (F41, F41.1), any dotted ICD-10-CM code (G47.00, Z63.4),
  // ICD-11 mental-health and sleep-wake codes (6A70, 6B00, 7A00)
  "\\bF\\d{2}(?:\\.\\d{0,3})?\\b",
  "\\b[A-Z]\\d{2}\\.\\d{1,4}\\b",
  "\\b(?:6[A-E]|7[AB])\\d[0-9A-Z]\\b",
  // ICD-11 codes outside chapters 6-7 used here: premenstrual dysphoric disorder (GA34.41), acute stress reaction (QE84)
  "\\bGA34(?:\\.\\d{1,2})?\\b",
  "\\bQE84\\b",
  // Spanish diagnosis and scoring words
  "trastorno",
  "ansiedad",
  "depresi",
  "p[aá]nico",
  "fobia",
  "agorafob",
  "diagn[oó]stic",
  "estr[eé]s postraum",
  "\\bTEPT\\b",
  "\\bTOC\\b",
  "esquizofren",
  "insomnio",
  "anorexia",
  "bulimia",
  "atrac[oó]n",
  "dism[oó]rfi",
  "ciclot[ií]mi",
  "hipoman",
  "\\bman[ií]a\\b",
  "hipocondr",
  "d[eé]ficit de atenci",
  "\\bTDAH\\b",
  "acumulaci[oó]n compulsiva",
  "duelo prolongado",
  "estr[eé]s agudo",
  "ludopat",
  "tricotiloman",
  "dermatiloman",
  "excoriaci",
  "juego patol",
  "\\bTDPM\\b",
  // "Tabaquismo" is the usual Spanish clinical name for tobacco dependence, so client text says "fumar" instead.
  "tabaquismo",
  "disf[oó]ric",
  "dependencia (?:de|a) la nicotina",
  "puntuaci",
  "gravedad",
];

/** Words and codes that must not appear in client-facing text, in English or Spanish. */
export const CLINICAL_TERMS_RE = new RegExp(CLINICAL_TERMS.join("|"), "i");

/** True when text names no diagnosis, code or score, in English or Spanish. */
export function isClientSafeText(text: string): boolean {
  return !CLINICAL_TERMS_RE.test(text);
}

/** First candidate that is client-safe, trimmed, or null. */
export function firstClientSafe(candidates: readonly (string | undefined | null)[]): string | null {
  for (const c of candidates) if (c && c.trim() && isClientSafeText(c)) return c.trim();
  return null;
}

/** True when the source's link names no condition either ("/topics/bipolar-disorder"). */
function isClientSafeUrl(url: string): boolean {
  let path = url;
  try {
    path = decodeURI(url);
  } catch {
    // A malformed escape is checked as written.
  }
  return isClientSafeText(path.replace(/[-_/]+/g, " "));
}

/**
 * The sources a client may receive (screen, PDF and page payload alike). A source whose title and link are
 * client-safe is kept as it is. One whose title or link names a condition is reduced to a publisher credit that
 * links to the publisher's home page, so the client is never sent to a diagnosis-titled page. A source whose
 * publisher names a condition is dropped. Duplicates are dropped. Idempotent.
 */
export function clientSafeSources(sources: readonly Source[]): Source[] {
  const out: Source[] = [];
  for (const s of sources) {
    if (!isClientSafeText(s.publisher)) continue;
    const home = `${new URL(s.url).origin}/`;
    const item: Source | null =
      isClientSafeText(s.title) && isClientSafeUrl(s.url)
        ? s
        : isClientSafeUrl(home)
          ? { title: s.publisher, publisher: s.publisher, url: home }
          : null;
    if (item && !out.some((o) => o.title === item.title && o.url === item.url)) out.push(item);
  }
  return out;
}

/** A handout as a client page may receive it: the same handout with client-safe sources only (G3). */
export function clientHandout<T extends { sources: readonly Source[]; linkOuts?: readonly LinkOutLike[] }>(handout: T): T {
  return {
    ...handout,
    sources: clientSafeSources(handout.sources),
    ...(handout.linkOuts ? { linkOuts: clientSafeLinkOuts(handout.linkOuts) } : {}),
  };
}

interface LinkOutLike {
  title: string;
  publisher: string;
  url: string;
  note?: string;
}

/** Curated link-outs whose title, publisher and note name no diagnosis, code or score (G3), https only. */
export function clientSafeLinkOuts<T extends LinkOutLike>(links: readonly T[]): T[] {
  return links.filter(
    (l) => l.url.startsWith("https://") && isClientSafeText(l.title) && isClientSafeText(l.publisher) && (!l.note || isClientSafeText(l.note)),
  );
}

/**
 * One credit line per source for client handouts: "title (publisher, year)" for a client-safe source, the
 * publisher's name alone for a publisher credit. Duplicates are dropped.
 */
export function clientSourceCredits(sources: readonly Source[]): string[] {
  const out: string[] = [];
  for (const s of clientSafeSources(sources)) {
    const credit = s.title === s.publisher ? s.publisher : `${s.title} (${s.publisher}${s.year ? `, ${s.year}` : ""})`;
    if (!out.includes(credit)) out.push(credit);
  }
  return out;
}
