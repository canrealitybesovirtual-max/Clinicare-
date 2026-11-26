"use client";
import Link from "next/link";
import { ArrowLeft, ListChecks, SearchX } from "lucide-react";
import { conditions, getCondition } from "@/lib/content";
import { useSession } from "@/state/session";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { useSymptomAnalysis } from "@/components/symptoms/analysis";
import { RedFlagBanner } from "@/components/symptoms/red-flag-banner";
import { Under18Notice } from "@/components/symptoms/under18-notice";
import { durationLabel, triLabel } from "@/components/symptoms/symptom-meta";
import { SuggestionCard } from "./suggestion-card";

function codeSummary(codes: { code: string }[], max = 3): string {
  const shown = codes.slice(0, max).map((x) => x.code).join(", ");
  return codes.length > max ? `${shown} +${codes.length - max} more` : shown;
}

function KnowledgeBase() {
  return (
    <section aria-labelledby="kb-heading" className="mt-6">
      <h2 id="kb-heading" className="text-base font-semibold">
        Phase 1 knowledge base ({conditions.length} adult conditions)
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {conditions.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="font-semibold">{c.name}</p>
            <p className="mt-0.5 text-muted">
              ICD-10-CM {codeSummary(c.icd10cm)} · ICD-11 {codeSummary(c.icd11)}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        Presentations outside this set (for example social anxiety, OCD, bipolar or psychotic disorders) will not be
        suggested. Absence from this list says nothing about the client.
      </p>
    </section>
  );
}

export function DiagnosesView() {
  const { state } = useSession();
  const analysis = useSymptomAnalysis();
  const { result } = analysis;
  const context = {
    duration: state.duration,
    impairment: state.impairment,
    substancePossible: state.substancePossible,
    medicalPossible: state.medicalPossible,
  };

  return (
    <>
      <RedFlagBanner flags={analysis.redFlags} />

      <Card className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-semibold">
            Based on {analysis.ids.length} symptom{analysis.ids.length === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-muted">
            Duration {durationLabel(state.duration)} · impairment {triLabel(state.impairment)} · substance could explain:{" "}
            {triLabel(state.substancePossible)} · medical could explain: {triLabel(state.medicalPossible)}
          </p>
        </div>
        <Link href="/symptoms" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowLeft aria-hidden />
          Edit symptoms and context
        </Link>
      </Card>

      <div aria-live="polite" className="sr-only">
        {state.under18
          ? "Adult content only. Suggestions are not shown."
          : result.status === "ok"
            ? `${result.suggestions.length} possible consideration${result.suggestions.length === 1 ? "" : "s"} for clinician review.`
            : (result.message ?? "")}
      </div>

      {state.under18 ? (
        <Under18Notice />
      ) : result.status === "empty" ? (
        <>
          <Notice tone="neutral" icon={ListChecks} title="No symptoms entered yet">
            <p>{result.message}</p>
            <Link href="/symptoms" className={buttonVariants({ variant: "primary", className: "mt-2" })}>
              Go to Symptom Finder
            </Link>
          </Notice>
          <KnowledgeBase />
        </>
      ) : result.status === "insufficient" ? (
        <>
          <Notice tone="info" icon={SearchX} title="Not enough information">
            <p>{result.message}</p>
            <Link href="/symptoms" className={buttonVariants({ variant: "outline", className: "mt-2" })}>
              Add symptoms or context
            </Link>
          </Notice>
          <KnowledgeBase />
        </>
      ) : (
        <ol className="space-y-6" aria-label="Possible considerations, ranked">
          {result.suggestions.map((s, i) => {
            const cond = getCondition(s.conditionId);
            if (!cond) return null;
            return (
              <li key={s.conditionId}>
                <SuggestionCard s={s} cond={cond} input={context} rank={i + 1} />
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-8 max-w-3xl text-sm text-muted">
        Suggestions come from a transparent, rule-based score over app-authored feature lists. They are prompts for your
        own assessment, never a diagnosis. Confirm against the DSM-5-TR or ICD criteria, a full clinical interview and
        medical input where relevant.
      </p>
    </>
  );
}
