"use client";
/**
 * Side-by-side comparison of 2 or 3 possible considerations from this session (clinician mode only): matched and
 * missing features, features only one pattern lists, each pattern's own distinguishing notes, duration notes,
 * rule-outs, codes with the See DSM-5-TR pointer, and follow-up questions that help tell them apart. It never
 * picks one, scores them against each other or states a diagnosis (G3). Memory only; nothing is sent.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Brain, Check, CircleDashed, CircleHelp, ListChecks } from "lucide-react";
import { getCondition } from "@/lib/content";
import { followUpBank } from "@/lib/follow-up";
import type { FeatureRef } from "@/lib/types";
import { COMPARE_MAX, COMPARE_MIN, compareSuggestions, defaultSelection, type CompareColumn, type CompareFeature } from "@/lib/tools/differential-compare";
import { PART2_NOTICE } from "@/lib/referral-links";
import { useSession } from "@/state/session";
import { useSymptomAnalysis } from "@/components/symptoms/analysis";
import { RedFlagBanner, RiskMissNote } from "@/components/symptoms/red-flag-banner";
import { Under18Notice } from "@/components/symptoms/under18-notice";
import { CheckRow } from "@/components/tools/check-row";
import { ClinicianReviewBadge } from "@/components/content/content-meta";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { STRENGTH_LABEL } from "./explain";

/** Short reasoning checks (practice guide diagnostic-reasoning-checks), for this view and the diagnoses screen. */
export const REASONING_CHECKS = [
  { id: "closure", title: "Stopping too early", text: "What else could explain this? What have you not asked yet?" },
  { id: "confirmation", title: "Only seeing what fits", text: "Which documented or missing features argue against your leading idea?" },
  { id: "base-rates", title: "How common it is", text: "In your setting, which of these is more common? A striking feature does not make a rare pattern likely." },
  { id: "overshadowing", title: "Overshadowing", text: "Could a medical problem, a medicine or substance use explain new symptoms better than a known mental health problem?" },
  { id: "culture", title: "Culture and context", text: "How do the client and their community understand this? Could a belief, idiom of distress or real experience of discrimination be read as a symptom?" },
  { id: "labels", title: "Inherited labels", text: "Is an earlier diagnosis from a referral or old record being carried forward without checking?" },
] as const;

/** Collapsible reasoning check. Exported so the diagnoses screen can mount it too. */
export function ReasoningCheck({ className }: { className?: string }) {
  return (
    <Card className={cn("py-1 sm:py-1", className)}>
      <Disclosure title="Reasoning check before you decide" icon={Brain} bordered={false}>
        <ul className="space-y-2">
          {REASONING_CHECKS.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{c.title}.</span> {c.text}
            </li>
          ))}
        </ul>
        <Link
          href="/practice/diagnostic-reasoning-checks"
          className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
        >
          Diagnostic reasoning checks guide
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Disclosure>
    </Card>
  );
}

type ShownFeature = Pick<CompareFeature, "symptomId" | "label" | "documented">;

const shown = (matched: readonly FeatureRef[], missing: readonly FeatureRef[]): ShownFeature[] => [
  ...matched.map((f) => ({ symptomId: f.symptomId, label: f.label, documented: true })),
  ...missing.map((f) => ({ symptomId: f.symptomId, label: f.label, documented: false })),
];

function Features({ items, kind }: { items: readonly ShownFeature[]; kind: string }) {
  if (!items.length) return <p className="text-sm text-muted">None</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((f) => {
        const Icon = f.documented ? Check : CircleDashed;
        return (
          <li key={f.symptomId} className="flex items-start gap-2 text-sm">
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", f.documented ? "text-ok" : "text-muted")} />
            <span>
              <span className="sr-only">
                {f.documented ? "Documented" : "Not documented"} {kind}:{" "}
              </span>
              {f.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One comparison row: a heading, then one block per pattern (stacked on phones, side by side from md). */
function Row({
  title,
  columns,
  render,
  hint,
}: {
  title: string;
  columns: readonly CompareColumn[];
  render: (c: CompareColumn) => React.ReactNode;
  hint?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      <div className={cn("grid gap-3", columns.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {columns.map((c) => (
          <div key={c.conditionId} className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{c.name}</p>
            {render(c)}
          </div>
        ))}
      </div>
    </section>
  );
}

export function DifferentialCompare() {
  const { state } = useSession();
  const analysis = useSymptomAnalysis();
  const { result } = analysis;
  const suggestions = result.status === "ok" ? result.suggestions : [];
  const [chosen, setChosen] = React.useState<string[] | null>(null);
  const [status, setStatus] = React.useState("");

  const available = new Set(suggestions.map((s) => s.conditionId));
  const selected = (chosen ?? defaultSelection(suggestions)).filter((id) => available.has(id));
  const picked = suggestions.filter((s) => selected.includes(s.conditionId));
  const comparison = compareSuggestions(picked, getCondition, followUpBank);

  const toggle = (id: string, on: boolean) => {
    if (on && selected.length >= COMPARE_MAX) {
      setStatus(`Up to ${COMPARE_MAX} at a time. Untick one first.`);
      return;
    }
    setStatus("");
    setChosen(on ? [...selected, id] : selected.filter((x) => x !== id));
  };

  const back = (
    <Link href="/diagnoses" className={buttonVariants({ variant: "outline", size: "sm" })}>
      <ArrowLeft aria-hidden />
      Possible diagnoses
    </Link>
  );

  if (state.under18) return <Under18Notice />;
  if (suggestions.length < COMPARE_MIN) {
    return (
      <>
        <RedFlagBanner flags={analysis.redFlags} />
        <Notice tone="neutral" icon={ListChecks} title="Nothing to compare yet">
          <p>
            Comparison needs at least two possible considerations from this session. Document symptoms and context first, or
            answer some follow-up questions.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/symptoms" className={buttonVariants({ variant: "primary" })}>
              Go to Symptom Finder
            </Link>
            {back}
          </div>
        </Notice>
        <RiskMissNote className="mt-6" />
      </>
    );
  }

  const { columns, shared, questions } = comparison;
  const anySud = columns.some((c) => c.sud);

  return (
    <div className="space-y-6">
      <RedFlagBanner flags={analysis.redFlags} />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ClinicianReviewBadge />
          <span className="text-sm text-muted">None of these is a diagnosis. Nothing here picks one.</span>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-base font-semibold">
            Compare {COMPARE_MIN} or {COMPARE_MAX} possible considerations
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <CheckRow key={s.conditionId} checked={selected.includes(s.conditionId)} onChange={(on) => toggle(s.conditionId, on)}>
                <span className="font-semibold">{s.name}</span>
                <span className="block text-xs text-muted">{STRENGTH_LABEL[s.strength]}</span>
              </CheckRow>
            ))}
          </div>
        </fieldset>
        <p role="status" className="min-h-5 text-sm text-muted">
          {status}
        </p>
        <div className="flex flex-wrap gap-2">{back}</div>
      </Card>

      {anySud ? (
        <Notice tone="warn" title="42 CFR Part 2: substance use">
          <p>A substance-use consideration is compared. Nothing is stored or sent. Any export carries the notice: {PART2_NOTICE}</p>
        </Notice>
      ) : null}

      {columns.length < COMPARE_MIN ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">Tick at least {COMPARE_MIN} to see them side by side.</p>
      ) : (
        <>
          <Row
            title="How they differ"
            hint="Each pattern's own distinguishing notes about the others compared here."
            columns={columns}
            render={(c) =>
              c.versus.length ? (
                <ul className="space-y-2 text-sm">
                  {c.versus.map((v) => (
                    <li key={v.otherId}>
                      <span className="font-semibold">Versus {v.otherName}:</span> {v.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No note about the others compared here.</p>
              )
            }
          />
          <section aria-labelledby="compare-questions" className="space-y-2">
            <h2 id="compare-questions" className="flex items-center gap-2 text-base font-semibold">
              <CircleHelp aria-hidden className="size-5 text-accent" />
              Questions that help tell them apart
            </h2>
            {questions.length ? (
              <ol className="space-y-3">
                {questions.map((q) => (
                  <li key={q.id} className="rounded-xl border border-border bg-surface p-3 text-sm sm:p-4">
                    <p className="font-semibold">{q.text}</p>
                    <p className="mt-1 text-muted">{q.why}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">No curated question is tagged for these patterns. Use the features only one pattern lists, below.</p>
            )}
            <p className="text-sm text-muted">
              Answer them in the follow-up panel on{" "}
              <Link href="/diagnoses" className="font-semibold text-accent underline underline-offset-2">
                Possible diagnoses
              </Link>
              , where answers update the suggestions on this device.
            </p>
          </section>
          <Row
            title="Key features"
            hint="A tick means documented this session; a dashed circle means not yet documented."
            columns={columns}
            render={(c) => <Features items={shown(c.coreMatched, c.coreMissing)} kind="key feature" />}
          />
          <Row
            title="Supporting features"
            columns={columns}
            render={(c) => <Features items={shown(c.supportingMatched, c.supportingMissing)} kind="supporting feature" />}
          />
          <Row
            title="Only on this pattern's list"
            hint="Features the other compared patterns do not list. Asking about these often helps most."
            columns={columns}
            render={(c) => <Features items={c.distinctive} kind="feature" />}
          />
          {shared.length ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">On every compared list</h2>
              <p className="text-sm text-muted">These do not help tell the patterns apart.</p>
              <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
                <Features items={shared} kind="shared feature" />
              </div>
            </section>
          ) : null}
          <Row title="Duration" columns={columns} render={(c) => <p className="text-sm">{c.durationNote}</p>} />
          <Row
            title="Rule out first"
            columns={columns}
            render={(c) => (
              <ul className="space-y-1.5 text-sm">
                {c.ruleOuts.map((r) => (
                  <li key={r.label}>
                    <span className="font-semibold">{r.label}.</span> <span className="text-muted">{r.note}</span>
                  </li>
                ))}
              </ul>
            )}
          />
          <Row
            title="Codes and reference"
            columns={columns}
            render={(c) => (
              <dl className="space-y-1.5 text-sm">
                <dt className="font-semibold">ICD-10-CM</dt>
                <dd className="text-muted">{c.icd10cm.map((x) => x.code).join(", ")}</dd>
                <dt className="font-semibold">ICD-11</dt>
                <dd className="text-muted">{c.icd11.map((x) => x.code).join(", ")}</dd>
                <dt className="font-semibold">DSM-5-TR</dt>
                <dd className="flex items-start gap-1.5 text-muted">
                  <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {c.dsmPointer}
                </dd>
              </dl>
            )}
          />
        </>
      )}

      <ReasoningCheck />
      <RiskMissNote />
      <p className="max-w-3xl text-sm text-muted">
        Patterns come from the app&apos;s small adult knowledge base and its own original wording. Confirm with the DSM-5-TR or
        ICD criteria, a full clinical interview and medical input where relevant.
      </p>
    </div>
  );
}
