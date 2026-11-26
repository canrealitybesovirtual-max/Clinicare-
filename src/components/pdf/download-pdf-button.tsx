"use client";
import * as React from "react";
import { Download, LoaderCircle } from "lucide-react";
import type { Handout, Measure } from "@/lib/schemas";
import { Button, type ButtonProps } from "@/components/ui/button";

type Props = Omit<ButtonProps, "onClick" | "children"> & {
  label: string;
} & ({ measure: Measure; handout?: never } | { handout: Handout; measure?: never });

/**
 * Builds a PDF in the browser (pdf-lib, loaded on demand) and saves it to the device.
 * Blank forms and handouts only: no answers, scores or typed text ever go into a PDF.
 */
export function DownloadPdfButton({ measure, handout, label, variant = "outline", ...props }: Props) {
  const [state, setState] = React.useState<"idle" | "busy" | "done" | "error">("idle");

  async function onClick() {
    setState("busy");
    try {
      const [pdf, dl] = await Promise.all([import("@/lib/pdf"), import("@/lib/download")]);
      if (measure) {
        dl.downloadBytes(await pdf.createBlankMeasurePdf(measure), `${measure.shortName} blank form.pdf`);
      } else if (handout) {
        dl.downloadBytes(await pdf.createHandoutPdf(handout), `${handout.title}.pdf`);
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant={variant} onClick={onClick} disabled={state === "busy"} {...props}>
        {state === "busy" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Download aria-hidden />}
        {label}
      </Button>
      <span role="status" className="text-xs text-muted">
        {state === "done" ? "PDF created on this device." : state === "error" ? "Could not create the PDF. Try again." : ""}
      </span>
    </span>
  );
}
