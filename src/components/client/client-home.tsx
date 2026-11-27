"use client";
/**
 * Client mode home (G3), in English or Spanish: plain language (grades 6-8), crisis help at the top, then one main
 * step: pick a topic. Topics are grouped under a few plain headings (collapsed, so the screen stays calm), with the
 * safety topics always shown first. A featured skill and the ways to get help follow. No diagnosis names, codes or
 * scores, and no links into clinician screens (the header's "Clinician view" asks first).
 */
import Link from "next/link";
import { ArrowRight, Globe, LifeBuoy, MessagesSquare, Phone, Siren, Sparkles, Stethoscope } from "lucide-react";
import type { Handout } from "@/lib/schemas";
import { pick, useLang, useT, type Lang, type Text } from "@/lib/i18n/core";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { HANDOUT_TEXT, clipText, localizeHandout, withN } from "@/components/handouts/localize";
import { cn } from "@/lib/utils";
import { CrisisStrip } from "./crisis-blocks";
import { TalkToSomeone } from "./talk-to-someone";
import type { ClientTopic, ClientTopicGroup } from "./topics";

const TEXT = {
  eyebrow: { en: "Self-help", es: "Autoayuda" },
  title: { en: "Help and skills you can use today", es: "Ayuda y ejercicios que puede usar hoy" },
  lead: {
    en: "Pick what you need. You do not need to type anything on these pages.",
    es: "Elija lo que necesita. En estas páginas no necesita escribir nada.",
  },
  topicsTitle: { en: "What would you like help with?", es: "¿Con qué le gustaría recibir ayuda?" },
  topicsLead: {
    en: "Pick a topic to find skills to try and trusted pages to read.",
    es: "Elija un tema para encontrar ejercicios para probar y páginas confiables para leer.",
  },
  safety: { en: "Staying safe", es: "Mantenerse a salvo" },
  topicCount: { en: "{n} topics", es: "{n} temas" },
  skillEyebrow: { en: "A skill to try now", es: "Un ejercicio para probar ahora" },
  openSkill: { en: "Open the skill", es: "Abrir el ejercicio" },
  print: { en: "Download to print", es: "Descargar para imprimir" },
  allSkills: { en: "See all skills", es: "Ver todos los ejercicios" },
  whereHelp: { en: "Where to get help", es: "Dónde buscar ayuda" },
  usTitle: { en: "In the US: call or text 988", es: "En EE. UU.: llame o envíe un mensaje de texto al 988" },
  usBody: {
    en: "The 988 Suicide & Crisis Lifeline is free and open all day, every day. You can call or text about any kind of stress, not only suicide.",
    es: "La Línea 988 de Prevención del Suicidio y Crisis es gratuita y está abierta todo el día, todos los días. Puede llamar o enviar un mensaje de texto por cualquier tipo de estrés, no solo por el suicidio. Pida atención en español.",
  },
  dangerTitle: {
    en: "In danger right now: call your local emergency number",
    es: "Si está en peligro ahora mismo: llame al número de emergencias local",
  },
  dangerBody: {
    en: "In the US and Canada this is 911. For other countries, use the Get help now button.",
    es: "En EE. UU. y Canadá es el 911. Para otros países, use el botón Ayuda ahora.",
  },
  otherTitle: { en: "In another country", es: "En otro país" },
  otherBody: { en: "Find a free helpline near you:", es: "Busque una línea de ayuda gratuita cerca de usted:" },
  ongoingTitle: { en: "For ongoing support", es: "Para apoyo continuo" },
  ongoingBody: {
    en: "Ask your doctor, clinic or school counselor about talking with a licensed counselor or therapist. You can bring this page with you.",
    es: "Pregúntele a su médico, a su clínica o al consejero de su escuela cómo hablar con un consejero o terapeuta con licencia. Puede llevar esta página con usted.",
  },
  trustTitle: { en: "Talk to someone you trust", es: "Hable con alguien de confianza" },
  trustBody: {
    en: "A friend, family member or faith leader can help you take the next step.",
    es: "Un amigo, un familiar o un líder de su comunidad de fe puede ayudarle a dar el siguiente paso.",
  },
  helplines: { en: "More free helplines, by country", es: "Más líneas de ayuda gratuitas, por país" },
  alone: { en: "You do not have to do this alone", es: "No tiene que hacer esto sin ayuda" },
} satisfies Record<string, Text>;

const row =
  "group flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-base font-semibold transition-colors hover:border-accent hover:bg-accent-soft";

function TopicLink({ topic, crisis = false }: { topic: ClientTopic; crisis?: boolean }) {
  const t = useT();
  return (
    <Link href={`/client/topics/${topic.id}`} className={cn(row, crisis && "border-l-[6px] border-l-crisis")}>
      {crisis ? <LifeBuoy aria-hidden className="size-5 shrink-0 text-crisis" /> : null}
      <span className="min-w-0 flex-1">{t(topic.label)}</span>
      <ArrowRight aria-hidden className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** One skill to try right away: title, time and a short intro, then open it or print it. */
function FeaturedSkill({ handout, lang }: { handout: Handout; lang: Lang }) {
  const skill = localizeHandout(handout, lang);
  const t = (text: Text) => pick(text, skill.lang);
  return (
    <section aria-labelledby="featured-skill">
      <Card className="space-y-4 sm:p-6">
        <div className="flex gap-3">
          <Sparkles aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-semibold text-muted">{t(TEXT.skillEyebrow)}</p>
            <h2 id="featured-skill" className="text-xl font-bold leading-tight">
              {skill.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{withN(t(HANDOUT_TEXT.minutes), handout.estimatedMinutes)}</p>
          </div>
        </div>
        <p className="leading-relaxed">{clipText(skill.intro, 220)}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          <Link href={`/client/skills/${handout.id}`} className={buttonVariants({ variant: "primary", size: "lg" })}>
            {t(TEXT.openSkill)}
            <ArrowRight aria-hidden />
          </Link>
          <DownloadPdfButton handout={handout} lang={skill.lang} label={t(TEXT.print)} size="lg" />
          <Link href="/client/skills" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "sm:ml-auto")}>
            {t(TEXT.allSkills)}
          </Link>
        </div>
      </Card>
    </section>
  );
}

export function ClientHome({
  crisis,
  groups,
  featured,
}: {
  /** Safety topics, always shown first (groupClientTopics, run on the server so topic keywords stay off the client). */
  crisis: readonly ClientTopic[];
  groups: readonly ClientTopicGroup[];
  featured?: Handout;
}) {
  const t = useT();
  const { lang } = useLang();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">{t(TEXT.eyebrow)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t(TEXT.title)}</h1>
          <p className="mt-2 text-lg leading-relaxed text-muted">{t(TEXT.lead)}</p>
        </div>
        <CrisisStrip />
      </div>

      <section aria-labelledby="topics-heading" className="space-y-4">
        <div>
          <h2 id="topics-heading" className="text-xl font-bold">
            {t(TEXT.topicsTitle)}
          </h2>
          <p className="mt-1 text-muted">{t(TEXT.topicsLead)}</p>
        </div>

        {crisis.length ? (
          <div>
            <h3 id="topics-safety" className="text-base font-semibold">
              {t(TEXT.safety)}
            </h3>
            <ul aria-labelledby="topics-safety" className="mt-2 grid gap-2 sm:grid-cols-2">
              {crisis.map((topic) => (
                <li key={topic.id}>
                  <TopicLink topic={topic} crisis />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Card className="px-4 py-1 sm:px-5 sm:py-1">
          {groups.map((g, i) => (
            <Disclosure
              key={g.id}
              bordered={i > 0}
              title={<span className="text-base">{t(g.label)}</span>}
              meta={withN(t(TEXT.topicCount), g.topics.length)}
            >
              <ul className="grid gap-2 sm:grid-cols-2">
                {g.topics.map((topic) => (
                  <li key={topic.id}>
                    <TopicLink topic={topic} />
                  </li>
                ))}
              </ul>
            </Disclosure>
          ))}
        </Card>
      </section>

      {featured ? <FeaturedSkill handout={featured} lang={lang} /> : null}

      <section aria-labelledby="where-help">
        <Card className="space-y-4 sm:p-6">
          <h2 id="where-help" className="text-xl font-bold">
            {t(TEXT.whereHelp)}
          </h2>
          <ul className="space-y-4">
            <li className="flex gap-3">
              <Phone aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">{t(TEXT.usTitle)}</p>
                <p className="text-muted">
                  {t(TEXT.usBody)} <ExternalLink href="https://988lifeline.org">988lifeline.org</ExternalLink>
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Siren aria-hidden className="mt-1 size-5 shrink-0 text-crisis" />
              <div>
                <p className="font-semibold">{t(TEXT.dangerTitle)}</p>
                <p className="text-muted">{t(TEXT.dangerBody)}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Globe aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">{t(TEXT.otherTitle)}</p>
                <p className="text-muted">
                  {t(TEXT.otherBody)} <ExternalLink href="https://findahelpline.com">findahelpline.com</ExternalLink>
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Stethoscope aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">{t(TEXT.ongoingTitle)}</p>
                <p className="text-muted">{t(TEXT.ongoingBody)}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <MessagesSquare aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">{t(TEXT.trustTitle)}</p>
                <p className="text-muted">{t(TEXT.trustBody)}</p>
              </div>
            </li>
          </ul>
          <Link href="/client/help" className={buttonVariants({ variant: "outline" })}>
            {t(TEXT.helplines)}
            <ArrowRight aria-hidden />
          </Link>
        </Card>
      </section>

      <TalkToSomeone id="client-talk" title={TEXT.alone} />
    </div>
  );
}
