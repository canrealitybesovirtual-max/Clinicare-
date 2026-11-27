"use client";
/**
 * "Continue" card on the home page (clinician mode only) when the memory-only session already holds work.
 * Shows counts and curated labels only (number of symptoms, a measure's short name, the plan step): never typed
 * text, condition names or codes. Links use client-side navigation, so the session survives.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, ListTodo, TextSearch, type LucideIcon } from "lucide-react";
import { useSession } from "@/state/session";
import { fill, useT, type Text } from "@/lib/i18n/core";
import { PLAN_STEPS } from "@/components/plan/plan-model";

export interface ContinueMeasure {
  id: string;
  shortName: string;
}

const T = {
  heading: { en: "Continue this session", es: "Continuar esta sesión" },
  note: {
    en: "Still in this tab's memory only. Clear session in the banner removes it.",
    es: "Solo está en la memoria de esta pestaña. Borrar sesión, en el aviso de arriba, lo elimina.",
  },
  oneSymptom: { en: "1 symptom selected", es: "1 síntoma seleccionado" },
  symptoms: { en: "{n} symptoms selected", es: "{n} síntomas seleccionados" },
  notesTyped: { en: " · notes typed", es: " · notas escritas" },
  notesOnly: { en: "Symptom notes typed", es: "Notas de síntomas escritas" },
  measure: { en: "{name} in progress", es: "{name} en curso" },
  plan: { en: "Treatment plan · step {step} of {total}", es: "Plan de tratamiento · paso {step} de {total}" },
} satisfies Record<string, Text>;

export function ContinueCard({ measures }: { measures: readonly ContinueMeasure[] }) {
  const { state } = useSession();
  const t = useT();
  const symptoms = state.selectedSymptomIds.length;
  const hasText = state.symptomText.trim().length > 0;
  const inProgress = measures.filter((m) => {
    const a = state.measureAnswers[m.id];
    return Boolean(a?.some((v) => v !== null)) || (state.measureFunctional[m.id] ?? null) !== null;
  });
  const plan = state.plan;
  const stepIndex = plan ? PLAN_STEPS.findIndex((s) => s.id === plan.step) : -1;

  const rows: { href: string; label: ReactNode; icon: LucideIcon }[] = [];
  if (symptoms > 0 || hasText) {
    rows.push({
      href: "/symptoms",
      icon: TextSearch,
      label:
        symptoms > 0 ? (
          <>
            {symptoms === 1 ? t(T.oneSymptom) : fill(t(T.symptoms), { n: symptoms })}
            {hasText ? t(T.notesTyped) : null}
          </>
        ) : (
          t(T.notesOnly)
        ),
    });
  }
  for (const m of inProgress) {
    rows.push({ href: `/measures/${m.id}`, icon: ClipboardList, label: fill(t(T.measure), { name: m.shortName }) });
  }
  if (plan && stepIndex >= 0) {
    rows.push({
      href: "/plan",
      icon: ListTodo,
      label: fill(t(T.plan), { step: stepIndex + 1, total: PLAN_STEPS.length }),
    });
  }
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="continue-heading" className="rounded-2xl border border-accent/40 bg-accent-soft p-5 sm:p-6">
      <h2 id="continue-heading" className="text-lg font-semibold">
        {t(T.heading)}
      </h2>
      <p className="mt-0.5 text-sm text-muted">{t(T.note)}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {rows.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text hover:border-accent"
            >
              <r.icon aria-hidden className="size-4 shrink-0 text-accent" />
              {r.label}
              <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
