"use client";
import * as React from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { getSymptom, measures } from "@/lib/content";
import { noteContext } from "@/lib/notes/context";
import {
  IMPRESSIONS_LINE,
  NOTE_FORMATS,
  noteDoc,
  noteFormat,
  noteRecordsSubstanceUse,
  prefillNote,
  type NoteFormat,
  type NoteSection,
} from "@/lib/notes/note";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import { useSession } from "@/state/session";
import { useSymptomAnalysis } from "@/components/symptoms/analysis";
import { planRecordsSubstanceUse } from "@/components/plan/plan-model";
import { AdultOnly } from "@/components/measures/adult-only";
import { ClinicianReviewBadge } from "@/components/content/content-meta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Notice } from "@/components/ui/notice";
import { ExportActions } from "./export-actions";
import { ScrubbedText } from "./scrubbed-text";
import { useFlushRegistry, useLatest } from "./use-latest";

const NOTE_SECTION_MAX = 2000;
const FORMAT_CHOICES = NOTE_FORMATS.map((f) => ({ value: f.id, label: f.label }));

export interface NoteHelperProps {
  /** Intervention id -> name (library). */
  interventionNames: Record<string, string>;
  /** Plan libraries that are substance-use libraries (42 CFR Part 2). */
  sudPlanIds: string[];
  sudPrompt: React.ReactNode;
}

/** Session note helper. The draft lives only in this screen's memory; Clear session and the idle wipe remount it. */
export function NoteHelper(props: NoteHelperProps) {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <NoteHelperInner key={resetCount} {...props} />
    </AdultOnly>
  );
}

function NoteHelperInner({ interventionNames, sudPlanIds, sudPrompt }: NoteHelperProps) {
  const { state } = useSession();
  const analysis = useSymptomAnalysis();
  const { register, flushAll } = useFlushRegistry();

  const ctx = React.useMemo(
    () =>
      noteContext(
        {
          symptoms: analysis.ids.flatMap((id) => getSymptom(id) ?? []),
          cultural: analysis.cultural,
          redFlags: analysis.redFlags.flatMap((g) => g.symptoms),
          measureAnswers: state.measureAnswers,
          plan: state.plan,
        },
        measures,
        interventionNames,
      ),
    [analysis, state.measureAnswers, state.plan, interventionNames],
  );
  const sessionSud =
    analysis.sud || (state.plan ? planRecordsSubstanceUse(state.plan, { sud: sudPlanIds.includes(state.plan.conditionId) }) : false);

  const [format, setFormat] = React.useState<NoteFormat>("soap");
  const [drafts, updateDrafts, draftsRef] = useLatest<Partial<Record<NoteFormat, NoteSection[]>>>(() => ({
    soap: prefillNote("soap", ctx),
  }));
  const [sessionNumber, setSessionNumber] = React.useState("");
  const [confirmRefill, setConfirmRefill] = React.useState(false);
  // Bumped on refill so the fields remount with the new prefill.
  const [generation, setGeneration] = React.useState(0);

  const sections = drafts[format] ?? prefillNote(format, ctx);
  const sud = noteRecordsSubstanceUse(sections, sessionSud);

  function chooseFormat(next: NoteFormat) {
    flushAll();
    setFormat(next);
    setConfirmRefill(false);
    if (!draftsRef.current[next]) updateDrafts((d) => ({ ...d, [next]: prefillNote(next, ctx) }));
  }

  function commitSection(id: string, clean: string) {
    updateDrafts((d) => {
      const list = d[format] ?? prefillNote(format, ctx);
      return { ...d, [format]: list.map((s) => (s.id === id ? { ...s, text: clean } : s)) };
    });
  }

  function refill() {
    updateDrafts((d) => ({ ...d, [format]: prefillNote(format, ctx) }));
    setGeneration((g) => g + 1);
    setConfirmRefill(false);
  }

  const counts = [
    `${ctx.concerns.length} documented ${ctx.concerns.length === 1 ? "symptom" : "symptoms"}`,
    `${ctx.measures.length} ${ctx.measures.length === 1 ? "measure" : "measures"}`,
    `${ctx.interventions.length} ${ctx.interventions.length === 1 ? "intervention" : "interventions"}`,
    `${ctx.objectives.length} plan ${ctx.objectives.length === 1 ? "objective" : "objectives"}`,
  ].join(", ");
  const nothingYet = !ctx.concerns.length && !ctx.measures.length && !ctx.objectives.length && !ctx.interventions.length;
  const parsedSession = /^\d{1,3}$/.test(sessionNumber) && Number(sessionNumber) > 0 ? Number(sessionNumber) : null;

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ClinicianReviewBadge />
          <p className="text-sm text-muted">
            {nothingYet ? (
              <>
                Nothing from this session to prefill yet. Write the note here, or{" "}
                <Link href="/symptoms" className="font-semibold text-accent underline underline-offset-2">
                  add symptoms first
                </Link>
                .
              </>
            ) : (
              `Prefilled from this session: ${counts}.`
            )}
          </p>
        </div>
        <div className="grid grid-cols-[1fr_6.5rem] gap-4 sm:grid-cols-[1fr_12rem]">
          <ChoiceGroup
            legend="Note format"
            hint={noteFormat(format).expansion}
            name="note-format"
            value={format}
            options={FORMAT_CHOICES}
            onChange={chooseFormat}
          />
          <div className="space-y-1.5">
            <label htmlFor="note-session" className="block text-sm font-semibold">
              Session #
            </label>
            <p id="note-session-hint" className="-mt-0.5 text-xs text-muted">
              Optional. A number, never a date.
            </p>
            <input
              id="note-session"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={sessionNumber}
              onChange={(e) => setSessionNumber(e.target.value.replace(/\D/g, ""))}
              aria-describedby="note-session-hint"
              className="block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text"
            />
          </div>
        </div>
      </Card>

      {sud ? (
        <div className="space-y-3">
          <Notice tone="warn" title="42 CFR Part 2">
            <p>This note includes substance-use content. Every copy and export carries the notice: {DOC_PART2_NOTICE}</p>
          </Notice>
          {sudPrompt}
        </div>
      ) : null}

      <section aria-labelledby="note-sections" className="space-y-5">
        <h2 id="note-sections" className="sr-only">
          Note sections
        </h2>
        {sections.map((s) => (
          <Card key={`${format}-${generation}-${s.id}`}>
            <ScrubbedText
              id={`note-${format}-${s.id}`}
              label={s.heading}
              heading="h3"
              hint={s.hint}
              value={s.text}
              onCommit={(clean) => commitSection(s.id, clean)}
              register={register}
              rows={Math.min(12, Math.max(4, s.text.split("\n").length + 1))}
              maxLength={NOTE_SECTION_MAX}
            />
          </Card>
        ))}
        <p className="text-sm text-muted">
          The note never states a diagnosis. Write your own clinical impressions where it says “{IMPRESSIONS_LINE}”
        </p>
      </section>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Copy or export</h2>
        <p className="text-sm text-muted">
          The export has one blank “Client:” line to fill in by hand and the disclaimer on every page. This draft lives
          only on this screen: it clears when you leave the page, clear the session or close the tab.
        </p>
        <ExportActions
          flushAll={flushAll}
          build={() => {
            const latest = draftsRef.current[format] ?? sections;
            return noteDoc(format, latest, { sessionNumber: parsedSession, sud: noteRecordsSubstanceUse(latest, sessionSud) });
          }}
        />
        <div className="border-t border-border pt-4">
          {confirmRefill ? (
            <div className="space-y-2" role="group" aria-labelledby="refill-question">
              <p id="refill-question" className="text-sm font-semibold">
                Replace your edits in this {noteFormat(format).label} note with a fresh prefill from the session?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={refill}>
                  Replace with prefill
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmRefill(false)}>
                  Keep my edits
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirmRefill(true)}>
              <RotateCcw aria-hidden />
              Refill from session
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
