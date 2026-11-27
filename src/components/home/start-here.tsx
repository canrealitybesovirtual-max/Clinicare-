"use client";
/**
 * Home: the guided "Start here" flow (spec section 3) with one plain-language line per step, then the other
 * clinician references, in-session tools and client mode. Counts and measure names come from the content
 * library through props, so the wording never claims more than the app holds. Original wording.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  HeartHandshake,
  ListChecks,
  ListTodo,
  MapPin,
  Pill,
  Scale,
  TextSearch,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { fill, useT, type Text } from "@/lib/i18n/core";
import { NAV } from "@/lib/i18n/shell";

export interface StartHereCounts {
  /** Short names of the built-in (license-confirmed) measures, e.g. ["GAD-7", "PHQ-9"]. */
  measures: readonly string[];
  ethicsCodes: number;
  legalTopics: number;
  medications: number;
}

interface Step {
  icon: LucideIcon;
  title: string;
  line: ReactNode;
  href: string;
  /** A second destination shown as its own link (Interventions -> Handouts). */
  also?: { href: string; label: string; icon: LucideIcon };
}

const T = {
  heading: { en: "Start here", es: "Empiece aquí" },
  intro: {
    en: "Six steps, in order or on their own. Every suggestion stays yours to review.",
    es: "Seis pasos, en orden o por separado. Usted revisa cada sugerencia.",
  },
  moreHeading: { en: "Also here", es: "También aquí" },
  symptomsLine: {
    en: "Type what the client describes, or tap symptoms; identifiers are removed on this device.",
    es: "Escriba lo que describe el cliente o toque síntomas; los identificadores se quitan en este dispositivo.",
  },
  patternsTitle: { en: "Possible patterns", es: "Patrones posibles" },
  patternsLine: {
    en: "See which conditions share those features, with what matches and what is missing, for your review.",
    es: "Vea qué condiciones comparten esas características, con lo que coincide y lo que falta, para su revisión.",
  },
  measuresLine: {
    en: "Run the {names} with the client and see the total as you go.",
    es: "Aplique {names} con el cliente y vea el total a medida que avanza.",
  },
  measuresLineNone: {
    en: "Find brief measures and where to get them; built-in forms appear once a license is confirmed.",
    es: "Encuentre escalas breves y dónde obtenerlas; los formularios integrados aparecen cuando se confirma la licencia.",
  },
  or: { en: " or ", es: " o " },
  planLine: {
    en: "Write problems, goals and objectives in your own words; exports leave out identifiers.",
    es: "Escriba problemas, metas y objetivos con sus propias palabras; lo que exporta no incluye identificadores.",
  },
  interventionsTitle: { en: "Interventions and handouts", es: "Intervenciones y materiales" },
  interventionsLine: {
    en: "Choose an in-session skill, then print a matching handout or share a link.",
    es: "Elija una técnica para la sesión y luego imprima un material relacionado o comparta un enlace.",
  },
  referralsLine: {
    en: "Find psychiatry, substance-use, low-cost and crisis services near a ZIP code or city.",
    es: "Encuentre servicios de psiquiatría, uso de sustancias, bajo costo y crisis cerca de un código postal o ciudad.",
  },
  ethicsLine: {
    en: "{codes} professional codes and {topics} legal topics, including HIPAA and 42 CFR Part 2. Not legal advice.",
    es: "{codes} códigos profesionales y {topics} temas legales, incluidos HIPAA y 42 CFR Part 2. No es asesoría legal.",
  },
  medicationsLine: {
    en: "{count} medications with current FDA label warnings, for referral conversations, not prescribing.",
    es: "{count} medicamentos con las advertencias actuales de la etiqueta de la FDA, para hablar de derivaciones, no para recetar.",
  },
  toolsLine: { en: "Quick helpers to use during a session.", es: "Ayudas rápidas para usar durante la sesión." },
  clientLine: {
    en: "Hand the screen to the client: plain-language topics, calming skills and where to get help, with no diagnosis names or scores.",
    es: "Entregue la pantalla al cliente: temas en lenguaje sencillo, ejercicios para calmarse y dónde buscar ayuda, sin nombres de diagnósticos ni puntuaciones.",
  },
} satisfies Record<string, Text>;

export function StartHere({ counts }: { counts: StartHereCounts }) {
  const t = useT();
  const names = counts.measures.join(t(T.or));
  const steps: readonly Step[] = [
    { icon: TextSearch, title: t(NAV.symptoms), line: t(T.symptomsLine), href: "/symptoms" },
    { icon: ListChecks, title: t(T.patternsTitle), line: t(T.patternsLine), href: "/diagnoses" },
    {
      icon: ClipboardList,
      title: t(NAV.measures),
      line: names ? fill(t(T.measuresLine), { names }) : t(T.measuresLineNone),
      href: "/measures",
    },
    { icon: ListTodo, title: t(NAV.plan), line: t(T.planLine), href: "/plan" },
    {
      icon: HeartHandshake,
      title: t(T.interventionsTitle),
      line: t(T.interventionsLine),
      href: "/interventions",
      also: { href: "/handouts", label: t(NAV.handouts), icon: FileText },
    },
    { icon: MapPin, title: t(NAV.referrals), line: t(T.referralsLine), href: "/referrals" },
  ];
  const more: readonly Step[] = [
    { icon: Wrench, title: t(NAV.tools), line: t(T.toolsLine), href: "/tools" },
    { icon: Users, title: t(NAV.clientMode), line: t(T.clientLine), href: "/client" },
    {
      icon: Scale,
      title: t(NAV.ethics),
      line: fill(t(T.ethicsLine), { codes: counts.ethicsCodes, topics: counts.legalTopics }),
      href: "/ethics",
    },
    { icon: Pill, title: t(NAV.medications), line: fill(t(T.medicationsLine), { count: counts.medications }), href: "/medications" },
  ];

  return (
    <>
      <section aria-labelledby="start-heading">
        <h2 id="start-heading" className="text-2xl font-bold tracking-tight">
          {t(T.heading)}
        </h2>
        <p className="mt-1 max-w-reading text-muted">{t(T.intro)}</p>
        {/* An ordered list, so screen readers announce each step's position; the visible number is decorative. */}
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.href} className="min-w-0">
              <StepCard step={s} number={i + 1} />
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="more-heading">
        <h2 id="more-heading" className="text-xl font-semibold">
          {t(T.moreHeading)}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {more.map((s) => (
            <li key={s.href} className="min-w-0">
              <StepCard step={s} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/**
 * One step card. The title link covers the whole card (a large, calm target); a second link, when present, sits
 * above that cover so it stays separately clickable and focusable.
 */
function StepCard({ step, number }: { step: Step; number?: number }) {
  return (
    <div className="group relative flex h-full gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-bold text-accent"
      >
        {number ?? <step.icon className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-snug">
          <Link
            href={step.href}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {step.title}
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        </h3>
        <p className="text-sm text-muted">{step.line}</p>
        {step.also ? (
          <Link
            href={step.also.href}
            className="relative z-10 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold text-text hover:border-accent"
          >
            <step.also.icon aria-hidden className="size-4 shrink-0 text-accent" />
            {step.also.label}
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
