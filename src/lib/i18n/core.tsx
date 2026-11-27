"use client";
/**
 * Language support (en / es). Memory-only: the choice lives in React state for this tab and is never
 * stored (G5). Default "en". Components read text with `useT()` and a { en, es } pair, so a missing
 * Spanish string falls back to English instead of breaking the screen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "es";
export const LANGS: readonly Lang[] = ["en", "es"] as const;
export type Text = { en: string; es?: string };

type LangCtx = { lang: Lang; setLang: (l: Lang) => void };
const Ctx = createContext<LangCtx>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}

/** Pick the string for a language, falling back to English. Usable outside React (PDF builders). */
export function pick(text: Text | string, lang: Lang): string {
  if (typeof text === "string") return text;
  return (lang === "es" && text.es) || text.en;
}

/** Hook form: `const t = useT(); t({ en: "Save", es: "Guardar" })`. */
export function useT(): (text: Text | string) => string {
  const { lang } = useLang();
  return useCallback((text: Text | string) => pick(text, lang), [lang]);
}
