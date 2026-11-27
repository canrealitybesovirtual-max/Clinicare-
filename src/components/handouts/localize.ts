/**
 * One handout in one language. The English wording is the original; `es` is the Spanish translation stored
 * in the same content file (HandoutSchema.es). Everything that is not text (minutes, log rows, sources,
 * the substance-use flag) always comes from the original. Pure and isomorphic: the screen (HandoutBody)
 * and the printable PDF (src/lib/pdf.ts) use the same function, so both show the same words.
 */
import type { Handout } from "@/lib/schemas";
import type { Lang, Text } from "@/lib/i18n/core";

export interface LocalizedHandout {
  /** The language actually used (Spanish falls back to English when a handout has no translation). */
  lang: Lang;
  title: string;
  intro: string;
  sections: Handout["sections"];
  practiceLog?: { columns: string[]; rows: number };
  safetyNote: string;
  /** Who translated it, for Spanish ("machine-assisted, PENDING human review" until a fluent reviewer signs off). */
  translatedBy?: string;
}

/** Languages this handout can be shown and printed in. */
export function handoutLangs(h: Handout): Lang[] {
  return h.es ? ["en", "es"] : ["en"];
}

export function localizeHandout(h: Handout, lang: Lang): LocalizedHandout {
  const es = lang === "es" ? h.es : undefined;
  if (!es) {
    return { lang: "en", title: h.title, intro: h.intro, sections: h.sections, practiceLog: h.practiceLog, safetyNote: h.safetyNote };
  }
  return {
    lang: "es",
    title: es.title,
    intro: es.intro,
    sections: es.sections,
    // Same number of rows as the original; only the column names are translated.
    practiceLog: h.practiceLog && es.practiceLog ? { columns: es.practiceLog.columns, rows: h.practiceLog.rows } : h.practiceLog,
    safetyNote: es.safetyNote,
    translatedBy: es.translatedBy,
  };
}

/** Title in a language, for lists and links. */
export function handoutTitle(h: Pick<Handout, "title" | "es">): Text {
  return { en: h.title, es: h.es?.title };
}

/** Plain intro clipped at a word boundary, for list cards. */
export function clipText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}…`;
}

/** Wording around a handout (screen and PDF). `{n}` is filled by the caller. */
export const HANDOUT_TEXT = {
  minutes: { en: "About {n} minutes", es: "Unos {n} minutos" },
  practiceLog: { en: "Practice log", es: "Registro de práctica" },
  logRows: {
    en: "The printable PDF has {n} blank rows to fill in by hand.",
    es: "El PDF para imprimir tiene {n} filas en blanco para llenar a mano.",
  },
  logPreview: { en: "Practice log preview", es: "Vista previa del registro de práctica" },
  step: { en: "Step {n}: ", es: "Paso {n}: " },
  safetyNote: { en: "Safety note", es: "Nota de seguridad" },
  machineTranslated: {
    en: "Spanish translation made with computer help. A fluent reviewer has not checked it yet.",
    es: "Traducción hecha con ayuda de una computadora. Todavía no la ha revisado una persona experta en el idioma.",
  },
} satisfies Record<string, Text>;

/** `{n}` → value, for the plain strings above (screen and PDF). */
export function withN(template: string, n: number): string {
  return template.replace("{n}", String(n));
}
