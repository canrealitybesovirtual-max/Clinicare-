"use client";
import * as React from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import {
  ACCOMMODATIONS,
  CONDITION_LINE,
  LETTER_DURATIONS,
  LETTER_GOVERNANCE,
  LETTER_NOTE_MAX,
  LETTER_SETTINGS,
  LETTER_SOURCES,
  LIMITATIONS,
  accommodationLetterDoc,
  letterIncludesSubstanceUse,
  relatedAccommodations,
  type AccommodationId,
  type AccommodationLetterInput,
  type ConditionLine,
  type LetterDuration,
  type LetterSetting,
  type LimitationId,
} from "@/lib/tools/accommodation-letter";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import { useSession } from "@/state/session";
import { AdultOnly } from "@/components/measures/adult-only";
import { ClinicianReviewBadge, Governance, SourcesList } from "@/components/content/content-meta";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { CheckRow } from "./check-row";
import { ExportActions } from "./export-actions";
import { ScrubbedText } from "./scrubbed-text";
import { useFlushRegistry, useLatest } from "./use-latest";

const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item));

/** Accommodation support letter: functional limits and requested changes, no diagnosis, identifiers by hand. */
export function AccommodationLetterTool() {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <LetterInner key={resetCount} />
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

function LetterInner() {
  const { register, flushAll } = useFlushRegistry();
  const [setting, setSetting] = React.useState<LetterSetting>("work");
  const [limitationIds, setLimitationIds] = React.useState<LimitationId[]>([]);
  const [accommodationIds, setAccommodationIds] = React.useState<AccommodationId[]>([]);
  const [duration, setDuration] = React.useState<LetterDuration>("temporary");
  const [conditionLine, setConditionLine] = React.useState<ConditionLine>("none");
  const [note, setNote, noteRef] = useLatest("");

  const related = relatedAccommodations(limitationIds);
  const input = (latestNote: string): AccommodationLetterInput => ({
    setting,
    limitationIds,
    accommodationIds,
    duration,
    conditionLine,
    note: latestNote,
  });
  const sud = letterIncludesSubstanceUse(input(note));

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ClinicianReviewBadge />
          <span className="text-sm text-muted">Describe what is harder and what would help, not a diagnosis.</span>
        </div>
        <Step n={1}>Where are the changes needed?</Step>
        <ChoiceGroup legend="Setting" name="letter-setting" value={setting} options={LETTER_SETTINGS} onChange={setSetting} />
        <Notice tone="neutral" icon={Info} title="Treating role only">
          <p>
            Write only what you know from treating the client, with their written consent. Requests to judge fitness for
            duty, disability status or work capacity are evaluator work; see the legal hub on treating and forensic roles.
            Leave requests usually use the employer&apos;s own certification form, not a letter.
          </p>
        </Notice>
      </Card>

      <Card className="space-y-3">
        <Step n={2}>What is harder at present?</Step>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Functional limitations</legend>
          {LIMITATIONS.map((l) => (
            <CheckRow key={l.id} checked={limitationIds.includes(l.id)} onChange={(on) => setLimitationIds((x) => toggle(x, l.id, on))}>
              {l.label}
            </CheckRow>
          ))}
        </fieldset>
      </Card>

      <Card className="space-y-3">
        <Step n={3}>What would help?</Step>
        <p className="text-sm text-muted">
          Changes marked as related fit a limitation you ticked. Choose with the client; the employer or school decides.
        </p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Requested changes</legend>
          {ACCOMMODATIONS.map((a) => (
            <CheckRow
              key={a.id}
              checked={accommodationIds.includes(a.id)}
              onChange={(on) => setAccommodationIds((x) => toggle(x, a.id, on))}
            >
              <span className="flex flex-wrap items-center gap-2">
                {a.label}
                {related.has(a.id) ? <Badge tone="accent">Related</Badge> : null}
              </span>
            </CheckRow>
          ))}
        </fieldset>
        <ScrubbedText
          id="letter-note"
          label="How these changes would help (optional)"
          hint="One or two sentences about function. No diagnosis, names, dates or places."
          value={note}
          onCommit={setNote}
          register={register}
          rows={3}
          maxLength={LETTER_NOTE_MAX}
        />
      </Card>

      <Card className="space-y-4">
        <Step n={4}>Duration and privacy</Step>
        <ChoiceGroup legend="How long" name="letter-duration" value={duration} options={LETTER_DURATIONS} onChange={setDuration} />
        <ChoiceGroup
          legend="Naming the condition"
          hint="Most requests need functional information only. Use the blank line only if the process requires it and the client agrees in writing."
          name="letter-condition"
          value={conditionLine}
          options={CONDITION_LINE}
          onChange={setConditionLine}
        />
      </Card>

      {sud ? (
        <Notice tone="warn" title="42 CFR Part 2">
          <p>The note mentions substance use. The letter carries the notice: {DOC_PART2_NOTICE} Check Part 2 consent rules before sending.</p>
        </Notice>
      ) : null}

      <Card className="space-y-4">
        <Step n={5}>Print the letter</Step>
        <p className="text-sm text-muted">
          Blank lines for the recipient, client, dates and your details, a consent check box and the disclaimer on every
          page. Read it through with the client before it is sent.
        </p>
        <ExportActions flushAll={flushAll} build={() => accommodationLetterDoc(input(noteRef.current))} />
      </Card>

      <Card className="space-y-3">
        <Disclosure title="Help the client prepare, and further reading" bordered={false}>
          <p>
            The client handout{" "}
            <Link href="/handouts/asking-for-changes-at-work" className="font-semibold text-accent underline underline-offset-2">
              Asking for changes at work
            </Link>{" "}
            helps them think through what to ask for and how much to share.
          </p>
          <ul className="space-y-1">
            <li>
              <ExternalLink href="https://askjan.org/" className="inline-flex min-h-11 items-center">
                Job Accommodation Network: accommodation ideas by limitation
              </ExternalLink>
            </li>
            <li>
              <ExternalLink
                href="https://www.eeoc.gov/laws/guidance/mental-health-providers-role-clients-request-reasonable-accommodation-work"
                className="inline-flex min-h-11 items-center"
              >
                EEOC: the mental health provider&apos;s role in an accommodation request
              </ExternalLink>
            </li>
          </ul>
        </Disclosure>
        <SourcesList sources={[...LETTER_SOURCES]} />
        <Governance {...LETTER_GOVERNANCE} />
      </Card>
    </div>
  );
}
