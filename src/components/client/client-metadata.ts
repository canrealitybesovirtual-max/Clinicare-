import type { Metadata } from "next";

/**
 * Client-worded page metadata for /client/** and /r/** (G3). The site-wide description is written for clinicians;
 * a share link texted to a client shows this one in its preview instead. Names no condition, code or score.
 */
const DESCRIPTION = {
  en: "A self-help page to read or print. General information, not medical advice.",
  es: "Una página de autoayuda para leer o imprimir. Información general, no es consejo médico.",
} as const;

export function clientMetadata(lang: "en" | "es" = "en"): Metadata {
  return {
    title: { default: lang === "es" ? "Autoayuda" : "Self-help", template: lang === "es" ? "%s · Autoayuda" : "%s · Self-help" },
    description: DESCRIPTION[lang],
    openGraph: { description: DESCRIPTION[lang] },
  };
}
