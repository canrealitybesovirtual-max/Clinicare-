"use client";
/**
 * "Continue" card on the home page (clinician mode only) when the memory-only session already holds work.
 * Shows counts and curated labels only (number of symptoms, a measure's short name, the plan step): never typed
 * text, condition names or codes. Links use client-side navigation, so the session survives.
 */
import Link from "next/link";
import { ArrowRight, ClipboardList, ListTodo, TextSearch } from "lucide-react";
import { useSession } from "@/state/session";
import { PLAN_STEPS } from "@/components/plan/plan-model";

export interface ContinueMeasure {
  id: string;
  shortName: string;
}

export function ContinueCard({ measures }: { measures: readonly ContinueMeasure[] }) {
  const { state } = useSession();
  const symptoms = state.selectedSymptomIds.length;
  const hasText = state.symptomText.trim().length > 0;
  const inProgress = measures.filter((m) => {
    const a = state.measureAnswers[m.id];
    return Boolean(a?.some((v) => v !== null)) || (state.measureFunctional[m.id] ?? null) !== null;
  });
  const plan = state.plan;
  const stepIndex = plan ? PLAN_STEPS.findIndex((s) => s.id === plan.step) : -1;

  const rows: { href: string; label: string; icon: typeof TextSearch }[] = [];
  if (symptoms > 0 || hasText) {
    rows.push({
      href: "/symptoms",
      icon: TextSearch,
      label:
        symptoms > 0
          ? `${symptoms} symptom${symptoms === 1 ? "" : "s"} selected${hasText ? " · notes typed" : ""}`
          : "Symptom notes typed",
    });
  }
  for (const m of inProgress) rows.push({ href: `/measures/${m.id}`, icon: ClipboardList, label: `${m.shortName} in progress` });
  if (plan && stepIndex >= 0) {
    rows.push({ href: "/plan", icon: ListTodo, label: `Treatment plan · step ${stepIndex + 1} of ${PLAN_STEPS.length}` });
  }
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="continue-heading" className="rounded-2xl border border-accent/40 bg-accent-soft p-4 sm:p-5">
      <h2 id="continue-heading" className="text-lg font-semibold">
        Continue this session
      </h2>
      <p className="mt-0.5 text-sm text-muted">Still in this tab&apos;s memory only. Clear session in the banner removes it.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {rows.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text hover:border-accent"
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
