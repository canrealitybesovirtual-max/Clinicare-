import type { Metadata } from "next";
import { Clock, FileText, GraduationCap } from "lucide-react";
import { handouts, measures } from "@/lib/content";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Governance, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-bits";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { HandoutBody } from "@/components/handouts/handout-body";

export const metadata: Metadata = { title: "Handouts" };

/** G8: third-party worksheets are link-out only (title, publisher, URL). Nothing is copied or hosted. */
const LINK_OUTS = [
  { title: "Worksheets, guides and videos", publisher: "TherapistAid", url: "https://www.therapistaid.com" },
  { title: "Consumer resources and workbooks", publisher: "Centre for Clinical Interventions (CCI)", url: "https://www.cci.health.wa.gov.au" },
  { title: "CBT self-help resources", publisher: "Get Self Help", url: "https://www.getselfhelp.co.uk" },
  { title: "PHQ and GAD-7 screeners (official forms and translations)", publisher: "PHQ Screeners (Pfizer)", url: "https://www.phqscreeners.com" },
] as const;

export default function HandoutsPage() {
  return (
    <>
      <PageIntro title="Handouts" eyebrow="Step 4 · Resources for the client">
        <p>
          Original, plain-language handouts to give or send to the client, plus blank measure forms. PDFs are created on
          this device; nothing is uploaded, and the only personal field is a blank name line to fill in by hand.
        </p>
      </PageIntro>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {handouts.map((h) => (
            <article key={h.id} id={h.id} aria-labelledby={`${h.id}-title`} className="scroll-mt-6">
              <Card className="space-y-5 sm:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">Client handout</Badge>
                  <Badge tone="neutral">
                    <GraduationCap aria-hidden className="size-3.5" /> Reading level grades {h.readingLevel}
                  </Badge>
                  <Badge tone="neutral">
                    <Clock aria-hidden className="size-3.5" /> About {h.estimatedMinutes} minutes
                  </Badge>
                  <ReviewBadge reviewedBy={h.reviewedBy} />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h2 id={`${h.id}-title`} className="text-2xl font-bold leading-tight">
                    {h.title}
                  </h2>
                  <DownloadPdfButton handout={h} label="Download PDF" variant="primary" />
                </div>
                <HandoutBody handout={h} />
                <div className="space-y-3 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">Sources</h3>
                  <SourcesList sources={h.sources} />
                  <Governance license={h.license} lastVerified={h.lastVerified} reviewedBy={h.reviewedBy} />
                </div>
              </Card>
            </article>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-4">
          <section aria-labelledby="blank-forms">
            <Card className="space-y-3">
              <h2 id="blank-forms" className="flex items-center gap-2 text-lg font-semibold">
                <FileText aria-hidden className="size-5 text-muted" /> Blank measure forms
              </h2>
              <p className="text-sm text-muted">Official wording, empty boxes and a scoring key. No answers or scores are printed.</p>
              <ul className="space-y-2">
                {measures.map((m) => (
                  <li key={m.id}>
                    <DownloadPdfButton measure={m} label={`${m.shortName} blank PDF`} className="w-full justify-start" />
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section aria-labelledby="link-outs">
            <Card className="space-y-3">
              <h2 id="link-outs" className="text-lg font-semibold">
                Third-party worksheets
              </h2>
              <p className="text-sm text-muted">
                Link out only. These sites’ worksheets are not copied or hosted here; check each site’s terms before use.
              </p>
              <ul className="space-y-2.5 text-sm">
                {LINK_OUTS.map((l) => (
                  <li key={l.url}>
                    <ExternalLink href={l.url}>{l.title}</ExternalLink>
                    <span className="block text-xs text-muted">{l.publisher}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>
      </div>
    </>
  );
}
