"use client";
/**
 * Handout language on the clinician handout page: one choice (English / Español) drives the preview, the PDF and
 * the share link together, so what the clinician sees is what the client gets. It starts in the shell language
 * when the handout has that translation, and stays in this page's memory only (G5). The handout is passed once,
 * to the scope, and read from context by the pieces the server page places around it.
 */
import * as React from "react";
import type { Handout } from "@/lib/schemas";
import { useLang, type Lang } from "@/lib/i18n/core";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { HandoutBody } from "./handout-body";
import { LangSwitch } from "./lang-switch";
import { ShareHandout } from "./share-handout";
import { handoutLangs, localizeHandout } from "./localize";

interface Scope {
  handout: Handout;
  lang: Lang;
  setLang: (lang: Lang) => void;
  langs: Lang[];
  sharePaths: Partial<Record<Lang, string>>;
}

const Ctx = React.createContext<Scope | null>(null);

function useScope(): Scope {
  const scope = React.useContext(Ctx);
  if (!scope) throw new Error("Handout language pieces must be inside <HandoutLangScope>");
  return scope;
}

export function HandoutLangScope({
  handout,
  sharePaths,
  children,
}: {
  handout: Handout;
  /** Validated on the server (src/lib/share.ts): "/r/<id>", and "/r/<id>/es" when there is a Spanish version. */
  sharePaths: Partial<Record<Lang, string>>;
  children: React.ReactNode;
}) {
  const { lang: shellLang } = useLang();
  const langs = React.useMemo(() => handoutLangs(handout), [handout]);
  const [lang, setLang] = React.useState<Lang>(langs.includes(shellLang) ? shellLang : "en");
  const value = React.useMemo(() => ({ handout, lang, setLang, langs, sharePaths }), [handout, lang, langs, sharePaths]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The English / Español switch, or a plain note when the handout has no translation yet. */
export function HandoutLangControl() {
  const { handout, lang, setLang, langs } = useScope();
  if (langs.length < 2) return <p className="text-sm text-muted">English only. No Spanish version yet.</p>;
  return <LangSwitch name={`handout-lang-${handout.id}`} value={lang} onChange={setLang} />;
}

export function HandoutPreview() {
  const { handout, lang } = useScope();
  return <HandoutBody handout={handout} lang={lang} headingLevel="h3" />;
}

export function HandoutPdfButton() {
  const { handout, lang } = useScope();
  return <DownloadPdfButton handout={handout} lang={lang} label={lang === "es" ? "Download PDF (Español)" : "Download PDF"} variant="primary" />;
}

export function HandoutShare() {
  const { handout, lang, sharePaths } = useScope();
  const path = sharePaths[lang] ?? sharePaths.en;
  if (!path) return null;
  return <ShareHandout path={path} title={localizeHandout(handout, lang).title} spanish={lang === "es"} />;
}

/** Translation status for the Spanish version (shown only while Spanish is selected). */
export function HandoutTranslationNote() {
  const { handout, lang } = useScope();
  const by = lang === "es" ? handout.es?.translatedBy : undefined;
  if (!by) return null;
  return (
    <p className="text-xs text-muted">
      Spanish translation: {by}. Check it with a fluent colleague before you rely on it.
    </p>
  );
}
