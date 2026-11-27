"use client";
/**
 * One handout for a client (G3), in English or Spanish: plain language, a visible "English / Español" switch,
 * crisis help on the same page, a printable PDF in the same language, and source credits that pass the client-safe
 * filter (no diagnosis names, codes or scores). Used by the public share pages /r/[id] and /r/[id]/es and by client
 * mode /client/skills/[id]. The language is memory-only (G5).
 */
import Link from "next/link";
import { ArrowLeft, Clock, Info } from "lucide-react";
import type { Handout } from "@/lib/schemas";
import { pick, type Lang, type Text } from "@/lib/i18n/core";
import { clientSafeLinkOuts, clientSafeSources } from "@/lib/client-safe";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { HandoutBody } from "@/components/handouts/handout-body";
import { LangSwitch } from "@/components/handouts/lang-switch";
import { HANDOUT_TEXT, handoutLangs, localizeHandout, withN } from "@/components/handouts/localize";
import { CrisisStrip, HelpNowCard } from "./crisis-blocks";
import { TalkToSomeone } from "./talk-to-someone";
import { useContentLang } from "./use-content-lang";

const TEXT = {
  eyebrow: { en: "Skill to practice", es: "Ejercicio para practicar" },
  readOrPrint: {
    en: "Read it here, or print it and write on it. This page works with screen readers; the printout is for paper.",
    es: "Léala aquí, o imprímala y escriba en ella. Esta página funciona con lectores de pantalla; la hoja impresa es para papel.",
  },
  print: { en: "Download to print", es: "Descargar para imprimir" },
  moreHelp: { en: "More help from trusted websites", es: "Más ayuda en sitios web de confianza" },
  basedOn: { en: "Based on information from", es: "Basado en información de" },
  notReviewed: {
    en: "This sheet was written for this app. A licensed professional has not reviewed it yet, so ask your counselor about it.",
    es: "Esta hoja se escribió para esta aplicación. Todavía no la ha revisado un profesional con licencia, así que pregúntele a su consejero sobre ella.",
  },
} satisfies Record<string, Text>;

export function ClientHandoutView({
  handout,
  back,
  initialLang,
}: {
  handout: Handout;
  /** Where "back" goes: client mode skills list, or the self-help home for shared links. */
  back: { href: string; label: Text };
  /** Open in this language (the Spanish share link). Otherwise the shell language is used. */
  initialLang?: Lang;
}) {
  const { lang, setLang } = useContentLang(initialLang);
  const h = localizeHandout(handout, lang);
  // Labels follow the handout's language, so a page never mixes two languages in its own text.
  const t = (text: Text) => pick(text, h.lang);
  const sources = clientSafeSources(handout.sources);
  const linkOuts = clientSafeLinkOuts(handout.linkOuts ?? []);
  const langs = handoutLangs(handout);

  return (
    <div lang={h.lang} className="mx-auto max-w-3xl space-y-6">
      <Link href={back.href} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> {t(back.label)}
      </Link>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">{t(TEXT.eyebrow)}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{h.title}</h1>
          {/* Time and the print button share one row, so the sheet itself starts on the first phone screen. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="flex items-center gap-1.5 text-muted">
              <Clock aria-hidden className="size-4" /> {withN(t(HANDOUT_TEXT.minutes), handout.estimatedMinutes)}
            </p>
            <DownloadPdfButton handout={handout} lang={h.lang} label={t(TEXT.print)} variant="primary" />
          </div>
        </div>
        {/* From tablet width up; on phones the header's language button switches the page and the sheet together. */}
        {langs.length > 1 ? (
          <div className="hidden sm:block">
            <LangSwitch name={`client-handout-lang-${handout.id}`} value={h.lang} onChange={setLang} />
          </div>
        ) : null}
      </div>

      {/* Short crisis line here; the full crisis panel is further down and "Get help now" stays on screen (G9). */}
      <CrisisStrip lang={h.lang} />

      <Card className="space-y-5 sm:p-7">
        <HandoutBody handout={handout} lang={h.lang} headingLevel="h2" />
        <div className="space-y-2 border-t border-border pt-4 text-sm text-muted">
          <p>{t(TEXT.readOrPrint)}</p>
          {sources.length ? (
            <p>
              {t(TEXT.basedOn)}{" "}
              {sources.map((s, i) => (
                <span key={`${s.title}|${s.url}`} lang="en">
                  {i > 0 ? ", " : ""}
                  <ExternalLink href={s.url}>{s.publisher}</ExternalLink>
                </span>
              ))}
              .
            </p>
          ) : null}
          {handout.reviewedBy === "PENDING" ? (
            <p className="flex items-start gap-1.5">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" /> {t(TEXT.notReviewed)}
            </p>
          ) : null}
          {h.translatedBy?.includes("PENDING") ? <p>{HANDOUT_TEXT.machineTranslated.es}</p> : null}
        </div>
      </Card>

      {linkOuts.length ? (
        <Card className="space-y-2">
          <h2 className="text-lg font-semibold">{t(TEXT.moreHelp)}</h2>
          <ul className="space-y-1.5 text-sm">
            {linkOuts.map((l) => (
              <li key={l.url} lang="en">
                <ExternalLink href={l.url} className="inline-flex min-h-11 items-center">
                  {l.title}
                </ExternalLink>
                <span className="text-muted"> · {l.publisher}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <TalkToSomeone id="handout-talk" />

      <HelpNowCard id="handout-help" />
    </div>
  );
}
