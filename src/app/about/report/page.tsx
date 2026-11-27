import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageIntro } from "@/components/content/content-meta";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { CONTENT_TYPES, contentItems, findContentItem, itemRef } from "./content-items";
import { ReportForm, type ReportGroup } from "./report-form";
import { reportDestination } from "./report-link";

export const metadata: Metadata = { title: "Report a content problem" };

/**
 * Report a content problem: choose a curated item and a curated reason, then leave through a mailto: or https
 * link to the address the operator set (CONTENT_REPORT_EMAIL or CONTENT_REPORT_URL, server env). The app sends
 * nothing itself, and there is no text box, so no clinical text can be part of a report (G5). `?item=type/id`
 * preselects an item when a page links here; anything not in the curated list is ignored.
 */
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ item?: string | string[] }> }) {
  const { item } = await searchParams;
  const initialRef = typeof item === "string" && findContentItem(item) ? item : undefined;
  const all = contentItems();
  const groups: ReportGroup[] = CONTENT_TYPES.map((t) => ({
    type: t.type,
    label: t.label,
    items: all.filter((i) => i.type === t.type).map((i) => ({ ref: itemRef(i), title: i.title })),
  })).filter((g) => g.items.length > 0);
  const destination = reportDestination({ CONTENT_REPORT_EMAIL: process.env.CONTENT_REPORT_EMAIL, CONTENT_REPORT_URL: process.env.CONTENT_REPORT_URL });

  return (
    // English-only page, like the rest of About (WCAG 3.1.2).
    <div className="space-y-8" lang="en">
      <PageIntro title="Report a content problem" eyebrow="About" compact>
        <p>
          A broken source, an outdated figure or phone number, wording that may be too close to a copyrighted text, or
          anything that could mislead or harm: name the item and the reason, and the content owner will check it against
          its sources.
        </p>
      </PageIntro>

      <Notice tone="warn" title="No client information" className="max-w-3xl">
        <p>
          There is no text box here on purpose. The report link carries only the item and the reason you pick. If you add
          a note in your own email, describe the content, never a client.
        </p>
      </Notice>

      <Card className="max-w-3xl">
        <ReportForm groups={groups} destination={destination} initialRef={initialRef} />
      </Card>

      <section aria-labelledby="next-heading" className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted">
        <h2 id="next-heading" className="flex items-center gap-2 text-base font-semibold text-text">
          <ShieldCheck aria-hidden className="size-4 text-accent" /> What happens next
        </h2>
        <p>
          A correction is checked against its sources and, when it changes clinical wording, goes through the same
          clinical review as other content. Changes are listed in the{" "}
          <Link href="/about/changelog" className="font-medium text-accent underline underline-offset-2">
            content changelog
          </Link>
          .
        </p>
        <p>A wrong crisis number matters most: choose the reason about safety. The crisis button stays on every screen.</p>
      </section>
    </div>
  );
}
