/**
 * One handout for a client (G3): plain language, crisis help on the same page, a printable PDF, and source credits
 * that pass the client-safe filter (no diagnosis names, codes or scores). Used by the public share page /r/[id] and
 * by client mode /client/skills/[id]. Server component; only the PDF button and crisis panel run in the browser.
 */
import Link from "next/link";
import { ArrowLeft, Clock, HeartHandshake, Siren } from "lucide-react";
import type { Handout } from "@/lib/schemas";
import { clientSafeSources } from "@/lib/client-safe";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { CrisisInline, CrisisPanel } from "@/components/crisis/crisis-panel";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { HandoutBody } from "@/components/handouts/handout-body";
import { TalkToSomeone } from "./talk-to-someone";

export function ClientHandoutView({
  handout,
  back,
}: {
  handout: Handout;
  /** Where "back" goes: client mode skills list, or the self-help home for shared links. */
  back: { href: string; label: string };
}) {
  const sources = clientSafeSources(handout.sources);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={back.href} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> {back.label}
      </Link>

      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Skill to practice</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{handout.title}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-muted">
          <Clock aria-hidden className="size-4" /> About {handout.estimatedMinutes} minutes
        </p>
      </div>

      <div className="rounded-xl border border-crisis/30 border-l-[6px] border-l-crisis bg-surface p-4">
        <p className="flex items-start gap-2 font-semibold">
          <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-crisis" />
          If you are in danger or thinking about hurting yourself, get help now.
        </p>
        <CrisisInline className="mt-1" />
      </div>

      <Card className="space-y-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Read it here, or print it and write on it. This page also works with screen readers; the printout is for paper.
          </p>
          <DownloadPdfButton handout={handout} label="Download to print" variant="primary" />
        </div>
        <HandoutBody handout={handout} headingLevel="h2" />
        {sources.length ? (
          <p className="border-t border-border pt-4 text-sm text-muted">
            Based on information from{" "}
            {sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 ? ", " : ""}
                <ExternalLink href={s.url}>{s.publisher}</ExternalLink>
              </span>
            ))}
            .
          </p>
        ) : null}
      </Card>

      <TalkToSomeone id="handout-talk" title="Talk with a licensed professional" />

      <section aria-labelledby="handout-help">
        <Card className="border-crisis/30 sm:p-6">
          <h2 id="handout-help" className="mb-4 flex items-center gap-2 text-xl font-bold">
            <HeartHandshake aria-hidden className="size-6 text-accent" />
            Need help right now?
          </h2>
          <CrisisPanel plain headingLevel="h3" />
        </Card>
      </section>
    </div>
  );
}
