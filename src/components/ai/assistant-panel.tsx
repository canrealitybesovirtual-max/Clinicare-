"use client";
/**
 * The optional Claude assistant (owner amendment, CLAUDE.md 2026-11-27; docs/AI-ASSISTANT.md).
 *
 * Rendered only when the server says it is enabled (all three server-side switches set), never in client mode,
 * never for clients under 18, and it does nothing until the clinician switches it on for this session. Each
 * request is an explicit button press and carries only the identifier-scrubbed note (scrubbed again on the
 * server), curated symptom and condition ids, duration and impairment. Substance-use ids and the substance
 * context answer are never sent (42 CFR Part 2); a note with substance-use content is not sent at all.
 * The answer is labeled "For clinician review": follow-up questions and curated resource ids only, never a
 * diagnosis or a risk decision. Answers change the session the same way the clinician's own taps do.
 */
import * as React from "react";
import Link from "next/link";
import { Bot, Loader2 } from "lucide-react";
import { getCondition, getSymptom } from "@/lib/content";
import { callApi } from "@/lib/api-client";
import { useLang } from "@/lib/i18n/core";
import { scrubPHI } from "@/lib/phi-scrubber";
import type { AssistAnswer, AssistQuestion, AssistResult } from "@/server/ai/schemas";
import { useSession } from "@/state/session";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ClinicianReviewBadge } from "@/components/content/content-bits";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { SUD_SYMPTOM_IDS, type SymptomAnalysis } from "@/components/symptoms/analysis";
import { cn } from "@/lib/utils";
import { useAiSession } from "./ai-session";
import { REFERRAL_LABELS } from "./labels";
import { useIsClientMode } from "./use-client-mode";

export interface AssistantStatus {
  enabled: boolean;
  model: string | null;
}

/** Mirrors INPUT_LIMITS in src/server/ai/schemas.ts (server-only). */
const LIMITS = { textChars: 1500, symptomIds: 80, candidateConditionIds: 12, answered: 20 } as const;

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; data: AssistResult };

function AssistQuestionCard({
  q,
  chosen,
  onAnswer,
}: {
  q: AssistQuestion;
  chosen: string | undefined;
  onAnswer: (q: AssistQuestion, a: AssistAnswer) => void;
}) {
  const textId = React.useId();
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <p id={textId} className="text-base font-semibold leading-snug">
        {q.text}
      </p>
      {q.why ? <p className="mt-1 text-sm text-muted">{q.why}</p> : null}
      <div role="group" aria-labelledby={textId} className="mt-3 grid gap-2 sm:grid-cols-2">
        {q.answers.map((a) => (
          <button
            key={a.label}
            type="button"
            aria-pressed={chosen === a.label}
            disabled={chosen !== undefined}
            onClick={() => onAnswer(q, a)}
            className={cn(
              "min-h-11 rounded-lg border px-3 py-2 text-left text-sm leading-snug",
              chosen === a.label ? "border-primary bg-primary/10 font-semibold ring-2 ring-primary" : "border-border hover:bg-surface-2 disabled:opacity-60",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
    </li>
  );
}

export function AssistantPanel({ status, analysis }: { status: AssistantStatus; analysis: SymptomAnalysis }) {
  const client = useIsClientMode();
  const { state, set } = useSession();
  const { lang } = useLang();
  const [ai, update] = useAiSession();
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [chosen, setChosen] = React.useState<Record<string, string>>({});
  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  if (!status.enabled || client || state.under18 || ai.assistantUnavailable) return null;

  const symptomIds = analysis.ids.filter((id) => !SUD_SYMPTOM_IDS.has(id)).slice(0, LIMITS.symptomIds);
  const candidateConditionIds = analysis.result.suggestions
    .map((s) => s.conditionId)
    .filter((id) => getCondition(id)?.sud !== true)
    .slice(0, LIMITS.candidateConditionIds);
  const text = scrubPHI(state.symptomText).clean.slice(0, LIMITS.textChars);
  const nothingToSend = !text.trim() && symptomIds.length === 0 && candidateConditionIds.length === 0;

  const ask = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: "loading" });
    const res = await callApi<AssistResult>(
      "assistant",
      {
        optIn: true,
        text,
        symptomIds,
        duration: state.duration,
        impairment: state.impairment,
        medicalPossible: state.medicalPossible,
        candidateConditionIds,
        answered: [...ai.assistantAnswered],
        lang,
      },
      ctrl.signal,
    );
    if (ctrl.signal.aborted) return;
    if (!res.ok) {
      if (res.code === "not-configured") {
        update({ assistantUnavailable: true, assistantOptIn: false });
        return;
      }
      const message = res.code === "rate-limited" ? "The assistant is busy. Wait a minute, then try again." : res.error;
      setPhase({ kind: "error", message });
      return;
    }
    if (res.data.droppedAnswers > 0) update({ assistantAnswered: [] }); // seals no longer verify (key rotated)
    setChosen({});
    setPhase({ kind: "done", data: res.data });
  };

  const answer = (q: AssistQuestion, a: AssistAnswer) => {
    setChosen((prev) => ({ ...prev, [q.id]: a.label }));
    const selected = new Set(state.selectedSymptomIds);
    for (const id of a.addSymptomIds) if (getSymptom(id)) selected.add(id);
    // Never clears a red flag (the server drops such ids too).
    for (const id of a.negateSymptomIds) if (!getSymptom(id)?.redFlag) selected.delete(id);
    set({
      selectedSymptomIds: [...selected],
      ...(a.setDuration ? { duration: a.setDuration } : {}),
      ...(a.setImpairment ? { impairment: a.setImpairment } : {}),
    });
    update((prev) => ({
      assistantAnswered: [...prev.assistantAnswered, { questionId: q.id, questionText: q.text, answerLabel: a.label, seal: a.seal }].slice(-LIMITS.answered),
    }));
  };

  const optIn = ai.assistantOptIn;
  const data = phase.kind === "done" ? phase.data : null;

  return (
    <section aria-labelledby="assistant-heading" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <Bot aria-hidden className="size-5 shrink-0 text-muted" />
        <h3 id="assistant-heading" className="min-w-0 flex-1 text-base font-semibold leading-snug">
          Ask the AI assistant (Claude)
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={optIn}
          aria-labelledby="assistant-heading"
          onClick={() => {
            abortRef.current?.abort();
            setPhase({ kind: "idle" });
            update({ assistantOptIn: !optIn, ...(optIn ? { assistantAnswered: [] } : {}) });
          }}
          className="group relative inline-flex h-11 w-[4.5rem] shrink-0 items-center rounded-full border border-border bg-surface-2 p-1 aria-checked:border-primary aria-checked:bg-primary/15"
        >
          <span
            aria-hidden
            className="size-8 rounded-full bg-muted transition-transform motion-reduce:transition-none group-aria-checked:translate-x-7 group-aria-checked:bg-primary-solid"
          />
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">
        Optional, for this session only. Sends the identifier-scrubbed note and app codes through this app&apos;s
        server to {status.model ?? "Claude"}; nothing is stored. Substance-use details are never sent.
      </p>

      {optIn ? (
        <div className="mt-4 space-y-4">
          {analysis.sud ? (
            <Notice tone="warn" title="Not sent: substance use (42 CFR Part 2)">
              <p>
                The note or the chips include substance-use details, which are never sent to the assistant. The on-device
                questions above still cover them.
              </p>
            </Notice>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => void ask()} disabled={nothingToSend || phase.kind === "loading"}>
                {phase.kind === "loading" ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
                {data ? "Ask again with my answers" : "Ask for follow-up questions"}
              </Button>
              {nothingToSend ? <p className="text-sm text-muted">Describe the presentation or tap symptoms first.</p> : null}
            </div>
          )}

          <div aria-live="polite" className="space-y-4">
            {phase.kind === "loading" ? <p className="text-sm text-muted">Waiting for the assistant…</p> : null}
            {phase.kind === "error" ? (
              <Notice tone="warn" title="The assistant could not answer">
                <p>{phase.message}</p>
              </Notice>
            ) : null}
            {data ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <ClinicianReviewBadge />
                  <span className="text-muted">
                    {data.generatedBy} · {data.model}
                  </span>
                </div>
                {data.safetyPrompt ? (
                  <Notice tone="crisis" title="Safety first">
                    <p>{data.safetyPrompt}</p>
                    <CrisisInline />
                  </Notice>
                ) : null}
                {data.status === "declined" ? (
                  <p className="text-sm">The assistant could not help with this note. The app&apos;s own tools above still apply.</p>
                ) : null}
                {data.substanceInfoWithheld ? (
                  <p className="text-sm text-muted">Substance-related items were not shared with the assistant.</p>
                ) : null}
                {data.questions.length ? (
                  <ol className="space-y-3">
                    {data.questions.map((q) => (
                      <AssistQuestionCard key={q.id} q={q} chosen={chosen[q.id]} onAnswer={answer} />
                    ))}
                  </ol>
                ) : null}
                <AssistResources data={data} />
                <p className="border-t border-border pt-3 text-xs text-muted">{data.disclaimer}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AssistResources({ data }: { data: AssistResult }) {
  const items = [
    ...data.resources.measureIds.map((id) => ({ href: `/measures/${id}`, label: `Run ${data.resourceLabels.measures[id] ?? id}` })),
    ...data.resources.interventionIds.map((id) => ({ href: `/interventions/${id}`, label: data.resourceLabels.interventions[id]?.name ?? id })),
    ...data.resources.referralKinds.map((k) => ({
      href: "/referrals",
      label: data.resourceLabels.referralKinds[k] ?? (k in REFERRAL_LABELS ? REFERRAL_LABELS[k as keyof typeof REFERRAL_LABELS] : k),
    })),
  ];
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold">Resources it points to</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((it) => (
          <li key={`${it.href}-${it.label}`}>
            <Link href={it.href} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2">
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
