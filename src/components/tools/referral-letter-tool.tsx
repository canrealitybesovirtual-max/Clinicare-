"use client";
import * as React from "react";
import { getSymptom, measures } from "@/lib/content";
import { measureLine } from "@/lib/notes/note";
import { sessionMeasures } from "@/lib/notes/context";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import {
  REFERRAL_NOTE_MAX,
  REFERRAL_REASONS,
  REFERRAL_SERVICES,
  REFERRAL_TIMING,
  referralLetterDoc,
  referralRecordsSubstanceUse,
  type ReferralLetterInput,
  type ReferralReasonId,
  type ReferralServiceId,
  type ReferralTiming,
} from "@/lib/tools/referral-letter";
import { useSession } from "@/state/session";
import { SUD_SYMPTOM_IDS, useSymptomAnalysis } from "@/components/symptoms/analysis";
import { AdultOnly } from "@/components/measures/adult-only";
import { ClinicianReviewBadge } from "@/components/content/content-bits";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Notice } from "@/components/ui/notice";
import { CheckRow } from "./check-row";
import { ExportActions } from "./export-actions";
import { ScrubbedText } from "./scrubbed-text";
import { useFlushRegistry, useLatest } from "./use-latest";

const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item));

/** De-identified referral letter. Choices live only in this screen's memory. */
export function ReferralLetterTool({ sudPrompt }: { sudPrompt: React.ReactNode }) {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <ReferralLetterInner key={resetCount} sudPrompt={sudPrompt} />
    </AdultOnly>
  );
}

function StepHeading({ n, children, id }: { n: number; children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
      <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full bg-accent-soft text-sm text-accent">
        {n}
      </span>
      {children}
    </h2>
  );
}

function ReferralLetterInner({ sudPrompt }: { sudPrompt: React.ReactNode }) {
  const { state } = useSession();
  const analysis = useSymptomAnalysis();
  const { register, flushAll } = useFlushRegistry();

  const [serviceId, setServiceId] = React.useState<ReferralServiceId>("medication-evaluation");
  const [timing, setTiming] = React.useState<ReferralTiming>("routine");
  const [reasonIds, setReasonIds] = React.useState<ReferralReasonId[]>([]);
  const [concernIds, setConcernIds] = React.useState<string[]>([]);
  const [measureLines, setMeasureLines] = React.useState<string[]>([]);
  const [note, setNote, noteRef] = useLatest("");

  const sessionSymptoms = analysis.ids.flatMap((id) => getSymptom(id) ?? []);
  const results = sessionMeasures(measures, state.measureAnswers)
    .filter((m) => m.answered === m.items)
    .map(measureLine);

  const input = (latestNote: string): ReferralLetterInput => ({
    serviceId,
    timing,
    reasonIds,
    concerns: concernIds.flatMap((id) => getSymptom(id)?.label ?? []),
    measures: measureLines.filter((l) => results.includes(l)),
    note: latestNote,
    sessionSud: concernIds.some((id) => SUD_SYMPTOM_IDS.has(id)),
  });
  const sud = referralRecordsSubstanceUse(input(note));

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ClinicianReviewBadge />
          <span className="text-sm text-muted">No names, dates or contact details are typed. They are written by hand on the printout.</span>
        </div>
        <StepHeading n={1}>What are you requesting?</StepHeading>
        <div className="space-y-1.5">
          <label htmlFor="ref-service" className="block text-sm font-semibold">
            Requested service
          </label>
          <select
            id="ref-service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value as ReferralServiceId)}
            className="block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text"
          >
            {REFERRAL_SERVICES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <ChoiceGroup legend="Requested timing" name="ref-timing" value={timing} options={REFERRAL_TIMING} onChange={setTiming} />
        <p className="text-sm text-muted">
          Urgent safety concerns need your crisis protocol and a direct call, not a letter.
        </p>
      </Card>

      <Card className="space-y-4">
        <StepHeading n={2}>Why are you referring?</StepHeading>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Reasons</legend>
          {REFERRAL_REASONS.map((r) => (
            <CheckRow key={r.id} checked={reasonIds.includes(r.id)} onChange={(on) => setReasonIds((l) => toggle(l, r.id, on))}>
              {r.label}
            </CheckRow>
          ))}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Documented this session (optional)</legend>
          {sessionSymptoms.length ? (
            sessionSymptoms.map((s) => (
              <CheckRow key={s.id} checked={concernIds.includes(s.id)} onChange={(on) => setConcernIds((l) => toggle(l, s.id, on))}>
                {s.label}
              </CheckRow>
            ))
          ) : (
            <p className="text-sm text-muted">No symptoms are documented in this session.</p>
          )}
        </fieldset>
      </Card>

      <Card className="space-y-4">
        <StepHeading n={3}>Screening results</StepHeading>
        {results.length ? (
          <fieldset className="space-y-2">
            <legend className="sr-only">Completed measures to include</legend>
            {results.map((line) => (
              <CheckRow key={line} checked={measureLines.includes(line)} onChange={(on) => setMeasureLines((l) => toggle(l, line, on))}>
                {line}
              </CheckRow>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-muted">No completed GAD-7 or PHQ-9 in this session.</p>
        )}
      </Card>

      <Card className="space-y-4">
        <StepHeading n={4}>Anything else (optional)</StepHeading>
        <ScrubbedText
          id="ref-note"
          label="Short note to the receiving clinician"
          hint="For example, what has been tried. No names, dates, places or contact details."
          value={note}
          onCommit={setNote}
          register={register}
          rows={3}
          maxLength={REFERRAL_NOTE_MAX}
        />
      </Card>

      {sud ? (
        <div className="space-y-3">
          <Notice tone="warn" title="42 CFR Part 2">
            <p>
              This letter includes substance-use content. It carries the notice “{DOC_PART2_NOTICE}” and a reminder that
              Part 2 consent rules apply before you send it.
            </p>
          </Notice>
          {sudPrompt}
        </div>
      ) : null}

      <Card className="space-y-4">
        <StepHeading n={5}>Export</StepHeading>
        <p className="text-sm text-muted">
          The letter has blank lines for the client’s name and date of birth and for your own details, a consent check
          box, and the disclaimer on every page. Get the client’s written authorization before sending.
        </p>
        <ExportActions flushAll={flushAll} build={() => referralLetterDoc(input(noteRef.current))} />
      </Card>
    </div>
  );
}
