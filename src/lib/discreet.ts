/**
 * Discreet-page constants (relationship and sexual violence safety pages). Plain module, so server components
 * (generateMetadata, page bodies) and client components can both read them. See components/layout/quick-exit.tsx.
 */

/** Neutral page the quick exit replaces this one with. A general search page reveals nothing about what was read. */
export const QUICK_EXIT_URL = "https://www.google.com/";

/** Tab title for discreet pages (client effect and server generateMetadata). */
export const DISCREET_TITLE = { en: "Health information", es: "Información de salud" } as const;

/** Pages that get the quick exit: the relationship-safety client topic and its help card, in each language. */
export const DISCREET_PATHS: readonly string[] = [
  "/client/topics/relationship-safety",
  "/client/skills/relationship-safety-help-card",
  "/r/relationship-safety-help-card",
  "/r/relationship-safety-help-card/es",
];

/** Content ids whose pages are discreet. */
export const DISCREET_TOPIC_IDS: readonly string[] = ["relationship-safety"];
export const DISCREET_HANDOUT_IDS: readonly string[] = ["relationship-safety-help-card"];

export function isDiscreetPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return DISCREET_PATHS.includes(path);
}
