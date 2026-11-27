"use client";
/**
 * Possible diagnoses (spec screen 2): the ranked considerations for the session's documented features, each with
 * codes, the "See DSM-5-TR" pointer and matched / missing features, for clinician review. When nothing scores yet
 * (for example a fear outside the lexicon, "panic from dogs"), the follow-up panel comes first so the screen still
 * gives the clinician somewhere useful to go.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, ListChecks, SearchX } from "lucide-react";
import { conditions, getCondition } from "@/lib/content";
import type { ResourceCatalog } from "@/lib/follow-up";
import { useSession } from "@/state/session";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { useSymptomAnalysis } from "@/components/symptoms/analysis";
import { RedFlagBanner, RiskMissNote } from "@/components/symptoms/red-flag-banner";
import { Under18Notice } from "@/components/symptoms/under18-notice";
import { durationLabel, triLabel } from "@/components/symptoms/symptom-meta";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { AssistantPanel, type AssistantStatus } from "@/components/ai/assistant-panel";
import { FollowUpPanel } from "@/components/ai/follow-up-panel";
import { codeSummary } from "@/components/ai/labels";
import { PART2_NOTICE } from "@/lib/referral-links";
import { SuggestionCard } from "./suggestion-card";
import { STRENGTH_LABEL } from "./explain";

function KnowledgeBase() {
  return (
    <section aria-labelledby="kb-heading" className="mt-8">
      <h2 id="kb-heading" className="text-base font-semibold">
        What the app can suggest ({conditions.length} adult conditions)
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {conditions.map((c) => (
          <li
            key={c.id}
            className="relative flex h-full items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm hover:border-accent"
          >
            <div className="min-w-0 flex-1">
              {/* Curated condition id only in the URL. */}
              <Link
                href={`/interventions?condition=${encodeURIComponent(c.id)}`}
                className="font-semibold text-text after:absolute after:inset-0 after:rounded-lg hover:text-accent"
              >
                {c.name}
                <span className="sr-only">: interventions</span>
              </Link>
              <p className="mt-0.5 text-muted">
                ICD-10-CM {codeSummary(c.icd10cm)} · ICD-11 {codeSummary(c.icd11)}
              </p>
            </div>
            <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        Presentations outside this set (for example bipolar, psychotic or eating disorders) are never suggested. Absence
        from this list says nothing about the client. For fears of particular things or situations, the follow-up questions
        still help you document what matters.
      </p>
    </section>
  );
}

export function DiagnosesView({ catalog, assistant }: { catalog: ResourceCatalog; assistant: AssistantStatus }) {
  const { state } = useSession();
  const analysis = useSymptomAnalysis();
  const { result } = analysis;
  const handoutInfo = React.useMemo(() => new Map(catalog.handouts.map((h) => [h.id, h] as const)), [catalog]);
  // G6: any substance-use consideration on screen => Part 2 banner + Ethics & Legal Hub prompt, once, at the top.
  const anySud =
    !state.under18 && result.status === "ok" && result.suggestions.some((s) => getCondition(s.conditionId)?.sud === true);
  const context = {
    duration: state.duration,
    impairment: state.impairment,
    substancePossible: state.substancePossible,
    medicalPossible: state.medicalPossible,
  };
  const followUp = (
    <FollowUpPanel analysis={analysis} catalog={catalog} className="mt-6">
      <AssistantPanel status={assistant} analysis={analysis} />
    </FollowUpPanel>
  );

  return (
    <>
      <RedFlagBanner flags={analysis.redFlags} />

      {anySud ? (
        <div className="mb-6 space-y-3">
          <Notice tone="warn" title="42 CFR Part 2: substance use">
            <p>
              A substance-use consideration is on screen. Nothing here is stored or sent, and every export carries the
              notice: {PART2_NOTICE}
            </p>
          </Notice>
          <HubPrompt context="sud" />
        </div>
      ) : null}

      <Card className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="text-sm">
          <p className="font-semibold">
            Based on {analysis.ids.length} symptom{analysis.ids.length === 1 ? "" : "s"}
            {analysis.fromAnswers.size ? ` (${analysis.fromAnswers.size} from your answers)` : ""}
          </p>
          <p className="mt-0.5 text-muted">
            Duration {durationLabel(state.duration)} · impairment {triLabel(state.impairment)} · substance{" "}
            {triLabel(state.substancePossible)} · medical {triLabel(state.medicalPossible)}
          </p>
        </div>
        <Link href="/symptoms" className={buttonVariants({ variant: "outline", size: "sm", className: "self-start sm:self-auto" })}>
          <ArrowLeft aria-hidden />
          Edit symptoms and context
        </Link>
      </Card>

      {/* Short status for screen readers; the card below gives the full explanation, so it is not repeated here. */}
      <div aria-live="polite" className="sr-only">
        {state.under18
          ? "Adult content only. Suggestions are not shown."
          : result.status === "ok"
            ? `${result.suggestions.length} possible consideration${result.suggestions.length === 1 ? "" : "s"} for clinician review.`
            : "No possible considerations yet."}
      </div>

      {state.under18 ? (
        <Under18Notice />
      ) : result.status === "empty" ? (
        <>
          <Notice
            tone="neutral"
            icon={ListChecks}
            title={state.symptomText.trim() ? "No recognized symptoms yet" : "No symptoms entered yet"}
          >
            <p>{result.message}</p>
            <Link href="/symptoms" className={buttonVariants({ variant: "primary", className: "mt-2" })}>
              Go to Symptom Finder
            </Link>
          </Notice>
          {followUp}
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
          {followUp}
          <KnowledgeBase />
        </>
      ) : (
        <>
          {result.suggestions.length >= 2 ? (
            <nav aria-label="Considerations" className="mb-6 rounded-xl border border-border bg-surface p-3 sm:p-4">
              <p className="text-sm font-semibold">Jump to a consideration</p>
              <ol className="mt-2 grid gap-1 sm:grid-cols-2">
                {result.suggestions.map((s, i) => (
                  <li key={s.conditionId}>
                    <a
                      href={`#cond-${s.conditionId}`}
                      className="flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg px-2 text-sm hover:bg-surface-2"
                    >
                      <span className="font-semibold text-accent underline underline-offset-2">
                        {i + 1}. {s.name}
                      </span>
                      <span className="text-muted">· {STRENGTH_LABEL[s.strength]}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <ol className="space-y-6" aria-label="Possible considerations, ranked">
            {result.suggestions.map((s, i) => {
              const cond = getCondition(s.conditionId);
              if (!cond) return null;
              return (
                <li key={s.conditionId}>
                  <SuggestionCard s={s} cond={cond} input={context} rank={i + 1} handoutInfo={handoutInfo} />
                </li>
              );
            })}
          </ol>
          {followUp}
        </>
      )}

      <RiskMissNote className="mt-6" />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Suggestions come from a transparent, rule-based score over app-authored feature lists. They are prompts for your
        own assessment, never a diagnosis. Confirm against the DSM-5-TR or ICD criteria, a full clinical interview and
        medical input where relevant.
      </p>
    </>
  );
}
