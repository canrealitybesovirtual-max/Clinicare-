"use client";
/**
 * "Where to get help" for client mode (G3, G9), in English or Spanish: crisis help first, then free helplines by
 * country. Service names, descriptions and hours come from the curated directories in English, so they keep
 * lang="en" on a Spanish page. Nothing is typed or sent.
 */
import Link from "next/link";
import { ArrowLeft, Clock, Globe } from "lucide-react";
import { useT, type Text } from "@/lib/i18n/core";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { HelplineActions } from "@/components/referrals/helpline-actions";
import { HelpNowCard } from "./crisis-blocks";
import type { HelpEntry, HelpRegion } from "./help-directory";
import { TalkToSomeone } from "./talk-to-someone";

const TEXT = {
  back: { en: "Self-help home", es: "Inicio de autoayuda" },
  eyebrow: { en: "Self-help", es: "Autoayuda" },
  title: { en: "Where to get help", es: "Dónde buscar ayuda" },
  lead: {
    en: "Free phone, text and chat lines. You can call for yourself or for someone you are worried about.",
    es: "Líneas gratuitas por teléfono, mensaje de texto y chat. Puede llamar por usted o por alguien que le preocupa.",
  },
  forWho: { en: "For:", es: "Para:" },
  website: { en: "Website", es: "Sitio web" },
  websiteOf: { en: " of {name}", es: " de {name}" },
  unverified: {
    en: "Numbers can change. Check the website if a call does not connect.",
    es: "Los números pueden cambiar. Revise el sitio web si la llamada no entra.",
  },
  otherCountry: { en: "In another country", es: "En otro país" },
  findLine: { en: "Find a free helpline near you:", es: "Busque una línea de ayuda gratuita cerca de usted:" },
  ongoingTitle: {
    en: "For ongoing support, talk with a licensed professional",
    es: "Para apoyo continuo, hable con un profesional con licencia",
  },
  ongoingBody: {
    en: "A counselor, therapist, doctor or nurse can help you find care that fits you. You can ask your doctor or a local clinic where to start, and bring this page with you.",
    es: "Un consejero, terapeuta, médico o enfermero puede ayudarle a encontrar la atención que le sirva. Puede preguntarle a su médico o a una clínica cercana por dónde empezar, y llevar esta página con usted.",
  },
} satisfies Record<string, Text>;

function Entry({ e }: { e: HelpEntry }) {
  const t = useT();
  return (
    <li className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h3 className="font-semibold" lang="en">
        {e.name}
      </h3>
      {e.description ? (
        <p className="mt-1 text-sm leading-relaxed text-muted" lang="en">
          {e.description}
        </p>
      ) : null}
      {e.audience ? (
        <p className="mt-1 text-sm text-muted">
          {t(TEXT.forWho)} <span lang="en">{e.audience}</span>
        </p>
      ) : null}
      {/* Button labels come from the shared referral component (English for now). */}
      <div lang="en">
        <HelplineActions name={e.name} phone={e.phone} text={e.text} chat={e.chat} crisis={e.crisis} className="mt-3" />
      </div>
      <p className="mt-2 text-sm">
        <ExternalLink href={e.url} className="inline-flex min-h-11 items-center">
          {t(TEXT.website)}
          <span className="sr-only">{t(TEXT.websiteOf).replace("{name}", e.name)}</span>
        </ExternalLink>
      </p>
      {e.phoneNote ? (
        <p className="text-sm text-muted" lang="en">
          {e.phoneNote}
        </p>
      ) : null}
      {e.hours ? (
        <p className="mt-1 flex items-center gap-1 text-sm text-muted">
          <Clock aria-hidden className="size-3.5" /> <span lang="en">{e.hours}</span>
        </p>
      ) : null}
      {e.verified ? null : <p className="mt-1 text-sm text-muted">{t(TEXT.unverified)}</p>}
    </li>
  );
}

export function ClientHelpView({ regions }: { regions: readonly HelpRegion[] }) {
  const t = useT();
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

      <HelpNowCard id="help-now" />

      {regions.map((r) => (
        <section key={r.region} aria-labelledby={`region-${r.region}`}>
          <h2 id={`region-${r.region}`} className="text-xl font-bold">
            {t(r.label)}
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {r.entries.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="other-countries">
        <Card className="flex gap-3">
          <Globe aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
          <div>
            <h2 id="other-countries" className="font-semibold">
              {t(TEXT.otherCountry)}
            </h2>
            <p className="text-muted">
              {t(TEXT.findLine)} <ExternalLink href="https://findahelpline.com">findahelpline.com</ExternalLink>
            </p>
          </div>
        </Card>
      </section>

      <TalkToSomeone id="help-talk" title={TEXT.ongoingTitle} body={TEXT.ongoingBody} />
    </div>
  );
}
