"use client";
/**
 * "Export FHIR (no identifiers)" for one administration of a measure (clinician mode only, G3).
 * Builds a FHIR R4 QuestionnaireResponse in the browser with src/lib/fhir.ts (loaded on demand), checks it with
 * validateNoIdentifiers, and saves it with downloadBytes. Nothing is uploaded or stored; no date is written
 * (dates are identifiers under Safe Harbor); no subject, author or narrative exists in the resource.
 */
import * as React from "react";
import { Braces, LoaderCircle } from "lucide-react";
import type { Measure } from "@/lib/schemas";
import { Button } from "@/components/ui/button";

/** LOINC facts computed on the server (describeFhirExport + LOINC_PANELS) and passed down. */
export interface FhirExportInfo {
  available: boolean;
  note?: string;
  questionnaire?: string;
  panel?: string;
  total?: string;
  items: { id: string; loinc: string }[];
  functional?: string;
  loincNotice: string;
}

export function FhirExport({
  measure,
  answers,
  functional,
  info,
}: {
  measure: Measure;
  answers: readonly (number | null)[];
  functional: number | null;
  info: FhirExportInfo;
}) {
  const [state, setState] = React.useState<"idle" | "busy" | "done" | "error">("idle");
  const answered = answers.filter((a) => a !== null && a !== undefined).length;
  const complete = answered === measure.items.length;

  // A new answer makes the last "created" message stale.
  React.useEffect(() => {
    setState((s) => (s === "done" || s === "error" ? "idle" : s));
  }, [answers, functional]);

  async function onExport() {
    setState("busy");
    try {
      const [fhir, dl] = await Promise.all([import("@/lib/fhir"), import("@/lib/download")]);
      const qr = fhir.buildQuestionnaireResponse(measure, answers, { functional, linkIds: "item" });
      fhir.validateNoIdentifiers(qr);
      dl.downloadBytes(fhir.questionnaireResponseBytes(qr), fhir.questionnaireResponseFilename(measure), fhir.FHIR_JSON_MIME);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (!info.available) {
    return <p className="text-xs text-muted">FHIR export is not available for this measure{info.note ? `: ${info.note}` : "."}</p>;
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <Button type="button" variant="outline" onClick={onExport} disabled={answered === 0 || state === "busy"} className="w-full sm:w-auto">
        {state === "busy" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Braces aria-hidden />}
        Export FHIR (no identifiers)
      </Button>
      <p role="status" className="text-xs text-muted">
        {state === "done"
          ? "FHIR file created on this device. It holds the item answers only: no identifiers, no date."
          : state === "error"
            ? "Could not create the FHIR file. Try again."
            : answered === 0
              ? "Answer at least one item to export."
              : complete
                ? "Exports a QuestionnaireResponse with every answer and the total."
                : "Incomplete forms export as in-progress, without a total."}
      </p>
      <details className="text-xs text-muted">
        <summary className="min-h-10 cursor-pointer py-2 font-semibold text-text">LOINC codes in the export</summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-semibold text-text">Panel</dt>
          <dd className="font-mono">{info.panel}</dd>
          {info.total ? (
            <>
              <dt className="font-semibold text-text">Total score</dt>
              <dd className="font-mono">{info.total}</dd>
            </>
          ) : null}
          {info.items.map((it) => (
            <React.Fragment key={it.id}>
              <dt>Item {it.id}</dt>
              <dd className="font-mono">{it.loinc}</dd>
            </React.Fragment>
          ))}
          {info.functional ? (
            <>
              <dt>Difficulty item</dt>
              <dd className="font-mono">{info.functional}</dd>
            </>
          ) : null}
        </dl>
        {info.note ? <p className="mt-2">{info.note}</p> : null}
        <p className="mt-2 leading-relaxed">{info.loincNotice}</p>
      </details>
    </div>
  );
}
