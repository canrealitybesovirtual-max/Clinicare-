"use client";
import * as React from "react";
import { Compass, Download, FileText, LoaderCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";
import { PART2_NOTICE } from "@/lib/referral-links";
import { usePlan } from "./plan-context";
import { FACTOR_KIND_LABELS, formulationCoverage, planCounts, toPlanExport } from "./plan-model";
import { NextStep } from "@/components/content/content-meta";

type ExportState = { kind: "pdf" | "docx"; status: "busy" | "done" | "error" } | null;

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm italic text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

/**
 * For clinician review: tapped formulation targets that no chosen objective works on, and chosen objectives that are
 * linked to none of them. Shown only when the optional formulation step was used. A gap is a prompt, not an error.
 */
function FormulationCheck() {
  const { draft, targetMap, goTo } = usePlan();
  const coverage = formulationCoverage(draft);
  if (!coverage.targets.length) return null;
  const gaps = coverage.targets.filter((t) => !t.refs.length);
  const name = (id: string) => targetMap.get(id)?.label ?? id;
  return (
    <section aria-labelledby="review-formulation" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Compass aria-hidden className="size-5 text-accent" />
        <h3 id="review-formulation" className="text-base font-semibold">
          Formulation check
        </h3>
        <Badge tone="info" className="uppercase tracking-wide">
          For clinician review
        </Badge>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        How the chosen objectives line up with the processes and strengths you tapped. A gap is something to talk over
        with the client, not an error.
      </p>
      {gaps.length ? (
        <Notice tone="neutral" title="Not yet worked on by any chosen objective">
          <ul className="list-disc space-y-1 pl-5">
            {gaps.map((t) => (
              <li key={t.id}>{name(t.id)}</li>
            ))}
          </ul>
        </Notice>
      ) : (
        <p className="text-sm">Every process or strength you tapped is worked on by at least one chosen objective.</p>
      )}
      {coverage.unlinked.length ? (
        <Notice tone="neutral" title="Chosen objectives not linked to a tapped process or strength">
          <ul className="list-disc space-y-1 pl-5">
            {coverage.unlinked.map((u) => (
              <li key={u.ref}>
                <span className="font-semibold">{u.ref}:</span> {u.text}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Link them under Link to your formulation in the Objectives step, or keep them if they fit for another reason.</p>
        </Notice>
      ) : null}
      {gaps.length || coverage.unlinked.length ? (
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => goTo("objectives")}>
          Go to Objectives
        </Button>
      ) : null}
      <Disclosure title="Full map" meta={`${coverage.targets.length} chosen`} bordered={false} bodyClassName="pb-1">
        <ul className="space-y-1.5 text-sm">
          {coverage.targets.map((t) => {
            const f = targetMap.get(t.id);
            return (
              <li key={t.id}>
                <span className="font-semibold">{name(t.id)}</span>
                {f ? <span className="text-muted"> · {FACTOR_KIND_LABELS[f.kind]}</span> : null}
                <span className="block text-xs text-muted">{t.refs.length ? `Worked on in: ${t.refs.join("; ")}` : "No chosen objective yet."}</span>
              </li>
            );
          })}
        </ul>
      </Disclosure>
    </section>
  );
}

/** Step 9: read the plan back, then export it (PDF or DOCX) without identifiers. */
export function ReviewStep() {
  const { draft, option, interventionMap, measures, modules, targets, goTo } = usePlan();
  const plan = React.useMemo(
    () => toPlanExport(draft, { option, interventions: interventionMap, measures, modules, targets }),
    [draft, option, interventionMap, measures, modules, targets],
  );
  const counts = planCounts(draft);
  const [exporting, setExporting] = React.useState<ExportState>(null);

  async function exportAs(kind: "pdf" | "docx") {
    setExporting({ kind, status: "busy" });
    try {
      // Loaded on demand so the PDF and Word libraries never weigh on the page itself.
      const [m, dl] = await Promise.all([import("@/lib/plan-export"), import("@/lib/download")]);
      if (kind === "pdf") dl.downloadBytes(await m.planPdf(plan), m.PLAN_PDF_FILENAME);
      else dl.downloadBytes(await m.planDocx(plan), m.PLAN_DOCX_FILENAME, m.DOCX_MIME);
      setExporting({ kind, status: "done" });
    } catch {
      setExporting({ kind, status: "error" });
    }
  }

  const label = (k: "pdf" | "docx") => (k === "pdf" ? "PDF" : "Word document");

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted">
        Read the plan back to the client and check that it sounds like them. Then export it to paste into your record
        system. Exports contain only a blank name line to fill in by hand: no dates, numbers or other identifiers.
      </p>

      {counts.problems === 0 ? (
        <Notice tone="neutral" title="The plan is empty">
          <p>Check at least one problem and its goals and objectives before exporting.</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => goTo("problems")}>
            Go to Problems
          </Button>
        </Notice>
      ) : null}

      <FormulationCheck />

      <div className="space-y-5 rounded-xl border border-border bg-surface-2 p-4 sm:p-5">
        <p className="text-sm">
          <span className="font-semibold">Plan library:</span> {option.label}
          {option.icd10cm.length || option.icd11.length ? (
            <span className="text-muted">
              {" "}
              · reference codes to confirm through your own assessment:{" "}
              {[option.icd10cm.length ? `ICD-10-CM ${option.icd10cm.join(", ")}` : "", option.icd11.length ? `ICD-11 ${option.icd11.join(", ")}` : ""]
                .filter(Boolean)
                .join("; ")}
            </span>
          ) : null}{" "}
          <span className="text-muted">· See DSM-5-TR.</span>
        </p>
        {plan.moduleNotes?.length ? (
          <p className="text-sm">
            <span className="font-semibold">Modules in this plan:</span> {plan.moduleNotes.map((m) => m.title).join("; ")}
          </p>
        ) : null}
        {plan.problems.map((p, i) => (
          <section key={i} aria-labelledby={`review-problem-${i}`} className="space-y-2.5">
            <h3 id={`review-problem-${i}`} className="text-base font-semibold">
              Problem {i + 1}: {p.label}
            </h3>
            {p.zCodes?.length ? (
              <p className="text-xs text-muted">Reference Z codes (circumstances, not a diagnosis): {p.zCodes.join("; ")}</p>
            ) : null}
            <h4 className="text-sm font-semibold text-muted">Behavioral definitions</h4>
            <Bullets items={p.definitions} empty="None selected." />
            <h4 className="text-sm font-semibold text-muted">Long-term goals</h4>
            <Bullets items={p.goals} empty="None selected." />
            <h4 className="text-sm font-semibold text-muted">Short-term objectives</h4>
            {p.objectives.length ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
                {p.objectives.map((o, j) => (
                  <li key={j}>
                    {o.text}
                    <span className="block text-xs text-muted">
                      Interventions: {o.interventions.length ? o.interventions.join("; ") : "to be chosen"}
                      {o.careLevel ? ` · Usual level of care: ${o.careLevel}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm italic text-muted">None selected.</p>
            )}
          </section>
        ))}
        <section aria-labelledby="review-measures" className="space-y-2">
          <h3 id="review-measures" className="text-base font-semibold">
            Measures and review
          </h3>
          <Bullets items={plan.measures.map((m) => `${m.shortName}: ${m.schedule}`)} empty="No measures selected." />
          <p className="text-sm">Plan review with the client: {plan.reviewInterval.toLowerCase()}.</p>
        </section>
      </div>

      {plan.sud ? (
        <Notice tone="warn" title={option.sud ? "Substance-use plan: 42 CFR Part 2" : "Records substance use: 42 CFR Part 2"} icon={ShieldAlert}>
          <p>
            {option.sud ? "" : "Items chosen or written for this plan mention alcohol or other substance use. "}
            Both exports print this notice at the top and in every page footer:
          </p>
          <p className="font-semibold">{PART2_NOTICE}</p>
        </Notice>
      ) : null}

      <section aria-labelledby="export-heading" className="space-y-3">
        <h3 id="export-heading" className="text-base font-semibold">
          Export
        </h3>
        <p className="text-sm text-muted">
          Created on this device; nothing is uploaded or saved. Every page carries the footer “Resource only. Not a
          substitute for clinical judgment.”
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => exportAs("pdf")} disabled={exporting?.status === "busy"}>
            {exporting?.kind === "pdf" && exporting.status === "busy" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Download aria-hidden />}
            Download PDF
          </Button>
          <Button type="button" variant="outline" onClick={() => exportAs("docx")} disabled={exporting?.status === "busy"}>
            {exporting?.kind === "docx" && exporting.status === "busy" ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <FileText aria-hidden />
            )}
            Download Word (.docx)
          </Button>
        </div>
        <p className="text-xs text-muted">
          The PDF is for printing and pasting into your record. This review screen is the accessible version for screen
          readers.
        </p>
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {exporting?.status === "busy"
            ? `Creating the ${label(exporting.kind)}…`
            : exporting?.status === "done"
              ? `${label(exporting.kind)} created on this device.`
              : exporting?.status === "error"
                ? `Could not create the ${label(exporting.kind)}. Try again.`
                : ""}
        </p>
      </section>
      <NextStep href="/handouts" label="Step 6 · Handouts for the client" className="mt-2" />
    </div>
  );
}
