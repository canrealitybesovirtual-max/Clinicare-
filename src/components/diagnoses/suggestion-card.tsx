"use client";
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleDashed,
  ClipboardList,
  FileText,
  Globe2,
  HeartHandshake,
  Info,
  ListTodo,
  Newspaper,
  TriangleAlert,
} from "lucide-react";
import type { Condition } from "@/lib/schemas";
import type { ScoringInput, Suggestion } from "@/lib/types";
import { getHandout, getMeasure, getStat } from "@/lib/content";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import {
  ClinicianReviewBadge,
  Governance,
  ReviewBadge,
  SourcesList,
  StatCard,
} from "@/components/content/content-bits";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/utils";
import { PART2_NOTICE } from "@/lib/referral-links";
import { explainScore, STRENGTH_LABEL } from "./explain";
import { LazyPanel } from "./lookup-status";
import { Icd11Panel } from "./icd11-panel";
import { MedlinePlusPanel } from "./medlineplus-panel";

/** Evidence first (feature counts), then the rule-based strength band and score. */
function StrengthMeter({ s }: { s: Suggestion }) {
  const coreMatched = s.matched.filter((f) => f.kind === "core").length;
  const coreTotal = coreMatched + s.missing.filter((f) => f.kind === "core").length;
  const assocMatched = s.matched.length - coreMatched;
  const assocTotal = assocMatched + s.missing.filter((f) => f.kind === "associated").length;
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <p className="text-sm font-semibold">
        Core features {coreMatched} of {coreTotal}
        {assocTotal > 0 ? ` · associated ${assocMatched} of ${assocTotal}` : ""}
      </p>
      <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">{STRENGTH_LABEL[s.strength]}</span>
        <span className="text-muted">
          Score <span className="font-semibold text-text">{s.score}</span> of 100
        </span>
      </p>
      <div aria-hidden className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-border/70">
        <div className="h-full rounded-full bg-accent" style={{ width: `${s.score}%` }} />
        <span className="absolute inset-y-0 left-[40%] w-0.5 bg-surface" />
        <span className="absolute inset-y-0 left-[65%] w-0.5 bg-surface" />
      </div>
      <p className="mt-1.5 text-xs text-muted">Possible below 40 · moderate 40–64 · strong 65 and above</p>
    </div>
  );
}

function FeatureList({
  items,
  kind,
  matched,
}: {
  items: Suggestion["matched"];
  kind: "core" | "associated";
  matched: boolean;
}) {
  const Icon = matched ? Check : CircleDashed;
  return (
    <ul className="mt-1.5 space-y-1.5">
      {items.map((f) => (
        <li key={f.symptomId} className="flex items-start gap-2 text-sm">
          <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", matched ? "text-ok" : "text-muted")} />
          <span>
            <span className="sr-only">
              {matched ? "Matched" : "Missing"} {kind}:{" "}
            </span>
            {f.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted first:mt-2">{children}</h4>;
}

export function SuggestionCard({
  s,
  cond,
  input,
  rank,
}: {
  s: Suggestion;
  cond: Condition;
  input: Omit<ScoringInput, "symptomIds">;
  rank: number;
}) {
  const headingId = `cond-${s.conditionId}`;
  const ex = explainScore(cond, s, input);
  const missingCore = s.missing.filter((f) => f.kind === "core");
  const missingAssoc = s.missing.filter((f) => f.kind === "associated");
  const matchedCore = s.matched.filter((f) => f.kind === "core");
  const matchedAssoc = s.matched.filter((f) => f.kind === "associated");
  const coreTotal = matchedCore.length + missingCore.length;
  const assocTotal = matchedAssoc.length + missingAssoc.length;
  const builtIn = cond.measures.map((id) => getMeasure(id)).filter((m) => m !== undefined);
  const handouts = cond.handouts.map((id) => getHandout(id)).filter((h) => h !== undefined);
  const stats = cond.statIds.map((id) => getStat(id)).filter((x) => x !== undefined);
  const ruleOutGroups = (["medical", "substance", "psychiatric"] as const)
    .map((t) => ({ t, items: cond.ruleOuts.filter((r) => r.type === t) }))
    .filter((g) => g.items.length);

  return (
    <article aria-labelledby={headingId} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <ClinicianReviewBadge />
        <ReviewBadge reviewedBy={cond.reviewedBy} />
        <span className="ml-auto text-xs font-semibold text-muted">Consideration {rank}</span>
      </div>

      <h2 id={headingId} className="mt-3 text-xl font-bold leading-tight sm:text-2xl">
        {s.name}
      </h2>
      <p className="mt-1 text-sm text-muted">Possible consideration — not a diagnosis.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_17rem]">
        <dl className="grid gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[6.5rem_1fr]">
          <dt className="font-semibold">ICD-10-CM</dt>
          <dd>
            {s.icd10cm.map((c) => (
              <span key={c.code} className="block">
                <span className="font-mono font-semibold">{c.code}</span> <span className="text-muted">{c.label}</span>
              </span>
            ))}
          </dd>
          <dt className="font-semibold">ICD-11</dt>
          <dd>
            {s.icd11.map((c) => (
              <span key={c.code} className="block">
                <span className="font-mono font-semibold">{c.code}</span> <span className="text-muted">{c.label}</span>
              </span>
            ))}
          </dd>
          <dt className="font-semibold">DSM-5-TR</dt>
          <dd className="flex items-start gap-1.5">
            <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>{s.dsmPointer}</span>
          </dd>
        </dl>
        <StrengthMeter s={s} />
      </div>

      <p className="mt-4 text-sm leading-relaxed">{cond.summary}</p>

      {s.flags.length ? (
        <ul className="mt-4 space-y-2" aria-label="Flags">
          {s.flags.map((f, i) => {
            const reduces = f.type === "partial-core" || /score reduced/i.test(f.message);
            const Icon = reduces ? TriangleAlert : Info;
            return (
              <li
                key={`${f.type}-${i}`}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                  reduces ? "border border-warn-border bg-warn-bg text-warn-fg" : "bg-info-bg text-info-fg",
                )}
              >
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{f.message}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {s.comorbidityNotes.length ? (
        <Notice tone="accent" title="Also consider together" className="mt-4">
          <ul className="list-disc space-y-1 pl-4">
            {s.comorbidityNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {cond.sud ? (
        <Notice tone="warn" title="42 CFR Part 2" className="mt-4">
          Substance-use information is not stored by this app. Any export carries the notice: {PART2_NOTICE}
        </Notice>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/interventions?condition=${encodeURIComponent(cond.id)}`} className={buttonVariants({ variant: "outline" })}>
          <HeartHandshake aria-hidden />
          Interventions for this
        </Link>
        <Link href={`/plan?condition=${encodeURIComponent(cond.id)}`} className={buttonVariants({ variant: "outline" })}>
          <ListTodo aria-hidden />
          Start a treatment plan
          <ArrowRight aria-hidden />
        </Link>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">
            Matched features ({s.matched.length})
          </h3>
          {matchedCore.length ? (
            <>
              <SubHeading>
                Core ({matchedCore.length} of {coreTotal})
              </SubHeading>
              <FeatureList items={matchedCore} kind="core" matched />
            </>
          ) : null}
          {matchedAssoc.length ? (
            <>
              <SubHeading>
                Associated ({matchedAssoc.length} of {assocTotal})
              </SubHeading>
              <FeatureList items={matchedAssoc} kind="associated" matched />
            </>
          ) : null}
          <p className="mt-2 text-xs text-muted">Feature weights are listed under “Why suggested”.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">
            Missing features ({s.missing.length})
          </h3>
          <SubHeading>
            Core ({missingCore.length} of {coreTotal})
          </SubHeading>
          {missingCore.length ? (
            <FeatureList items={missingCore} kind="core" matched={false} />
          ) : (
            <p className="mt-1.5 text-sm text-muted">All core features are present.</p>
          )}
          {missingAssoc.length ? (
            <>
              <SubHeading>
                Associated ({missingAssoc.length} of {assocTotal})
              </SubHeading>
              <Disclosure
                bordered={false}
                title={`${missingAssoc.length} associated feature${missingAssoc.length === 1 ? "" : "s"} not reported`}
                bodyClassName="pb-0"
              >
                <FeatureList items={missingAssoc} kind="associated" matched={false} />
              </Disclosure>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 rounded-xl bg-surface-2 p-4 sm:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardList aria-hidden className="size-4 text-muted" /> Measures
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {builtIn.map((m) => (
              <li key={m.id}>
                <Link href={`/measures/${m.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Run {m.shortName}
                </Link>
              </li>
            ))}
            {cond.measuresPending.map((m) => (
              <li key={m.url} className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1">
                <ExternalLink href={m.url}>{m.name}</ExternalLink>
                <Badge tone="warn">License pending</Badge>
              </li>
            ))}
            {builtIn.length === 0 && cond.measuresPending.length === 0 ? (
              <li className="basis-full text-muted">No measure linked yet.</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <FileText aria-hidden className="size-4 text-muted" /> Client handouts
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {handouts.map((h) => (
              <li key={h.id}>
                <Link href={`/handouts/${h.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {h.title}
                </Link>
              </li>
            ))}
            {handouts.length === 0 ? <li className="basis-full text-muted">No built-in handout yet; see Handouts for link-outs.</li> : null}
          </ul>
        </div>
      </div>

      <div className="mt-5">
        <Disclosure title="Why suggested" meta="how the score was computed">
          <p>
            Core features matched: <strong>{ex.coreHits}</strong> of {ex.coreCount} (weight {ex.coreMatched} of{" "}
            {ex.coreTotal}); at least {ex.minCore} expected. Associated features: weight {ex.assocMatched} of{" "}
            {ex.assocTotal}.
          </p>
          <p className="rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed">
            base = 100 × (0.7 × {ex.coreMatched}/{ex.coreTotal}
            {ex.assocTotal > 0 ? ` + 0.3 × ${ex.assocMatched}/${ex.assocTotal}` : ""}) = {ex.base.toFixed(1)}
            {ex.gates.map((g) => (
              <span key={g.label} className="block">
                × {g.multiplier} ({g.label.toLowerCase()})
              </span>
            ))}
            {ex.heldAt !== undefined ? (
              <>
                <span className="block">= {ex.raw} (rounded, 0–100)</span>
                <span className="block font-semibold">
                  held at score = {ex.heldAt} ({ex.holdReasons.join("; ") || "see the flags above"})
                </span>
              </>
            ) : (
              <span className="block font-semibold">score = {s.score} (rounded, 0–100)</span>
            )}
          </p>
          <div>
            <p className="font-semibold">Feature weights</p>
            <ul className="mt-1 grid gap-x-4 gap-y-1 text-muted sm:grid-cols-2">
              {[...s.matched, ...s.missing].map((f) => (
                <li key={f.symptomId}>
                  <span className="text-text">{f.label}</span> · {f.kind}, weight {f.weight}
                  {s.matched.includes(f) ? " · matched" : " · not reported"}
                </li>
              ))}
            </ul>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>
              Duration gate: {cond.durationGate.minWeeks > 0 ? `about ${cond.durationGate.minWeeks} weeks or more.` : "none."}{" "}
              {cond.durationGate.note}
            </li>
            <li>
              Distress or impairment {cond.impairmentRequired ? "is usually required for this pattern." : "is not used as a gate here."}
            </li>
            <li>
              Strength is capped at “possible” when fewer than {ex.minCore} core features are present. Suggestions under 15
              are not shown, and no match is ever forced.
            </li>
            <li>
              A match is held at “moderate” when supporting features are thin, when a feature this pattern requires is not
              documented, or when a red flag in the same input points elsewhere. Related features (for example, sleeping
              too little or too much) count once.
            </li>
            <li>The weights are app-authored and awaiting clinical review. They are not DSM-5-TR criteria.</li>
          </ul>
        </Disclosure>

        <Disclosure title="Rule-outs to consider" meta={`${cond.ruleOuts.length} items`}>
          <p className="text-muted">Tick as you consider each one. Ticks stay on this screen only and are not saved.</p>
          {ruleOutGroups.map((g) => (
            <fieldset key={g.t} className="space-y-1.5">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {g.t === "medical" ? "Medical" : g.t === "substance" ? "Substance or medication" : "Other mental health conditions"}
              </legend>
              {g.items.map((r) => (
                <label key={r.label} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-surface-2">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-accent" />
                  <span>
                    <span className="font-semibold">{r.label}</span>
                    <span className="block text-muted">{r.note}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </Disclosure>

        <Disclosure title="Differentials" meta={`${cond.differentials.length} items`}>
          <ul className="space-y-2.5">
            {cond.differentials.map((d) => (
              <li key={d.label}>
                <p className="font-semibold">
                  {d.label}
                  {d.icd10cm ? <span className="ml-2 font-mono text-xs font-semibold text-muted">{d.icd10cm}</span> : null}
                </p>
                <p className="text-muted">{d.distinguishing}</p>
              </li>
            ))}
          </ul>
        </Disclosure>

        {cond.specifiers.length ? (
          <Disclosure title="Specifiers and course notes" meta={`${cond.specifiers.length} items`}>
            <ul className="space-y-2.5">
              {cond.specifiers.map((sp) => (
                <li key={sp.label}>
                  <p className="font-semibold">{sp.label}</p>
                  <p className="text-muted">{sp.note}</p>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        {cond.comorbidities.length ? (
          <Disclosure title="Comorbidity" meta={`${cond.comorbidities.length} items`}>
            <ul className="space-y-2.5">
              {cond.comorbidities.map((c) => (
                <li key={c.label}>
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-muted">{c.note}</p>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        <Disclosure title="Cultural considerations" meta={`${cond.culturalNotes.length} notes`}>
          <ul className="list-disc space-y-1.5 pl-5">
            {cond.culturalNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Disclosure>

        <Disclosure title="Interventions" meta={`${cond.interventions.length} options`}>
          <ul className="space-y-3">
            {cond.interventions.map((iv) => (
              <li key={iv.name}>
                <p className="font-semibold">{iv.name}</p>
                <p className="text-muted">
                  <span className="font-semibold text-text">Evidence: </span>
                  {iv.evidence}
                </p>
                {iv.note ? <p className="text-muted">{iv.note}</p> : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Steps, scripts and cautions for each are in the{" "}
            <Link href={`/interventions?condition=${encodeURIComponent(cond.id)}`} className="font-semibold text-accent underline underline-offset-2">
              interventions library
            </Link>
            .
          </p>
        </Disclosure>

        {stats.length ? (
          <Disclosure title="Related statistics" meta={`${stats.length} cards`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {stats.map((st) => (
                <StatCard key={st.id} stat={st} compact headingLevel="h4" />
              ))}
            </div>
          </Disclosure>
        ) : null}

        <LazyPanel title="ICD-11 details (WHO)" meta="loads when opened" icon={Globe2}>
          <Icd11Panel codes={cond.icd11} conditionId={cond.id} />
        </LazyPanel>

        {cond.icd10cm[0] ? (
          <LazyPanel title="Psychoeducation links (MedlinePlus)" meta="loads when opened" icon={Newspaper}>
            <MedlinePlusPanel code={cond.icd10cm[0].code} conditionId={cond.id} />
          </LazyPanel>
        ) : null}

        <Disclosure title="Sources and review status" meta={`${cond.sources.length} sources`}>
          <SourcesList sources={cond.sources} />
          <Governance license={cond.license} lastVerified={cond.lastVerified} reviewedBy={cond.reviewedBy} />
        </Disclosure>
      </div>
    </article>
  );
}
