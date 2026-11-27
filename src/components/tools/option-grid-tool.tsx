"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, GraduationCap, NotebookPen } from "lucide-react";
import { isClientSafeText } from "@/lib/client-safe";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import {
  CLIENT_QUESTIONS,
  MAX_OPTIONS,
  PLAIN_MAX,
  PRIORITIES,
  WAIT_AND_REVIEW,
  clientOptionLabel,
  clientRows,
  minutesText,
  optionGridDoc,
  optionGridRecordsSubstanceUse,
  type OptionFacts,
  type PriorityId,
} from "@/lib/tools/option-grid";
import { useSession } from "@/state/session";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { ClinicianReviewBadge } from "@/components/content/content-meta";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { CheckRow } from "./check-row";
import { ExportActions } from "./export-actions";
import { ScrubbedText } from "./scrubbed-text";
import { useFlushRegistry, useLatest } from "./use-latest";

export interface GridCondition {
  id: string;
  name: string;
  sud: boolean;
  optionIds: string[];
}

type View = "clinician" | "client";
const VIEWS = [
  { value: "clinician", label: "Clinician view" },
  { value: "client", label: "Client view" },
] as const;

const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item));

/** Shared decision option grid. Choices live only in this screen's memory and clear with the session. */
export function OptionGridTool(props: { conditions: GridCondition[]; facts: Record<string, OptionFacts> }) {
  const { resetCount } = useSession();
  return <OptionGridInner key={resetCount} {...props} />;
}

function StepHeading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm text-accent">
        {n}
      </span>
      {children}
    </h2>
  );
}

function OptionGridInner({ conditions, facts }: { conditions: GridCondition[]; facts: Record<string, OptionFacts> }) {
  const { register, flushAll } = useFlushRegistry();
  const [view, setView] = React.useState<View>("clinician");
  const [conditionId, setConditionId] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [includeWait, setIncludeWait] = React.useState(false);
  const [plain, setPlain, plainRef] = useLatest<Record<string, string>>({});
  const [priorities, setPriorities] = React.useState<PriorityId[]>([]);
  const conditionSelectId = React.useId();
  const filterId = React.useId();
  const [filter, setFilter] = React.useState("");
  const filterField = useScrubbedField<HTMLInputElement>(filter, setFilter);

  const condition = conditions.find((c) => c.id === conditionId);
  const available = (condition?.optionIds ?? []).flatMap((id) => facts[id] ?? []);
  // Chosen options always stay in the list; the filter narrows the rest (it runs on this device only).
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const listed = available.filter(
    (o) => selected.includes(o.id) || words.every((w) => `${o.name} ${o.modality}`.toLowerCase().includes(w)),
  );
  const options: OptionFacts[] = [...selected.flatMap((id) => facts[id] ?? []), ...(includeWait ? [WAIT_AND_REVIEW] : [])];
  const atMax = selected.length >= MAX_OPTIONS;
  const docInput = () => ({ options, plain: plainRef.current, priorities, sud: condition?.sud ?? false });
  const sud = optionGridRecordsSubstanceUse({ options, plain, priorities, sud: condition?.sud ?? false });

  function chooseCondition(id: string) {
    setConditionId(id);
    setSelected([]);
    setIncludeWait(false);
    setPlain({});
    filterField.replace("");
  }

  return (
    <div className="space-y-6">
      <ChoiceGroup
        legend="Showing"
        hint="The client view names no diagnosis or code and leaves out clinical evidence notes."
        name="grid-view"
        value={view}
        options={VIEWS}
        onChange={(v) => {
          flushAll();
          setView(v);
        }}
        className="max-w-md"
      />

      {view === "clinician" ? (
        <>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <ClinicianReviewBadge />
              <span className="text-sm text-muted">Options are not ranked. Nothing is saved.</span>
            </div>
            <StepHeading n={1}>Choose the area of concern</StepHeading>
            <div className="space-y-1.5">
              <label htmlFor={conditionSelectId} className="block text-sm font-semibold">
                Possible condition under discussion
              </label>
              <select
                id={conditionSelectId}
                value={conditionId}
                onChange={(e) => chooseCondition(e.target.value)}
                className="block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text"
              >
                <option value="">Choose…</option>
                {conditions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted">The options come from the library interventions that list it.</p>
            </div>
            <p className="text-sm text-muted">
              Public decision aid for trauma treatments, for the client to explore:{" "}
              <ExternalLink href="https://www.ptsd.va.gov/apps/decisionaid/">PTSD Treatment Decision Aid</ExternalLink> (US
              Department of Veterans Affairs).
            </p>
          </Card>

          {condition ? (
            <Card className="space-y-4">
              <StepHeading n={2}>Pick up to {MAX_OPTIONS} options to compare</StepHeading>
              {available.length > 8 ? (
                <div className="space-y-1.5">
                  <label htmlFor={filterId} className="block text-sm font-semibold">
                    Filter the list
                  </label>
                  <input
                    id={filterId}
                    ref={filterField.ref}
                    type="search"
                    value={filterField.draft}
                    onChange={(e) => filterField.setDraft(e.target.value)}
                    onBlur={filterField.onBlur}
                    {...PRIVATE_TEXT_FIELD_PROPS}
                    placeholder="e.g., exposure, sleep, couples"
                    className="block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text placeholder:text-muted"
                  />
                  <p role="status" className="text-sm text-muted">
                    {listed.length} of {available.length} options shown.
                  </p>
                </div>
              ) : null}
              <fieldset className="space-y-2">
                <legend className="sr-only">Options from the library</legend>
                {listed.map((o) => (
                  <CheckRow
                    key={o.id}
                    checked={selected.includes(o.id)}
                    onChange={(on) => setSelected((l) => (on && atMax ? l : toggle(l, o.id, on)))}
                  >
                    <span className="font-semibold">{o.name}</span>
                    <span className="block text-muted">
                      {o.modality} · {minutesText(o.minutes).toLowerCase()}
                      {o.training ? " · trained clinicians only" : ""}
                    </span>
                  </CheckRow>
                ))}
              </fieldset>
              {atMax ? <p className="text-sm text-muted">Up to {MAX_OPTIONS} at a time. Untick one to choose another.</p> : null}
              <CheckRow checked={includeWait} onChange={setIncludeWait}>
                <span className="font-semibold">Also show: wait and review</span>
                <span className="block text-muted">{WAIT_AND_REVIEW.caution}</span>
              </CheckRow>
              {condition.sud ? (
                <Notice tone="warn" title="42 CFR Part 2">
                  <p>The client sheet for this area carries the notice: {DOC_PART2_NOTICE}</p>
                </Notice>
              ) : null}
            </Card>
          ) : null}

          {options.length ? (
            <section aria-labelledby="compare-heading" className="space-y-3">
              <h2 id="compare-heading" className="flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm text-accent">
                  3
                </span>
                Compare
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {options.map((o) => (
                  <li key={o.id}>
                    <ClinicianOptionCard option={o} plain={plain[o.id] ?? ""} onPlain={(clean) => setPlain((p) => ({ ...p, [o.id]: clean }))} register={register} />
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted">
                Next, switch to the client view, talk through what matters to them, and check understanding with teach-back.
              </p>
            </section>
          ) : null}
        </>
      ) : (
        <ClientView options={options} plain={plain} priorities={priorities} onPriorities={setPriorities} />
      )}

      {options.length ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Client sheet</h2>
          <p className="text-sm text-muted">
            Plain language, no diagnosis or code, a blank line for the name, what matters to the client, questions to ask and
            the crisis numbers.
          </p>
          {sud ? (
            <p className="text-sm font-medium">
              Carries the notice: {DOC_PART2_NOTICE}
            </p>
          ) : null}
          <ExportActions flushAll={flushAll} build={() => optionGridDoc(docInput())} pdfLabel="Download client sheet" />
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

function ClinicianOptionCard({
  option: o,
  plain,
  onPlain,
  register,
}: {
  option: OptionFacts;
  plain: string;
  onPlain: (clean: string) => void;
  register: ReturnType<typeof useFlushRegistry>["register"];
}) {
  const unsafe = plain.trim() !== "" && !isClientSafeText(plain);
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div>
        <h3 className="text-base font-semibold leading-snug">{o.name}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge>{o.modality}</Badge>
          {o.training ? (
            <Badge tone="warn">
              <GraduationCap aria-hidden className="size-3.5" /> Trained clinicians only
            </Badge>
          ) : null}
        </div>
      </div>
      <dl className="space-y-3">
        <Row label="What it involves">{o.purpose}</Row>
        <Row label="Session length">{minutesText(o.minutes)}</Row>
        <Row label="Between-session practice">{o.practice ? "Yes: the library has client handouts for it." : "No handout in the library."}</Row>
        <Row label="Evidence">{o.evidence}</Row>
        <Row label="Watch for">{o.caution}</Row>
      </dl>
      <ScrubbedText
        id={`plain-${o.id}`}
        label="In plain words, for the client (optional)"
        hint="What the client would actually do. Shown in the client view and on the sheet."
        value={plain}
        onCommit={onPlain}
        register={register}
        rows={2}
        maxLength={PLAIN_MAX}
      />
      {unsafe ? (
        <p className="text-sm font-medium text-warn-fg">
          This wording names a diagnosis, code or score, so the client view and sheet leave it out. Reword it in everyday language.
        </p>
      ) : null}
      {o.href ? (
        <Link href={o.href} className="mt-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2">
          Full entry: steps, cautions and sources
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </article>
  );
}

function ClientView({
  options,
  plain,
  priorities,
  onPriorities,
}: {
  options: OptionFacts[];
  plain: Record<string, string>;
  priorities: PriorityId[];
  onPriorities: (next: PriorityId[]) => void;
}) {
  if (!options.length) {
    return <p className="rounded-xl border border-border bg-surface-2 p-4 text-sm">Choose the options to compare in the clinician view first.</p>;
  }
  return (
    <div className="space-y-6">
      <Card className="space-y-2">
        <h2 className="text-xl font-semibold">Comparing your options</h2>
        <p className="text-base leading-relaxed text-muted">
          There is no single right choice. It depends on what matters most to you, and you can change your mind later.
        </p>
      </Card>
      <ul className="grid gap-3 md:grid-cols-2">
        {options.map((o, i) => (
          <li key={o.id}>
            <article className="h-full rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
              <h3 className="text-lg font-semibold leading-snug">{clientOptionLabel(o, i)}</h3>
              <dl className="mt-3 space-y-3">
                {clientRows(o, plain[o.id] ?? "").map((r) => (
                  <Row key={r.label} label={r.label}>
                    {r.value}
                  </Row>
                ))}
              </dl>
            </article>
          </li>
        ))}
      </ul>
      <Card className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-semibold">What matters most to you? Tick any that fit.</legend>
          {PRIORITIES.map((p) => (
            <CheckRow key={p.id} checked={priorities.includes(p.id)} onChange={(on) => onPriorities(toggle(priorities, p.id, on))}>
              {p.label}
            </CheckRow>
          ))}
        </fieldset>
      </Card>
      <Card className="space-y-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <NotebookPen aria-hidden className="size-4 text-muted" />
          Questions you can ask
        </h3>
        <ul className="list-disc space-y-1.5 pl-5 text-base leading-relaxed">
          {CLIENT_QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
