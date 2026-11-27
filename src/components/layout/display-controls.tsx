"use client";
/**
 * Display preferences in the header: language (EN/ES) and large text. Both live in React memory for this tab
 * only (G5): nothing is written to browser storage, cookies or the URL, and a reload returns to the defaults.
 * They are not session data, so Clear session and the idle wipe leave them as they are.
 */
import * as React from "react";
import { ALargeSmall } from "lucide-react";
import { useLang, useT } from "@/lib/i18n/core";
import { HEADER } from "@/lib/i18n/shell";
import { cn } from "@/lib/utils";

type TextSizeCtx = { large: boolean; setLarge: (large: boolean) => void };
const TextSize = React.createContext<TextSizeCtx>({ large: false, setLarge: () => {} });

/** Large text scales the root font size (globals.css: html[data-text-size="large"]), so type and spacing grow together. */
export function TextSizeProvider({ children }: { children: React.ReactNode }) {
  const [large, setLarge] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    if (large) root.dataset.textSize = "large";
    else delete root.dataset.textSize;
  }, [large]);
  const value = React.useMemo(() => ({ large, setLarge }), [large]);
  return <TextSize.Provider value={value}>{children}</TextSize.Provider>;
}

export function useTextSize(): TextSizeCtx {
  return React.useContext(TextSize);
}

const control =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 text-sm font-semibold text-text hover:bg-surface-2";

/** Toggle button (aria-pressed) for large text, for telehealth screen sharing and low vision. */
export function TextSizeToggle() {
  const { large, setLarge } = useTextSize();
  const t = useT();
  return (
    <button
      type="button"
      aria-pressed={large}
      title={t(HEADER.largeTextHint)}
      onClick={() => setLarge(!large)}
      className={cn(control, "aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent")}
    >
      <ALargeSmall aria-hidden className="size-5" />
      <span className="sr-only">{t(HEADER.largeText)}</span>
    </button>
  );
}

/** Switches the shell between English and Spanish. The label names the other language in that language. */
export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const t = useT();
  const target = lang === "en" ? "es" : "en";
  return (
    <button type="button" lang={target} title={t(HEADER.switchLanguageHint)} onClick={() => setLang(target)} className={control}>
      {t(HEADER.switchLanguage)}
    </button>
  );
}
