"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ListChecks } from "lucide-react";
import {
  PRECAUTION_CONTEXTS,
  PRECAUTION_SOURCES,
  PRECAUTIONS_GOVERNANCE,
  precautionsFor,
  type InterventionCautions,
  type PrecautionContextId,
} from "@/lib/tools/precautions";
import { useSession } from "@/state/session";
import { AdultOnly } from "@/components/measures/adult-only";
import { ClinicianReviewBadge, Governance, SourcesList } from "@/components/content/content-meta";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { CheckRow } from "./check-row";

const ALL = "all";

/** Context tick boxes -> curated, sourced notes and the library's own cautions. Memory only; never decides. */
export function PrecautionsTool({ interventions }: { interventions: readonly InterventionCautions[] }) {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <PrecautionsInner key={resetCount} interventions={interventions} />
    </AdultOnly>
  );
}

function PrecautionsInner({ interventions }: { interventions: readonly InterventionCautions[] }) {
  const [ticked, setTicked] = React.useState<PrecautionContextId[]>([]);
  const [only, setOnly] = React.useState<string>(ALL);

  const groups = React.useMemo(
    () =>
      PRECAUTION_CONTEXTS.filter((c) => ticked.includes(c.id)).map((c) => ({ context: c, entries: precautionsFor(c.id, interventions) })),
    [ticked, interventions],
  );
  const withNotes = React.useMemo(() => {
    const byId = new Map<string, string>();
    for (const g of groups) for (const e of g.entries) byId.set(e.interventionId, e.name);
    return [...byId].sort((a, b) => a[1].localeCompare(b[1]));
  }, [groups]);
  const filter = only !== ALL && withNotes.some(([id]) => id === only) ? only : ALL;

  const toggle = (id: PrecautionContextId, on: boolean) =>
    setTicked((list) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id)));

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ClinicianReviewBadge />
          <span className="text-sm text-muted">Notes to weigh, never a rule-in or rule-out.</span>
        </div>
        <fieldset>
          <legend className="mb-2 text-base font-semibold">What applies to this client?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRECAUTION_CONTEXTS.map((c) => (
              <CheckRow key={c.id} checked={ticked.includes(c.id)} onChange={(on) => toggle(c.id, on)}>
                {c.label}
              </CheckRow>
            ))}
          </div>
        </fieldset>
        <p className="text-sm text-muted">Tick boxes only; nothing is typed, saved or sent.</p>
      </Card>

      <div aria-live="polite" className="sr-only">
        {groups.length
          ? `Notes shown for ${groups.length} ${groups.length === 1 ? "context" : "contexts"}.`
          : "Tick a box to see notes."}
      </div>

      {groups.length === 0 ? (
        <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">
          <ListChecks aria-hidden className="mt-0.5 size-4 shrink-0" />
          Tick one or more boxes to see which interventions have notes for that context.
        </p>
      ) : (
        <>
          {withNotes.length > 1 ? (
            <div className="space-y-1.5">
              <label htmlFor="precautions-only" className="block text-sm font-semibold">
                Show notes for
              </label>
              <select
                id="precautions-only"
                value={filter}
                onChange={(e) => setOnly(e.target.value)}
                className="block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text sm:max-w-md"
              >
                <option value={ALL}>All interventions with notes ({withNotes.length})</option>
                {withNotes.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {groups.map(({ context, entries }) => {
            const shown = filter === ALL ? entries : entries.filter((e) => e.interventionId === filter);
            const headingId = `prec-${context.id}`;
            return (
              <section key={context.id} aria-labelledby={headingId}>
                <Card className="space-y-2">
                  <h2 id={headingId} className="text-lg font-semibold">
                    {context.label}
                  </h2>
                  <p className="text-sm text-muted">
                    {shown.length
                      ? `${shown.length} ${shown.length === 1 ? "intervention has" : "interventions have"} notes for this. Interventions not listed have no note here; that does not mean they are safe for everyone.`
                      : "The selected intervention has no note for this context."}
                  </p>
                  <div>
                    {shown.map((e) => (
                      <Disclosure
                        key={e.interventionId}
                        title={e.name}
                        meta={[
                          e.notes.length ? `${e.notes.length} sourced ${e.notes.length === 1 ? "note" : "notes"}` : null,
                          e.cautionLines.length ? `${e.cautionLines.length} from its cautions` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        {e.notes.map((n) => (
                          <div key={n.id} className="space-y-1.5 rounded-xl border border-accent/30 bg-accent-soft p-3">
                            <p>{n.note}</p>
                            <ul className="space-y-1 text-xs text-muted">
                              {n.sources.map((s) => (
                                <li key={s.url} className="flex items-start gap-1.5">
                                  <BookOpen aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                                  <ExternalLink href={s.url} className="text-xs">
                                    {s.title}
                                  </ExternalLink>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                        {e.cautionLines.length ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">From this intervention&apos;s cautions</p>
                            <ul className="mt-1.5 list-disc space-y-1.5 pl-5 marker:text-muted">
                              {e.cautionLines.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <Link
                          href={`/interventions/${encodeURIComponent(e.interventionId)}`}
                          className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
                        >
                          All cautions for {e.name}
                          <ArrowRight aria-hidden className="size-4" />
                        </Link>
                      </Disclosure>
                    ))}
                  </div>
                </Card>
              </section>
            );
          })}
        </>
      )}

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">About these notes</h2>
        <p className="text-sm text-muted">
          The sourced notes are written for this app. The other lines come from each intervention&apos;s own cautions in the
          library, matched to the box you ticked. Medical questions go to the client&apos;s medical or obstetric clinician or
          prescriber. Nothing here scores, blocks or decides anything.
        </p>
        <SourcesList sources={[...PRECAUTION_SOURCES]} />
        <Governance {...PRECAUTIONS_GOVERNANCE} />
      </Card>
    </div>
  );
}
