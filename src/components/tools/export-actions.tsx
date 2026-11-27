"use client";
import * as React from "react";
import { Copy, FileDown, FileText, LoaderCircle } from "lucide-react";
import { docFilename, docPlainText, type DocSpec } from "@/lib/tools/doc-model";
import { Button } from "@/components/ui/button";

type Kind = "copy" | "pdf" | "docx";

/**
 * Copy / PDF / Word for a tool's document. Every field is flushed through the PHI scrubber first, then the outline
 * is built and rendered on this device (pdf-lib and docx load on demand). Nothing is uploaded or stored.
 */
export function ExportActions({
  build,
  flushAll,
  kinds = ["copy", "pdf", "docx"],
  pdfLabel = "Download PDF",
  quiet = false,
}: {
  build: () => DocSpec;
  flushAll: () => void;
  kinds?: readonly Kind[];
  pdfLabel?: string;
  /** Outline style for every button (a secondary export next to the main one). */
  quiet?: boolean;
}) {
  const [busy, setBusy] = React.useState<Kind | null>(null);
  const [status, setStatus] = React.useState("");

  async function run(kind: Kind) {
    flushAll();
    const spec = build();
    setBusy(kind);
    setStatus("");
    try {
      if (kind === "copy") {
        await navigator.clipboard.writeText(docPlainText(spec));
        setStatus("Copied. Paste it into your record system, then review every line.");
      } else {
        const [m, dl] = await Promise.all([import("@/lib/tools/doc-export"), import("@/lib/download")]);
        if (kind === "pdf") dl.downloadBytes(await m.docPdf(spec), docFilename(spec, "pdf"));
        else dl.downloadBytes(await m.docDocx(spec), docFilename(spec, "docx"), m.DOCX_MIME);
        setStatus(`${kind === "pdf" ? "PDF" : "Word file"} created on this device.`);
      }
    } catch {
      setStatus(kind === "copy" ? "Could not copy. Use the PDF or Word file instead." : "Could not create the file. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const icon = (kind: Kind, Icon: typeof Copy) => (busy === kind ? <LoaderCircle aria-hidden className="animate-spin" /> : <Icon aria-hidden />);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {kinds.includes("copy") ? (
          <Button type="button" variant={quiet ? "outline" : "primary"} onClick={() => run("copy")} disabled={busy !== null}>
            {icon("copy", Copy)}
            Copy text
          </Button>
        ) : null}
        {kinds.includes("pdf") ? (
          <Button type="button" variant={quiet || kinds.includes("copy") ? "outline" : "primary"} onClick={() => run("pdf")} disabled={busy !== null}>
            {icon("pdf", FileDown)}
            {pdfLabel}
          </Button>
        ) : null}
        {kinds.includes("docx") ? (
          <Button type="button" variant="outline" onClick={() => run("docx")} disabled={busy !== null}>
            {icon("docx", FileText)}
            Download Word
          </Button>
        ) : null}
      </div>
      <p role="status" className="min-h-6 text-sm text-muted">
        {status}
      </p>
    </div>
  );
}
