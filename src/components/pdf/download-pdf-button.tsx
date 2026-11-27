"use client";
import * as React from "react";
import { Download, LoaderCircle } from "lucide-react";
import type { Handout, Measure } from "@/lib/schemas";
import { useT, type Lang } from "@/lib/i18n/core";
import { Button, type ButtonProps } from "@/components/ui/button";
import { localizeHandout } from "@/components/handouts/localize";

type Props = Omit<ButtonProps, "onClick" | "children"> & {
  label: string;
} & ({ measure: Measure; handout?: never; lang?: never } | { handout: Handout; measure?: never; lang?: Lang });

const STATUS = {
  done: { en: "PDF created on this device.", es: "El PDF se creó en este dispositivo." },
  error: { en: "Could not create the PDF. Try again.", es: "No se pudo crear el PDF. Intente de nuevo." },
};

/**
 * Builds a PDF in the browser (pdf-lib, loaded on demand) and saves it to the device.
 * Blank forms and handouts only: no answers, scores or typed text ever go into a PDF.
 * Handouts print in `lang` (English by default; Spanish uses the handout's translation).
 */
export function DownloadPdfButton({ measure, handout, lang = "en", label, variant = "outline", ...props }: Props) {
  const [state, setState] = React.useState<"idle" | "busy" | "done" | "error">("idle");
  const t = useT();

  async function onClick() {
    setState("busy");
    try {
      const [pdf, dl] = await Promise.all([import("@/lib/pdf"), import("@/lib/download")]);
      if (measure) {
        dl.downloadBytes(await pdf.createBlankMeasurePdf(measure), `${measure.shortName} blank form.pdf`);
      } else if (handout) {
        dl.downloadBytes(await pdf.createHandoutPdf(handout, lang), `${localizeHandout(handout, lang).title}.pdf`);
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant={variant} onClick={onClick} disabled={state === "busy"} {...props}>
        {state === "busy" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Download aria-hidden />}
        {label}
      </Button>
      <span role="status" className="text-xs text-muted">
        {state === "done" ? t(STATUS.done) : state === "error" ? t(STATUS.error) : ""}
      </span>
    </span>
  );
}
