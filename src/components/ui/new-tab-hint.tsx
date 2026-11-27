"use client";
import { pick, useLang } from "@/lib/i18n/core";
import { DIALOG } from "@/lib/i18n/shell";

/** Screen-reader note for links that open a new tab, in the shell language and marked with it (WCAG 3.1.2). */
export function NewTabHint() {
  const { lang } = useLang();
  return (
    <span className="sr-only" lang={lang}>
      {pick(DIALOG.newTab, lang)}
    </span>
  );
}
