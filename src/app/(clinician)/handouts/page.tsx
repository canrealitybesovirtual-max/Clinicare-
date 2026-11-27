import type { Metadata } from "next";
import Link from "next/link";
import { Clock, FileText, Zap } from "lucide-react";
import { measures } from "@/lib/content";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { NextStep, PageIntro } from "@/components/content/content-bits";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { AdultOnly } from "@/components/measures/adult-only";
import { HandoutLibrary } from "@/components/handouts/handout-library";
import { handoutCards, handoutsById, interventionOptions, practiceTypeOptions } from "@/components/handouts/catalog";

export const metadata: Metadata = { title: "Handouts" };

/** G8: third-party worksheets are link-out only (title, publisher, URL). Nothing is copied or hosted. */
const LINK_OUTS = [
  { title: "Worksheets, guides and videos", publisher: "TherapistAid", url: "https://www.therapistaid.com" },
  { title: "Consumer resources and workbooks", publisher: "Centre for Clinical Interventions (CCI)", url: "https://www.cci.health.wa.gov.au" },
  { title: "CBT self-help resources", publisher: "Get Self Help", url: "https://www.getselfhelp.co.uk" },
  { title: "PHQ and GAD-7 screeners (official forms and translations)", publisher: "PHQ Screeners (Pfizer)", url: "https://www.phqscreeners.com" },
] as const;

/** Quick downloads for the most common in-session skills. */
const QUICK = ["pmr-homework", "breathing-practice", "grounding-5-4-3-2-1"] as const;

export default function HandoutsPage() {
  const cards = handoutCards();
  const quick = handoutsById(QUICK);

  return (
    <>
      <PageIntro title="Handouts" eyebrow="Step 6 · Resources for the client">
        <p>
          Original, plain-language handouts to print, download or send as a link, in English and in Spanish (ES). PDFs
          are created on this device and nothing is uploaded; the only personal field is a blank name line to fill in by
          hand. Share links carry the handout id only.
        </p>
      </PageIntro>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="quick-heading">
            <h2 id="quick-heading" className="flex items-center gap-2 text-lg font-semibold">
              <Zap aria-hidden className="size-5 text-accent" /> Quick downloads
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {quick.map((h) => (
                <li key={h.id}>
                  <Card className="flex h-full flex-col gap-2 p-4 sm:p-4">
                    <h3 className="font-semibold leading-snug">
                      <Link href={`/handouts/${h.id}`} className="hover:text-accent hover:underline">
                        {h.title}
                      </Link>
                    </h3>
                    <p className="flex items-center gap-1 text-xs text-muted">
                      <Clock aria-hidden className="size-3.5" /> About {h.estimatedMinutes} minutes
                    </p>
                    <div className="mt-auto flex flex-col gap-1 pt-1">
                      <DownloadPdfButton handout={h} label="Download PDF" variant="primary" className="w-full" />
                      {h.es ? <DownloadPdfButton handout={h} lang="es" label="Spanish PDF" className="w-full" /> : null}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <HandoutLibrary cards={cards} practiceTypes={practiceTypeOptions(cards)} interventions={interventionOptions(cards)} />
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-4">
          <section aria-labelledby="blank-forms">
            <Card className="space-y-3">
              <h2 id="blank-forms" className="flex items-center gap-2 text-lg font-semibold">
                <FileText aria-hidden className="size-5 text-muted" /> Blank measure forms
              </h2>
              <AdultOnly compact>
                <p className="text-sm text-muted">
                  Official wording and empty boxes on page 1; the scoring key is on a separate clinician page. No answers
                  or scores are printed.
                </p>
                <ul className="space-y-2">
                  {measures.map((m) => (
                    <li key={m.id}>
                      <DownloadPdfButton measure={m} label={`${m.shortName} blank PDF`} className="w-full justify-start" />
                    </li>
                  ))}
                </ul>
              </AdultOnly>
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

          <section aria-labelledby="sharing-note">
            <Card className="space-y-2 text-sm">
              <h2 id="sharing-note" className="text-lg font-semibold">
                Sending a handout
              </h2>
              <p className="text-muted">
                Open a handout to get its link and QR code. The client sees a plain-language page with the same wording,
                a printable PDF and crisis numbers. No diagnosis, code or score appears there.
              </p>
              <Badge tone="neutral">The link contains only the handout id</Badge>
            </Card>
          </section>
        </div>
      </div>
      <NextStep href="/referrals" label="Step 7 · Referrals" />
    </>
  );
}
