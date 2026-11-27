"use client";
import * as React from "react";
import { Check, Scale } from "lucide-react";
import {
  ROI_DIRECTIONS,
  ROI_GOVERNANCE,
  ROI_HIPAA_ELEMENTS,
  ROI_INFO,
  ROI_NOTE_MAX,
  ROI_PART2_ELEMENTS,
  ROI_PURPOSES,
  ROI_RECORD_KINDS,
  ROI_SOURCES,
  roiDoc,
  roiIncludesPart2,
  type RoiDirection,
  type RoiInfoId,
  type RoiInput,
  type RoiPurposeId,
  type RoiRecordKind,
} from "@/lib/tools/release-of-information";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import { useSession } from "@/state/session";
import { AdultOnly } from "@/components/measures/adult-only";
import { ClinicianReviewBadge, Governance, SourcesList } from "@/components/content/content-meta";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";
import { CheckRow } from "./check-row";
import { ExportActions } from "./export-actions";
import { ScrubbedText } from "./scrubbed-text";
import { useFlushRegistry, useLatest } from "./use-latest";

const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item));

/** Authorization form builder. Choices live only in this screen's memory; identifiers are written by hand. */
export function ReleaseOfInformationTool({ sudPrompt }: { sudPrompt: React.ReactNode }) {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <RoiInner key={resetCount} sudPrompt={sudPrompt} />
    </AdultOnly>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full bg-accent-soft text-sm text-accent">
        {n}
      </span>
      {children}
    </h2>
  );
}

function RoiInner({ sudPrompt }: { sudPrompt: React.ReactNode }) {
  const { register, flushAll } = useFlushRegistry();
  const [recordKind, setRecordKind] = React.useState<RoiRecordKind>("general");
  const [direction, setDirection] = React.useState<RoiDirection>("release");
  const [infoIds, setInfoIds] = React.useState<RoiInfoId[]>([]);
  const [purposeIds, setPurposeIds] = React.useState<RoiPurposeId[]>([]);
  const [note, setNote, noteRef] = useLatest("");

  const input = (latestNote: string): RoiInput => ({ recordKind, direction, infoIds, purposeIds, note: latestNote });
  const part2 = roiIncludesPart2(input(note));

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ClinicianReviewBadge />
          <span className="text-sm text-muted">Names, dates and signatures are written by hand on the printout.</span>
        </div>
        <Step n={1}>Which records?</Step>
        <ChoiceGroup
          legend="Records covered"
          hint="Psychotherapy notes need their own authorization; they cannot share a form with other records."
          name="roi-kind"
          value={recordKind}
          options={ROI_RECORD_KINDS}
          onChange={setRecordKind}
        />
        <ChoiceGroup legend="Direction" name="roi-direction" value={direction} options={ROI_DIRECTIONS} onChange={setDirection} />
      </Card>

      {recordKind === "general" ? (
        <Card className="space-y-3">
          <Step n={2}>What information?</Step>
          <p className="text-sm text-muted">Tick only what the recipient needs (minimum necessary).</p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Information to be shared</legend>
            {ROI_INFO.map((i) => (
              <CheckRow key={i.id} checked={infoIds.includes(i.id)} onChange={(on) => setInfoIds((l) => toggle(l, i.id, on))}>
                {i.label}
              </CheckRow>
            ))}
          </fieldset>
        </Card>
      ) : (
        <Notice tone="info" title="Psychotherapy notes form">
          <p>
            This form covers psychotherapy notes only. Make a separate authorization for any other records, and confirm that
            the client understands what psychotherapy notes are.
          </p>
        </Notice>
      )}

      <Card className="space-y-3">
        <Step n={recordKind === "general" ? 3 : 2}>Why is it being shared?</Step>
        <fieldset className="space-y-2">
          <legend className="sr-only">Purpose</legend>
          {ROI_PURPOSES.map((p) => (
            <CheckRow key={p.id} checked={purposeIds.includes(p.id)} onChange={(on) => setPurposeIds((l) => toggle(l, p.id, on))}>
              {p.label}
            </CheckRow>
          ))}
        </fieldset>
        <ScrubbedText
          id="roi-limits"
          label="Limits (optional)"
          hint="For example, only records from the last year, or summaries only. No names, dates or places."
          value={note}
          onCommit={setNote}
          register={register}
          rows={2}
          maxLength={ROI_NOTE_MAX}
        />
      </Card>

      {part2 ? (
        <div className="space-y-3">
          <Notice tone="warn" title="42 CFR Part 2 consent">
            <p>The form includes substance use disorder records. It carries the notice: {DOC_PART2_NOTICE}</p>
            <p className="font-semibold">A Part 2 consent needs these points:</p>
            <ul className="list-disc space-y-1 pl-5">
              {ROI_PART2_ELEMENTS.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
          {sudPrompt}
        </div>
      ) : null}

      <Card className="space-y-3">
        <Disclosure title="What the form covers (HIPAA authorization content)" bordered={false} icon={Scale}>
          <ul className="space-y-2">
            {ROI_HIPAA_ELEMENTS.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
                <span>
                  <span className="font-semibold">{e.label}.</span> <span className="text-muted">{e.how}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted">
            State law may add requirements, for example for mental health, HIV, genetic or reproductive health
            information. Use your organization&apos;s own form when it has one. Not legal advice.
          </p>
        </Disclosure>
      </Card>

      <Card className="space-y-4">
        <Step n={recordKind === "general" ? 4 : 3}>Print the form</Step>
        <p className="text-sm text-muted">
          The form has blank lines for the client, provider, recipient, end date, signature and date, and the disclaimer on
          every page. Go through it with the client before they sign, and give them a copy.
        </p>
        <ExportActions flushAll={flushAll} kinds={["pdf", "docx", "copy"]} build={() => roiDoc(input(noteRef.current))} />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Sources</h2>
        <SourcesList sources={[...ROI_SOURCES]} />
        <Governance {...ROI_GOVERNANCE} />
      </Card>
    </div>
  );
}
