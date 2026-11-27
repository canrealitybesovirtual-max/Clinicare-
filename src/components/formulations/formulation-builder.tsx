"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, Eraser, ShieldAlert } from "lucide-react";
import { getSymptom, measures } from "@/lib/content";
import { sessionMeasures } from "@/lib/notes/context";
import {
  EMPTY_DRAFT,
  chipsByDomain,
  hasWork,
  includedPrefill,
  partDraft,
  sessionPrefill,
  setPartText,
  suggestInterventions,
  toggleChip,
  togglePrefill,
  worksheetDoc,
  worksheetRecordsSubstanceUse,
  type InterventionSuggestion,
  type PrefillItem,
  type WorksheetChip,
  type WorksheetDraft,
  type WorksheetLibrary,
  type WorksheetPart,
  type WorksheetTemplate,
} from "@/lib/formulation/worksheet";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import { useSession } from "@/state/session";
import { SUD_SYMPTOM_IDS, useSymptomAnalysis } from "@/components/symptoms/analysis";
import { AdultOnly } from "@/components/measures/adult-only";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { ClinicianReviewBadge } from "@/components/content/content-meta";
import { ExportActions } from "@/components/tools/export-actions";
import { ScrubbedText } from "@/components/tools/scrubbed-text";
import { CheckRow } from "@/components/tools/check-row";
import { useFlushRegistry, useLatest } from "@/components/tools/use-latest";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";
import { ChipToggle } from "./chip-toggle";

const NOTE_MAX = 800;
const PRIVACY_HINT = "Kinds of people and places only: no names, dates or contact details.";
/** Linked interventions shown before "Show more". */
const SUGGESTIONS_SHOWN = 6;

export interface FormulationBuilderProps {
  templates: WorksheetTemplate[];
  library: WorksheetLibrary;
  /** Ethics & Legal Hub prompt for substance-use content (server-rendered). */
  sudPrompt: React.ReactNode;
}

/** Formulation worksheet. Drafts live only in this screen's memory; Clear session and the idle wipe remount it. */
export function FormulationBuilder(props: FormulationBuilderProps) {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <BuilderInner key={resetCount} {...props} />
    </AdultOnly>
  );
}

/** Reads ?template=<id> (the link on a framework page). Only a worksheet framework id is acted on. */
function TemplateParam({ ids, onValue }: { ids: readonly string[]; onValue: (id: string) => void }) {
  const raw = useSearchParams().get("template");
  React.useEffect(() => {
    const id = ids.find((x) => x === raw);
    if (id) onValue(id);
  }, [raw, ids, onValue]);
  return null;
}

function BuilderInner({ templates, library, sudPrompt }: FormulationBuilderProps) {
  const { state } = useSession();
  const analysis = useSymptomAnalysis();
  const { register, flushAll } = useFlushRegistry();
  const [templateId, setTemplateId] = React.useState(templates[0]!.id);
  const [drafts, updateDrafts, draftsRef] = useLatest<Record<string, WorksheetDraft>>({});
  const [confirmClear, setConfirmClear] = React.useState(false);
  // Bumped on clear so the note fields remount empty.
  const [generation, setGeneration] = React.useState(0);

  const templateIds = React.useMemo(() => templates.map((t) => t.id), [templates]);
  const template = templates.find((t) => t.id === templateId) ?? templates[0]!;
  const draft = drafts[template.id] ?? EMPTY_DRAFT;

  const sessionScores = React.useMemo(() => sessionMeasures(measures, state.measureAnswers), [state.measureAnswers]);
  const items: PrefillItem[] = React.useMemo(
    () =>
      sessionPrefill(
        { symptoms: analysis.ids.flatMap((id) => getSymptom(id) ?? []), cultural: analysis.cultural, measures: sessionScores },
        SUD_SYMPTOM_IDS,
      ),
    [analysis, sessionScores],
  );
  const safety = [
    ...analysis.redFlags.flatMap((g) => g.symptoms.map((s) => s.label)),
    ...sessionScores.flatMap((m) => m.riskMessages.map((r) => `${m.shortName}: ${r}`)),
  ];

  const update = (fn: (d: WorksheetDraft) => WorksheetDraft) =>
    updateDrafts((all) => ({ ...all, [template.id]: fn(all[template.id] ?? EMPTY_DRAFT) }));

  const chooseTemplate = React.useCallback(
    (id: string) => {
      flushAll();
      setTemplateId(id);
      setConfirmClear(false);
    },
    [flushAll],
  );

  function clear() {
    updateDrafts((all) => ({ ...all, [template.id]: EMPTY_DRAFT }));
    setGeneration((g) => g + 1);
    setConfirmClear(false);
  }

  const sud = worksheetRecordsSubstanceUse(template, draft, items);
  const suggestions = suggestInterventions(template, draft, library);
  const symptomCount = items.filter((i) => !i.id.startsWith("measure:")).length;
  const prefillLine = items.length
    ? `This session: ${symptomCount} documented ${symptomCount === 1 ? "symptom" : "symptoms"}, ${sessionScores.length} ${sessionScores.length === 1 ? "measure" : "measures"}.`
    : null;

  return (
    <div className="space-y-6">
      <React.Suspense fallback={null}>
        <TemplateParam ids={templateIds} onValue={chooseTemplate} />
      </React.Suspense>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ClinicianReviewBadge />
          <p className="text-sm text-muted">
            {prefillLine ?? (
              <>
                Nothing from this session to prefill yet. Use the worksheet as it is, or{" "}
                <Link href="/symptoms" className="font-semibold text-accent underline underline-offset-2">
                  add symptoms first
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <ChoiceGroup
          legend="Framework"
          hint="Each keeps its own draft while you switch."
          name="formulation-template"
          value={template.id}
          options={templates.map((t) => ({ value: t.id, label: t.shortName }))}
          onChange={chooseTemplate}
        />
        <p className="text-sm">
          <Link
            href={`/formulations/${template.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
          >
            <BookOpen aria-hidden className="size-4" />
            How to use the {template.shortName}
            <span className="sr-only"> ({template.name})</span>
          </Link>
        </p>
      </Card>

      {safety.length ? (
        <Notice tone="crisis" title="Safety first" icon={ShieldAlert}>
          <p>This session documents:</p>
          <ul className="list-disc space-y-1 pl-5">
            {safety.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>
            The worksheet does not assess or decide risk. Follow your own assessment and protocol first, and consider a{" "}
            <Link href="/tools/safety-plan" className="font-semibold underline underline-offset-2">
              safety plan
            </Link>
            .
          </p>
          <CrisisInline />
        </Notice>
      ) : null}

      <ol className="space-y-5" aria-label={`${template.name}: parts`}>
        {template.parts.map((part) => (
          <li key={`${template.id}-${generation}-${part.id}`}>
            <PartCard
              part={part}
              draft={partDraft(draft, part.id)}
              library={library}
              prefill={items}
              register={register}
              onToggleChip={(id) => update((d) => toggleChip(d, part.id, id))}
              onTogglePrefill={(id) => update((d) => togglePrefill(d, part.id, id))}
              onText={(clean) => update((d) => setPartText(d, part.id, clean))}
            />
          </li>
        ))}
      </ol>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Substance use</h2>
        <CheckRow checked={draft.substanceUse} onChange={(v) => update((d) => ({ ...d, substanceUse: v }))}>
          Substance use is part of this formulation
        </CheckRow>
        {sud ? (
          <div className="space-y-3">
            <Notice tone="warn" title="42 CFR Part 2">
              <p>Every copy and export of this worksheet carries the notice: {DOC_PART2_NOTICE}</p>
            </Notice>
            {sudPrompt}
          </div>
        ) : null}
      </Card>

      <Suggestions suggestions={suggestions} />

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Copy or export</h2>
        <p className="text-sm text-muted">
          The copy uses plain words that are safe to share, one blank “Client:” line to fill in by hand, the crisis lines
          and the disclaimer on every page. It never names a diagnosis. Nothing is saved: the worksheet clears when you
          leave this page, clear the session or close the tab.
        </p>
        <ExportActions
          flushAll={flushAll}
          build={() => worksheetDoc(template, draftsRef.current[template.id] ?? EMPTY_DRAFT, library, items)}
        />
        <div className="border-t border-border pt-4">
          {confirmClear ? (
            <div className="space-y-2" role="group" aria-labelledby="clear-question">
              <p id="clear-question" className="text-sm font-semibold">
                Clear everything in the {template.shortName} worksheet?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={clear}>
                  Clear the worksheet
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmClear(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirmClear(true)} disabled={!hasWork(draft)}>
              <Eraser aria-hidden />
              Clear this worksheet
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function PartCard({
  part,
  draft,
  library,
  prefill,
  register,
  onToggleChip,
  onTogglePrefill,
  onText,
}: {
  part: WorksheetPart;
  draft: ReturnType<typeof partDraft>;
  library: WorksheetLibrary;
  prefill: readonly PrefillItem[];
  register: ReturnType<typeof useFlushRegistry>["register"];
  onToggleChip: (id: string) => void;
  onTogglePrefill: (id: string) => void;
  onText: (clean: string) => void;
}) {
  const headingId = `part-${part.id}`;
  const factorChips = part.factorIds.flatMap((id) => library.factors[id] ?? []);
  const functionChips = part.functionChips ? Object.values(library.functions) : [];
  const hasChips = factorChips.length > 0 || functionChips.length > 0 || (part.prefill && prefill.length > 0);
  const chipList = (chips: readonly WorksheetChip[]) => (
    <ul className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <li key={c.id} className="max-w-full">
          <ChipToggle pressed={draft.chips.includes(c.id)} onToggle={() => onToggleChip(c.id)}>
            {c.label}
          </ChipToggle>
        </li>
      ))}
    </ul>
  );

  const fieldId = `ws-${part.id}`;
  // A part with nothing to tap is just a field: its title is the field's label.
  if (!hasChips && part.text) {
    return (
      <Card>
        <ScrubbedText
          id={fieldId}
          label={part.label}
          heading="h2"
          hint={`${part.prompt}${part.example ? ` For example: ${part.example}` : ""} ${PRIVACY_HINT}`}
          value={draft.text}
          onCommit={onText}
          register={register}
          rows={3}
          maxLength={NOTE_MAX}
        />
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="space-y-1.5">
        <h2 id={headingId} className="text-base font-semibold">
          {part.label}
        </h2>
        <p className="text-sm leading-relaxed text-muted">{part.prompt}</p>
        {part.example ? <p className="text-sm text-muted">For example: {part.example}</p> : null}
      </div>

      {part.prefill && prefill.length ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">From this session (tap to leave one out)</legend>
          <ul className="flex flex-wrap gap-2">
            {prefill.map((i) => (
              <li key={i.id} className="max-w-full">
                <ChipToggle pressed={!draft.excluded.includes(i.id)} onToggle={() => onTogglePrefill(i.id)}>
                  {i.text}
                </ChipToggle>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{includedPrefill(prefill, draft).length} of {prefill.length} included.</p>
        </fieldset>
      ) : null}

      {factorChips.length ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Common factors (tap any that fit)</legend>
          {part.groupByDomain
            ? chipsByDomain(factorChips).map((g) => (
                <div key={g.domain} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</p>
                  {chipList(g.chips)}
                </div>
              ))
            : chipList(factorChips)}
        </fieldset>
      ) : null}

      {functionChips.length ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">What the behavior may do for the person</legend>
          {chipList(functionChips)}
        </fieldset>
      ) : null}

      {part.text ? (
        <ScrubbedText
          id={fieldId}
          label="In your own words (optional)"
          hint={PRIVACY_HINT}
          value={draft.text}
          onCommit={onText}
          register={register}
          rows={3}
          maxLength={NOTE_MAX}
        />
      ) : null}
    </Card>
  );
}

function Suggestions({ suggestions }: { suggestions: InterventionSuggestion[] }) {
  const first = suggestions.slice(0, SUGGESTIONS_SHOWN);
  const rest = suggestions.slice(SUGGESTIONS_SHOWN);
  return (
    <section aria-labelledby="ws-suggestions">
      <Card className="space-y-4">
        <div className="space-y-2">
          <ClinicianReviewBadge />
          <h2 id="ws-suggestions" className="text-lg font-semibold">
            Possible interventions to discuss
          </h2>
          <p className="text-sm text-muted">
            Listed because they are linked to the factors you tapped, most links first. Not a ranking and not a treatment
            decision: choose within your training, the evidence and the person’s preferences.
          </p>
        </div>
        {suggestions.length ? (
          <>
            <SuggestionList items={first} />
            {rest.length ? (
              <Disclosure title={`Show ${rest.length} more`} bordered={false} className="rounded-xl border border-border px-4">
                <SuggestionList items={rest} />
              </Disclosure>
            ) : null}
          </>
        ) : (
          <p className="rounded-xl bg-surface-2 p-3 text-sm">Tap factors or functions above to see the interventions linked to them.</p>
        )}
      </Card>
    </section>
  );
}

function SuggestionList({ items }: { items: InterventionSuggestion[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((s) => (
        <li key={s.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
          <Link
            href={`/interventions/${s.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
          >
            {s.name}
            <ArrowRight aria-hidden className="size-4 shrink-0" />
          </Link>
          <p className="text-sm">
            <span className="font-semibold">Linked to:</span> {s.linked.map((c) => c.label).join("; ")}
          </p>
          {s.alsoTargets.length ? (
            <p className="text-sm text-muted">
              <span className="font-semibold">Also works on:</span> {s.alsoTargets.map((c) => c.label).join("; ")}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

