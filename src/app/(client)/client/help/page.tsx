import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, Globe, Siren } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { CrisisPanel } from "@/components/crisis/crisis-panel";
import { TalkToSomeone } from "@/components/client/talk-to-someone";
import { helpRegions, type HelpEntry } from "@/components/client/help-directory";
import { HelplineActions } from "@/components/referrals/helpline-actions";

export const metadata: Metadata = { title: "Where to get help" };

/* Client mode (G3, G9): crisis first, then free helplines by country. Nothing is typed or sent. */

function Entry({ e }: { e: HelpEntry }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <h3 className="font-semibold">{e.name}</h3>
      {e.description ? <p className="mt-1 text-sm leading-relaxed text-muted">{e.description}</p> : null}
      {e.audience ? <p className="mt-1 text-sm text-muted">For: {e.audience}</p> : null}
      <HelplineActions name={e.name} phone={e.phone} text={e.text} chat={e.chat} crisis={e.crisis} className="mt-3" />
      <p className="mt-2 text-sm">
        <ExternalLink href={e.url} className="inline-flex min-h-11 items-center">
          Website<span className="sr-only"> of {e.name}</span>
        </ExternalLink>
      </p>
      {e.phoneNote ? <p className="text-sm text-muted">{e.phoneNote}</p> : null}
      {e.hours ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Clock aria-hidden className="size-3.5" /> {e.hours}
        </p>
      ) : null}
      {e.verified ? null : <p className="mt-1 text-xs text-muted">Numbers can change. Check the website if a call does not connect.</p>}
    </li>
  );
}

export default function ClientHelpPage() {
  const regions = helpRegions();
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link href="/client" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> Self-help home
      </Link>
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Self-help</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Where to get help</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Free phone, text and chat lines. You can call for yourself or for someone you are worried about.
        </p>
      </div>

      <section aria-labelledby="help-now">
        <Card className="border-crisis/30 sm:p-6">
          <h2 id="help-now" className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Siren aria-hidden className="size-6 text-crisis" />
            Need help right now?
          </h2>
          <CrisisPanel plain headingLevel="h3" />
        </Card>
      </section>

      {regions.map((r) => (
        <section key={r.region} aria-labelledby={`region-${r.region}`}>
          <h2 id={`region-${r.region}`} className="text-xl font-bold">
            {r.label}
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {r.entries.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="other-countries">
        <Card className="flex gap-3">
          <Globe aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
          <div>
            <h2 id="other-countries" className="font-semibold">
              In another country
            </h2>
            <p className="text-muted">
              Find a free helpline near you: <ExternalLink href="https://findahelpline.com">findahelpline.com</ExternalLink>
            </p>
          </div>
        </Card>
      </section>

      <TalkToSomeone id="help-talk" title="For ongoing support, talk with a licensed professional">
        <p className="leading-relaxed">
          A counselor, therapist, doctor or nurse can help you find care that fits you. You can ask your doctor or a
          local clinic where to start, and bring this page with you.
        </p>
      </TalkToSomeone>
    </div>
  );
}
