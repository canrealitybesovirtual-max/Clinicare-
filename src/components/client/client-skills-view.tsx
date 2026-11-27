"use client";
/** Client mode skills list (G3), in English or Spanish: plain titles, a short intro, time and whether it has a log. */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock, PenLine } from "lucide-react";
import { useLang, useT, type Text } from "@/lib/i18n/core";
import { HANDOUT_TEXT, withN } from "@/components/handouts/localize";
import { TalkToSomeone } from "./talk-to-someone";

export interface SkillCard {
  id: string;
  title: Text;
  /** Intro clipped for the card, in both languages. */
  intro: Text;
  minutes: number;
  hasLog: boolean;
}

const TEXT = {
  back: { en: "Self-help home", es: "Inicio de autoayuda" },
  eyebrow: { en: "Self-help", es: "Autoayuda" },
  title: { en: "Skills you can practice", es: "Ejercicios que puede practicar" },
  lead: {
    en: "Short, plain-language sheets. Read them here or print them. Each one takes a few minutes.",
    es: "Hojas cortas con palabras sencillas. Léalas aquí o imprímalas. Cada una toma unos minutos.",
  },
  hasLog: { en: "Has a log to fill in", es: "Tiene un registro para llenar" },
} satisfies Record<string, Text>;

export function ClientSkillsView({ skills }: { skills: readonly SkillCard[] }) {
  const t = useT();
  const { lang } = useLang();
  // Alphabetical in the language being read.
  const sorted = React.useMemo(() => [...skills].sort((a, b) => t(a.title).localeCompare(t(b.title), lang)), [skills, t, lang]);
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link href="/client" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> {t(TEXT.back)}
      </Link>
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">{t(TEXT.eyebrow)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t(TEXT.title)}</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">{t(TEXT.lead)}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {sorted.map((s) => (
          <li key={s.id}>
            <Link
              href={`/client/skills/${s.id}`}
              className="group flex h-full flex-col gap-1.5 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent hover:bg-accent-soft"
            >
              <span className="flex items-start justify-between gap-2 text-base font-semibold leading-snug">
                {t(s.title)}
                <ArrowRight aria-hidden className="mt-0.5 size-5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-sm leading-relaxed text-muted">{t(s.intro)}</span>
              <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock aria-hidden className="size-3.5" /> {withN(t(HANDOUT_TEXT.minutes), s.minutes)}
                </span>
                {s.hasLog ? (
                  <span className="inline-flex items-center gap-1">
                    <PenLine aria-hidden className="size-3.5" /> {t(TEXT.hasLog)}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <TalkToSomeone id="skills-talk" />
    </div>
  );
}
