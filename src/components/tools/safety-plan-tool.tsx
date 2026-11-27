"use client";
import * as React from "react";
import { PenLine, Phone } from "lucide-react";
import {
  SAFETY_PLAN_GOVERNANCE,
  SAFETY_PLAN_ORIGIN_NOTE,
  SAFETY_PLAN_SECTIONS,
  SAFETY_PLAN_SOURCES,
  SAFETY_PLAN_TYPED_MAX,
  STANLEY_BROWN_URL,
  safetyPlanDoc,
  safetyPlanMentionsSubstances,
  type SafetyPlanEntries,
  type SafetyPlanSectionId,
} from "@/lib/tools/safety-plan";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import { useSession } from "@/state/session";
import { AdultOnly } from "@/components/measures/adult-only";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { ClinicianReviewBadge, Governance, SourcesList } from "@/components/content/content-bits";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { ExportActions } from "./export-actions";
import { ScrubbedText } from "./scrubbed-text";
import { useFlushRegistry, useLatest } from "./use-latest";

/** Collaborative safety-planning worksheet. Typed parts live only in this screen's memory. */
export function SafetyPlanTool() {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <SafetyPlanInner key={resetCount} />
    </AdultOnly>
  );
}

function SafetyPlanInner() {
  const { register, flushAll } = useFlushRegistry();
  const [entries, updateEntries, entriesRef] = useLatest<SafetyPlanEntries>({});
  const commit = (id: SafetyPlanSectionId) => (clean: string) => updateEntries((e) => ({ ...e, [id]: clean }));
  const sud = safetyPlanMentionsSubstances(entries);

  return (
    <div className="space-y-6">
      <Notice tone="crisis" title="Crisis first">
        <p>
          If the client may act on thoughts of suicide now, follow your crisis protocol before planning. This worksheet
          does not assess, score or decide risk; use it alongside your own assessment.
        </p>
        <CrisisInline />
      </Notice>

      <div className="space-y-2">
        <ClinicianReviewBadge />
        <p className="leading-relaxed">
          Work through the parts together, in the client’s own words, one idea per line. Names, phone numbers and
          addresses are never typed: the printed copy has blank lines to write them by hand.
        </p>
      </div>

      <ol className="space-y-5" aria-label="Safety plan parts">
        {SAFETY_PLAN_SECTIONS.map((s) => (
          <li key={s.id}>
            <Card className="space-y-3">
              {s.typed ? (
                <ScrubbedText
                  id={`sp-${s.id}`}
                  label={s.heading}
                  hint={s.prompt}
                  heading="h2"
                  value={entries[s.id] ?? ""}
                  onCommit={commit(s.id)}
                  register={register}
                  rows={3}
                  maxLength={SAFETY_PLAN_TYPED_MAX}
                />
              ) : (
                <>
                  <h2 className="text-base font-semibold">{s.heading}</h2>
                  <p className="text-sm text-muted">{s.prompt}</p>
                </>
              )}
              {s.fixed ? (
                <ul className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
                  {s.fixed.map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <Phone aria-hidden className="mt-1 size-4 shrink-0 text-crisis" />
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
              {s.handwritten ? (
                <p className="flex items-start gap-2 text-sm text-muted">
                  <PenLine aria-hidden className="mt-0.5 size-4 shrink-0" />
                  The printed copy has {s.handwritten.rows} blank {s.handwritten.rows === 1 ? "line" : "lines"} to write by hand.
                </p>
              ) : null}
            </Card>
          </li>
        ))}
      </ol>

      {sud ? (
        <Notice tone="warn" title="42 CFR Part 2">
          <p>The plan mentions alcohol or other substances. The printed copy carries the notice: {DOC_PART2_NOTICE}</p>
        </Notice>
      ) : null}

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Print the client’s copy</h2>
        <p className="text-sm text-muted">
          The PDF has the client’s typed ideas, blank lines for names and numbers, the crisis lines and the disclaimer on
          every page. Nothing is saved: the plan clears when you leave this page.
        </p>
        <ExportActions
          flushAll={flushAll}
          kinds={["pdf", "docx"]}
          pdfLabel="Download PDF"
          build={() => safetyPlanDoc(entriesRef.current)}
        />
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm text-muted">Prefer to write everything by hand?</p>
          <ExportActions flushAll={() => {}} kinds={["pdf"]} pdfLabel="Download blank PDF" quiet build={() => safetyPlanDoc({})} />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">About this worksheet</h2>
        <p className="text-sm text-muted">
          {SAFETY_PLAN_ORIGIN_NOTE} Official Stanley–Brown materials and training:{" "}
          <ExternalLink href={STANLEY_BROWN_URL}>suicidesafetyplan.com</ExternalLink>
        </p>
        <SourcesList sources={[...SAFETY_PLAN_SOURCES]} />
        <Governance {...SAFETY_PLAN_GOVERNANCE} />
      </Card>
    </div>
  );
}
