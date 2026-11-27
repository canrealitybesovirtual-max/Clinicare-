import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Globe, LifeBuoy, MessagesSquare, Phone, Siren, Sparkles, Stethoscope } from "lucide-react";
import { getHandout } from "@/lib/content";
import { clientSafeSources } from "@/lib/client-safe";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { buttonVariants } from "@/components/ui/button";
import { CrisisPanel } from "@/components/crisis/crisis-panel";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { HandoutBody } from "@/components/handouts/handout-body";
import { ReviewBadge } from "@/components/content/content-bits";
import { TalkToSomeone } from "@/components/client/talk-to-someone";
import { groupClientTopics } from "@/components/client/topics";

export const metadata: Metadata = { title: "Self-help" };

/*
 * Client mode (G3): plain language (grades 6-8), crisis information first, no diagnosis names,
 * no codes, no scores, and no links into clinician screens (the header's "Clinician view" asks first).
 */

export default function ClientPage() {
  const pmr = getHandout("pmr-homework");
  // Same client-safe rule as the printed PDF (src/lib/client-safe.ts): no titles that name a condition.
  const plainSources = pmr ? clientSafeSources(pmr.sources) : [];
  const { crisis, groups } = groupClientTopics();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Self-help</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Help and skills you can use today</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Simple steps to calm your body, things to read, and places to get help. You do not need to type anything on
          these pages.
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

      {crisis.length ? (
        <section aria-labelledby="safety-topics">
          <h2 id="safety-topics" className="text-lg font-bold">
            Staying safe
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {crisis.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/client/topics/${t.id}`}
                  className="group flex min-h-12 items-center gap-2 rounded-xl border border-border border-l-[6px] border-l-crisis bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-2"
                >
                  <LifeBuoy aria-hidden className="size-4 shrink-0 text-crisis" />
                  <span className="min-w-0 flex-1">{t.label}</span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TalkToSomeone id="talk-1" title="Talk with a licensed professional" />

      <section aria-labelledby="topics-heading">
        <h2 id="topics-heading" className="text-xl font-bold">
          What would you like help with?
        </h2>
        <p className="mt-1 text-muted">Pick a topic to read trusted health pages and find skills to try.</p>
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <div key={g.id}>
              <h3 id={`topics-${g.id}`} className="text-base font-semibold">
                {g.label}
              </h3>
              <ul aria-labelledby={`topics-${g.id}`} className="mt-2 grid gap-2 sm:grid-cols-2">
                {g.topics.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/client/topics/${t.id}`}
                      className="group flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent hover:bg-accent-soft"
                    >
                      <span>{t.label}</span>
                      <ArrowRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {pmr ? (
        <section aria-labelledby="pmr-heading">
          <Card className="space-y-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                About {pmr.estimatedMinutes} minutes
              </span>
              <ReviewBadge reviewedBy={pmr.reviewedBy} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-muted">Skill to practice</p>
                <h2 id="pmr-heading" className="text-2xl font-bold leading-tight">
                  {pmr.title}
                </h2>
              </div>
              <DownloadPdfButton handout={pmr} label="Download to print" variant="primary" />
            </div>
            <HandoutBody handout={pmr} />
            {plainSources.length ? (
              <p className="border-t border-border pt-4 text-sm text-muted">
                Based on information from{" "}
                {plainSources.map((s, i) => (
                  <span key={s.url}>
                    {i > 0 ? ", " : ""}
                    <ExternalLink href={s.url}>{s.publisher}</ExternalLink>
                  </span>
                ))}
                .
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="more-skills">
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Sparkles aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
            <div>
              <h2 id="more-skills" className="text-lg font-semibold">
                More skills to practice
              </h2>
              <p className="text-sm text-muted">Breathing, grounding, sleep, worry, kind self-talk and more.</p>
            </div>
          </div>
          <Link href="/client/skills" className={buttonVariants({ variant: "outline" })}>
            See all skills
            <ArrowRight aria-hidden />
          </Link>
        </Card>
      </section>

      <section aria-labelledby="where-help">
        <Card className="space-y-4 sm:p-6">
          <h2 id="where-help" className="text-xl font-bold">
            Where to get help
          </h2>
          <ul className="space-y-4">
            <li className="flex gap-3">
              <Phone aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">In the US: call or text 988</p>
                <p className="text-muted">
                  The 988 Suicide &amp; Crisis Lifeline is free and open all day, every day. You can call or text about
                  any kind of stress, not only suicide.{" "}
                  <ExternalLink href="https://988lifeline.org">988lifeline.org</ExternalLink>
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Siren aria-hidden className="mt-1 size-5 shrink-0 text-crisis" />
              <div>
                <p className="font-semibold">In danger right now: call your local emergency number</p>
                <p className="text-muted">In the US and Canada this is 911. For other countries, use the Get help now button.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Globe aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">In another country</p>
                <p className="text-muted">
                  Find a free helpline near you: <ExternalLink href="https://findahelpline.com">findahelpline.com</ExternalLink>
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Stethoscope aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">For ongoing support</p>
                <p className="text-muted">
                  Ask your doctor, clinic or school counselor about talking with a licensed counselor or therapist. You can
                  bring this page with you.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <MessagesSquare aria-hidden className="mt-1 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">Talk to someone you trust</p>
                <p className="text-muted">A friend, family member or faith leader can help you take the next step.</p>
              </div>
            </li>
          </ul>
          <Link href="/client/help" className={buttonVariants({ variant: "outline" })}>
            More free helplines, by country
            <ArrowRight aria-hidden />
          </Link>
        </Card>
      </section>

      <TalkToSomeone id="talk-2" title="You do not have to do this alone" />
    </div>
  );
}
