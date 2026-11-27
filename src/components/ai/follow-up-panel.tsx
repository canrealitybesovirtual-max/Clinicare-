"use client";
/**
 * "Help me ask more": the deterministic follow-up engine (src/lib/follow-up) on the PHI-scrubbed note and the
 * selected chips. Runs on this device; no network, nothing stored beyond memory-only session state.
 *
 * Shows, for clinician review only: the feared objects or situations recognized in the note, patterns to
 * consider (with codes, the "See DSM-5-TR" pointer and documented / not yet documented features, as tap-to-add
 * chips), up to five question cards whose answers re-score locally, and pointers to measures, interventions,
 * handouts and referral types. Never a diagnosis, never a risk decision; safety items always come first with
 * crisis information, and the crisis button stays on every screen.
 */
import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  ClipboardList,
  FileText,
  HeartHandshake,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { conditions, getMeasure, lexicon } from "@/lib/content";
import {
  SURFACE_INFO,
  answerGateEffects,
  computeResourceHints,
  nextQuestions,
  summarizeTriggers,
  triggerPatterns,
  type FollowUpQuestion,
  type ResourceCatalog,
  type TriggerPattern,
} from "@/lib/follow-up";
import { useSession, type SessionState } from "@/state/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ClinicianReviewBadge } from "@/components/content/content-bits";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import type { SymptomAnalysis } from "@/components/symptoms/analysis";
import { STRENGTH_LABEL } from "@/components/diagnoses/explain";
import { cn } from "@/lib/utils";
import { useAiSession, type FollowUpAnswer } from "./ai-session";
import { REFERRAL_LABELS, codeSummary, shortSymptomLabel } from "./labels";
import { useIsClientMode } from "./use-client-mode";

const KIND_LABEL: Record<FollowUpQuestion["kind"], string> = {
  safety: "Safety first",
  discriminate: "Tells patterns apart",
  gate: "Context",
  core: "Key feature not yet asked",
};

/* ------------------------------------------------------------------ tap-to-add chip */

export function AddSymptomChip({ id, onAdd, hint }: { id: string; onAdd: (id: string) => void; hint?: string }) {
  const label = shortSymptomLabel(id);
  return (
    <button
      type="button"
      onClick={() => onAdd(id)}
      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3.5 py-2 text-left text-sm font-medium text-text hover:border-accent"
    >
      <Plus aria-hidden className="size-4 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="sr-only">Add symptom: </span>
        {label}
        {hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ patterns */

function PatternCard({ p, onAdd }: { p: TriggerPattern; onAdd: (id: string) => void }) {
  const fear = p.objectLabels.join(" or ");
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-base font-semibold">
          {p.name}
        </h4>
        {p.scored ? (
          <Link href={`/diagnoses#cond-${p.conditionId}`} className="text-sm font-semibold text-accent underline underline-offset-2">
            {STRENGTH_LABEL[p.scored.strength]} on Possible diagnoses
          </Link>
        ) : null}
      </div>
      <p className="mt-0.5 text-sm text-muted">
        A pattern to consider{fear ? ` for the fear of ${fear}` : ""}. Not a diagnosis.
      </p>
      <p className="mt-2 text-sm">
        <span className="font-semibold">ICD-10-CM</span> <span className="font-mono">{codeSummary(p.icd10cm)}</span>
        <span className="text-muted"> · </span>
        <span className="font-semibold">ICD-11</span> <span className="font-mono">{codeSummary(p.icd11)}</span>
      </p>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
        <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
        {p.dsmPointer}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">Documented ({p.matched.length})</p>
          {p.matched.length ? (
            <ul className="mt-1 space-y-1 text-sm">
              {p.matched.map((f) => (
                <li key={f.symptomId}>
                  <span className="sr-only">Matched {f.kind}: </span>
                  {shortSymptomLabel(f.symptomId)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing for this pattern yet.</p>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold">
            Not yet documented ({p.missing.length})
          </p>
          <p className="mt-1 text-sm text-muted">
            Key features: {p.missing.filter((f) => f.kind === "core").map((f) => shortSymptomLabel(f.symptomId)).join("; ") || "all documented"}.
          </p>
        </div>
      </div>
      {p.addable.length ? (
        <div className="mt-3">
          <p className="text-sm font-semibold">If the client describes these, tap to add them</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.addable.map((id) => (
              <AddSymptomChip key={id} id={id} onAdd={onAdd} />
            ))}
          </div>
        </div>
      ) : null}
      <details className="group mt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-accent underline underline-offset-2 [&::-webkit-details-marker]:hidden">
          What to clarify for this kind of fear
        </summary>
        <p className="pb-1 text-sm leading-relaxed text-muted">{p.clinicianNote}</p>
      </details>
    </li>
  );
}

/* ------------------------------------------------------------------ question card */

function QuestionCard({
  q,
  chosen,
  onAnswer,
}: {
  q: FollowUpQuestion;
  chosen: readonly string[];
  onAnswer: (q: FollowUpQuestion, answerIds: string[]) => void;
}) {
  const textId = React.useId();
  const [picked, setPicked] = React.useState<string[]>([...chosen]);
  const safety = q.kind === "safety";
  const toggle = (id: string, exclusive: boolean) =>
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const exclusiveIds = new Set(q.options.filter((o) => o.exclusive).map((o) => o.id));
      return exclusive ? [id] : [...prev.filter((x) => !exclusiveIds.has(x)), id];
    });

  return (
    <li
      className={cn(
        "rounded-xl border bg-surface p-4",
        safety ? "border-crisis/40 border-l-[6px] border-l-crisis" : "border-border",
      )}
    >
      <p className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", safety ? "text-crisis" : "text-muted")}>
        {safety ? <ShieldAlert aria-hidden className="size-4" /> : <MessageCircleQuestion aria-hidden className="size-4" />}
        {KIND_LABEL[q.kind]}
      </p>
      <p id={textId} className="mt-1.5 text-base font-semibold leading-snug">
        {q.text}
      </p>
      {q.select === "one" ? (
        <div role="group" aria-labelledby={textId} className="mt-3 grid gap-2 sm:grid-cols-2">
          {q.options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={chosen.includes(o.id)}
              onClick={() => onAnswer(q, [o.id])}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2 text-left text-sm leading-snug transition-colors",
                chosen.includes(o.id)
                  ? "border-primary bg-primary/10 font-semibold ring-2 ring-primary"
                  : o.keepOpen
                    ? "border-dashed border-border text-muted hover:bg-surface-2"
                    : "border-border hover:bg-surface-2",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <fieldset className="mt-3">
          <legend className="sr-only">{q.text} (choose all that apply)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => (
              <label
                key={o.id}
                className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm leading-snug hover:bg-surface-2 has-[:checked]:border-primary has-[:checked]:bg-primary/10"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                  checked={picked.includes(o.id)}
                  onChange={() => toggle(o.id, o.exclusive)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-2" disabled={picked.length === 0} onClick={() => onAnswer(q, picked)}>
            Record answer
          </Button>
        </fieldset>
      )}
      {q.part2Notice ? (
        <p className="mt-3 rounded-lg bg-warn-bg p-3 text-sm text-text">
          <span className="font-semibold text-warn-fg">42 CFR Part 2: </span>
          {q.part2Notice}
        </p>
      ) : null}
      <details className="group mt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-accent underline underline-offset-2 [&::-webkit-details-marker]:hidden">
          Why this question?
        </summary>
        <div className="space-y-1.5 pb-1 text-sm leading-relaxed text-muted">
          <p>{q.why}</p>
          <p>
            <span className="font-semibold text-text">Asked now because: </span>
            {q.whyAsked}
          </p>
        </div>
      </details>
    </li>
  );
}

/* ------------------------------------------------------------------ resource pointers */

function Pointers({ hints, catalog }: { hints: ReturnType<typeof computeResourceHints>; catalog: ResourceCatalog }) {
  const interventionName = new Map(catalog.interventions.map((i) => [i.id, i.name] as const));
  const handoutTitle = new Map(catalog.handouts.map((h) => [h.id, h.title] as const));
  const measures = hints.measureIds.flatMap((id) => getMeasure(id) ?? []);
  const linkClass = "inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2";
  const groups = [
    {
      key: "measures",
      title: "Measures",
      icon: ClipboardList,
      items: measures.map((m) => ({ href: `/measures/${m.id}`, label: `Run ${m.shortName}` })),
    },
    {
      key: "interventions",
      title: "Interventions",
      icon: HeartHandshake,
      items: hints.interventionIds.map((id) => ({ href: `/interventions/${id}`, label: interventionName.get(id) ?? id })),
    },
    {
      key: "handouts",
      title: "Client handouts",
      icon: FileText,
      items: hints.handoutIds.map((id) => ({ href: `/handouts/${id}`, label: handoutTitle.get(id) ?? id })),
    },
    {
      key: "referrals",
      title: "Referral types",
      icon: Users,
      items: hints.referralKinds.map((k) => ({ href: "/referrals", label: REFERRAL_LABELS[k] })),
    },
  ].filter((g) => g.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="fu-pointers-heading" className="space-y-3">
      <h3 id="fu-pointers-heading" className="text-base font-semibold">
        Next steps to consider
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <g.icon aria-hidden className="size-4 text-muted" /> {g.title}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {g.items.map((it) => (
                <li key={`${it.href}-${it.label}`}>
                  <Link href={it.href} className={linkClass}>
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {hints.part2Notice ? (
        <p className="rounded-lg bg-warn-bg p-3 text-sm">
          <span className="font-semibold text-warn-fg">42 CFR Part 2: </span>
          {hints.part2Notice}
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ panel */

const GATE_FIELDS = ["duration", "impairment", "substancePossible", "medicalPossible"] as const;

export function FollowUpPanel({
  analysis,
  catalog,
  className,
}: {
  analysis: SymptomAnalysis;
  catalog: ResourceCatalog;
  className?: string;
}) {
  const client = useIsClientMode();
  const { state, set, toggleSymptom } = useSession();
  const [ai, update] = useAiSession();
  const [announcement, setAnnouncement] = React.useState("");
  const questionsHeading = React.useRef<HTMLHeadingElement>(null);
  const refocus = React.useRef(false);

  const { folded, result, triggers } = analysis;
  const questions = React.useMemo(
    () =>
      nextQuestions(
        {
          scoringInput: folded.scoringInput,
          scoringResult: result,
          triggers,
          answered: folded.applied,
          absentSymptomIds: [...analysis.absent.map((a) => a.symptomId), ...folded.negatedSymptomIds],
          triggerCategories: folded.triggerCategories,
        },
        { conditions, symptoms: lexicon.symptoms, mode: "clinician" },
      ),
    [folded, result, triggers, analysis.absent],
  );
  const patterns = React.useMemo(
    () =>
      triggerPatterns(triggers, folded.scoringInput, result, {
        conditions,
        symptoms: lexicon.symptoms,
        extraCategories: folded.triggerCategories,
        absentSymptomIds: [...analysis.absent.map((a) => a.symptomId), ...folded.negatedSymptomIds],
      }),
    [triggers, folded, result, analysis.absent],
  );
  const hints = React.useMemo(
    () => computeResourceHints(result, triggers, catalog, { surfaces: folded.surfaces, triggerCategories: folded.triggerCategories }),
    [result, triggers, catalog, folded],
  );
  const recognized = React.useMemo(() => summarizeTriggers(triggers), [triggers]);

  React.useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    questionsHeading.current?.focus();
  });

  if (client || state.under18) return null;
  const hasSignal = analysis.ids.length > 0 || triggers.length > 0 || ai.followUpAnswers.length > 0;
  if (!hasSignal) return null;

  const urgent = folded.surfaces.filter((s) => SURFACE_INFO[s].urgent);
  const otherSurfaces = folded.surfaces.filter((s) => !SURFACE_INFO[s].urgent && s !== "part2-notice");
  const showSafety = analysis.redFlags.length > 0 || urgent.length > 0;
  const chosenFor = (id: string) => ai.followUpAnswers.find((a) => a.questionId === id)?.answerIds ?? [];

  const addChip = (id: string) => {
    if (!state.selectedSymptomIds.includes(id)) toggleSymptom(id);
    setAnnouncement(`Added: ${shortSymptomLabel(id)}. The picture was updated.`);
  };

  const answer = (q: FollowUpQuestion, answerIds: string[]) => {
    const labels = q.options.filter((o) => answerIds.includes(o.id)).map((o) => o.label);
    const record: FollowUpAnswer = { questionId: q.id, answerIds, questionText: q.text, answerLabels: labels };
    update((prev) => ({ followUpAnswers: [...prev.followUpAnswers.filter((a) => a.questionId !== q.id), record] }));
    const gates = answerGateEffects(q.id, answerIds);
    if (Object.keys(gates).length > 0) set(gates);
    const keepOpen = q.options.filter((o) => answerIds.includes(o.id)).every((o) => o.keepOpen);
    if (!keepOpen) refocus.current = true; // the card leaves the list: keep focus in the panel
    setAnnouncement(`Answer recorded: ${labels.join(", ")}. The picture was updated.`);
  };

  const undo = (a: FollowUpAnswer) => {
    update((prev) => ({ followUpAnswers: prev.followUpAnswers.filter((x) => x.questionId !== a.questionId) }));
    // Put a context field back to "unknown" only if it still holds what this answer set.
    const gates = answerGateEffects(a.questionId, a.answerIds);
    const revert: Partial<SessionState> = {};
    for (const k of GATE_FIELDS) if (gates[k] !== undefined && state[k] === gates[k]) Object.assign(revert, { [k]: "unknown" });
    if (Object.keys(revert).length > 0) set(revert);
    refocus.current = true;
    setAnnouncement("Answer removed. The question is back in the list.");
  };

  return (
    <section aria-labelledby="fu-heading" className={cn("rounded-2xl border border-border bg-surface-2/60 p-4 sm:p-6", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles aria-hidden className="size-5 text-accent" />
        <h2 id="fu-heading" className="text-lg font-semibold">
          Help me ask more
        </h2>
        <ClinicianReviewBadge className="ml-auto" />
      </div>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Suggested next questions, worked out on this device from what you typed and tapped. Tap an answer to update the
        picture. Nothing here is a diagnosis or a risk decision.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="mt-5 space-y-6">
        {showSafety ? (
          <Notice tone="crisis" title="Safety first: ask directly">
            <p>
              {analysis.redFlags.length
                ? "A safety red flag is documented. Assess it directly and follow your local protocol; this app never decides risk."
                : "An answer brought safety resources forward. Assess directly and follow your local protocol."}
            </p>
            <CrisisInline />
            {urgent
              .filter((s) => SURFACE_INFO[s].href)
              .map((s) => (
                <p key={s}>
                  <Link href={SURFACE_INFO[s].href as string} className="font-semibold text-accent underline underline-offset-2">
                    {SURFACE_INFO[s].label}
                  </Link>
                  <span className="text-muted"> · {SURFACE_INFO[s].description}</span>
                </p>
              ))}
            {urgent.includes("urgent-medical") ? <p className="font-semibold">{SURFACE_INFO["urgent-medical"].description}</p> : null}
          </Notice>
        ) : null}

        {recognized.length ? (
          <div>
            <h3 className="text-base font-semibold">Recognized in the note</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {recognized.map((r) => (
                <li key={r.category}>
                  <Badge tone="neutral" className="px-3 py-1 text-sm">
                    {r.objectLabels.join(", ")}
                    <span className="font-normal text-muted"> · {r.label}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {patterns.length ? (
          <div>
            <h3 className="text-base font-semibold">Patterns to consider</h3>
            <ul className="mt-2 space-y-3">
              {patterns.map((p) => (
                <PatternCard key={p.conditionId} p={p} onAdd={addChip} />
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 ref={questionsHeading} tabIndex={-1} className="text-base font-semibold outline-none focus-visible:outline-3">
            Questions to ask next {questions.length ? `(${questions.length})` : ""}
          </h3>
          {questions.length ? (
            <ol className="mt-2 space-y-3">
              {questions.map((q) => (
                <QuestionCard key={`${q.id}-${chosenFor(q.id).join(".")}`} q={q} chosen={chosenFor(q.id)} onAnswer={answer} />
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-sm text-muted">No further questions right now. Add more detail to the note for new ones.</p>
          )}
        </div>

        {ai.followUpAnswers.length ? (
          <div>
            <h3 className="text-base font-semibold">Your answers ({ai.followUpAnswers.length})</h3>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
              {ai.followUpAnswers.map((a) => (
                <li key={a.questionId} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block text-muted">{a.questionText}</span>
                    <span className="font-semibold">{a.answerLabels.join(", ")}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => undo(a)}>
                    <RotateCcw aria-hidden />
                    Change<span className="sr-only"> answer to: {a.questionText}</span>
                  </Button>
                </li>
              ))}
            </ul>
            {folded.notes.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                {folded.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            {otherSurfaces.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {otherSurfaces.map((s) => (
                  <li key={s}>
                    {SURFACE_INFO[s].href ? (
                      <Link href={SURFACE_INFO[s].href as string} className="font-semibold text-accent underline underline-offset-2">
                        {SURFACE_INFO[s].label}
                      </Link>
                    ) : (
                      <span className="font-semibold">{SURFACE_INFO[s].label}</span>
                    )}
                    <span className="text-muted"> · {SURFACE_INFO[s].description}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <Pointers hints={hints} catalog={catalog} />

        <p className="border-t border-border pt-3 text-xs text-muted">
          Questions come from the app&apos;s own question bank (original wording, awaiting clinical review). Answers stay in
          this tab and clear with the session.
        </p>
      </div>
    </section>
  );
}
