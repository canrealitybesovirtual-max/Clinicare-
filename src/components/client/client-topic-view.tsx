"use client";
/**
 * Client mode topic page (G3), in English or Spanish: the plain topic label only (never the clinician search
 * keyword), app-authored skills first (they work offline and need no lookup), then MedlinePlus pages filtered for
 * client-safe wording, with crisis help first on crisis topics and a calm crisis line on every other topic.
 */
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Clock, LockKeyhole, Phone } from "lucide-react";
import { useLang, useT, type Text } from "@/lib/i18n/core";
import { SAMHSA_HELPLINE } from "@/lib/referral-links";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LangSwitch } from "@/components/handouts/lang-switch";
import { HANDOUT_TEXT, withN } from "@/components/handouts/localize";
import { CrisisStrip, HelpNowCard } from "./crisis-blocks";
import { TalkToSomeone } from "./talk-to-someone";
import { TopicResults } from "./topic-results";
import type { ClientTopic } from "./topics";

/** A related skill, reduced to what the list shows. */
export interface SkillLink {
  id: string;
  title: Text;
  minutes: number;
}

const TEXT = {
  back: { en: "All topics", es: "Todos los temas" },
  eyebrow: { en: "Topic", es: "Tema" },
  lead: {
    en: "Skills you can practice, and trusted health pages to read. You do not need to type anything here.",
    es: "Ejercicios que puede practicar y páginas de salud confiables para leer. Aquí no necesita escribir nada.",
  },
  skills: { en: "Skills to try", es: "Ejercicios para probar" },
  skillsLead: {
    en: "Short sheets in plain words. Open one to read it or print it.",
    es: "Hojas cortas con palabras sencillas. Abra una para leerla o imprimirla.",
  },
  read: { en: "Read more from MedlinePlus", es: "Lea más en MedlinePlus" },
  readLead: {
    en: "MedlinePlus is a free health library from the U.S. National Library of Medicine. Pages open on their site.",
    es: "MedlinePlus es una biblioteca de salud gratuita de la Biblioteca Nacional de Medicina de EE. UU. Las páginas se abren en su sitio.",
  },
  privacy: { en: "Your privacy", es: "Su privacidad" },
  privacyBody: {
    en: "Nothing you do on this page is saved. If you are worried about drinking or drug use, the SAMHSA National Helpline is free, private and open all day, every day.",
    es: "Nada de lo que hace en esta página se guarda. Si le preocupa la bebida o el uso de drogas, la Línea Nacional de Ayuda de SAMHSA es gratuita, privada y está abierta todo el día, todos los días, en inglés y en español.",
  },
  call: { en: "Call {n}", es: "Llamar al {n}" },
} satisfies Record<string, Text>;

export function ClientTopicView({ topic, skills }: { topic: ClientTopic; skills: readonly SkillLink[] }) {
  const { lang, setLang } = useLang();
  const t = useT();
  const samhsaTel = `tel:${SAMHSA_HELPLINE.number.replace(/\D/g, "")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link href="/client" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> {t(TEXT.back)}
      </Link>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">{t(TEXT.eyebrow)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t(topic.label)}</h1>
          {/* Hidden on phones, so the first skill is on the first screen. */}
          <p className="mt-3 hidden text-lg leading-relaxed text-muted sm:block">{t(TEXT.lead)}</p>
        </div>
        <LangSwitch name={`topic-lang-${topic.id}`} value={lang} onChange={setLang} />
      </div>

      {topic.crisis ? <HelpNowCard id="topic-crisis" /> : <CrisisStrip />}

      {skills.length ? (
        <section aria-labelledby="topic-skills" className="space-y-3">
          <div>
            <h2 id="topic-skills" className="text-xl font-bold">
              {t(TEXT.skills)}
            </h2>
            <p className="mt-1 hidden text-muted sm:block">{t(TEXT.skillsLead)}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {skills.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/client/skills/${s.id}`}
                  className="group flex h-full min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent hover:bg-accent-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{t(s.title)}</span>
                    <span className="mt-1 flex items-center gap-1 text-sm text-muted">
                      <Clock aria-hidden className="size-3.5" /> {withN(t(HANDOUT_TEXT.minutes), s.minutes)}
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Substance-use topics: privacy, the free helpline and the topic's own safety line, after the skills so the
          first skill is on the first phone screen. */}
      {topic.sud ? (
        <div className="flex gap-3 rounded-2xl border border-border bg-surface-2 p-4 leading-relaxed sm:p-5">
          <LockKeyhole aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
          <div className="space-y-2">
            <p className="font-semibold">{t(TEXT.privacy)}</p>
            <p>{t(TEXT.privacyBody)}</p>
            <a href={samhsaTel} className={buttonVariants({ variant: "primary" })}>
              <Phone aria-hidden />
              {t(TEXT.call).replace("{n}", SAMHSA_HELPLINE.number)}
              <span className="sr-only" lang="en">
                {" "}
                ({SAMHSA_HELPLINE.label})
              </span>
            </a>
            {topic.safetyNote ? <p>{t(topic.safetyNote)}</p> : null}
          </div>
        </div>
      ) : null}

      <section aria-labelledby="topic-read">
        <Card className="space-y-4 sm:p-6">
          <div>
            <h2 id="topic-read" className="flex items-center gap-2 text-xl font-bold">
              <BookOpen aria-hidden className="size-5 text-accent" />
              {t(TEXT.read)}
            </h2>
            <p className="mt-1 text-sm text-muted">{t(TEXT.readLead)}</p>
          </div>
          <TopicResults topic={topic} lang={lang} />
        </Card>
      </section>

      <TalkToSomeone id="topic-talk" />
    </div>
  );
}
