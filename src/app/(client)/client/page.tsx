import type { Metadata } from "next";
import { HeartHandshake, MessagesSquare, Phone, Siren, Globe, Stethoscope } from "lucide-react";
import { getHandout } from "@/lib/content";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { CrisisPanel } from "@/components/crisis/crisis-panel";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { HandoutBody } from "@/components/handouts/handout-body";
import { ReviewBadge } from "@/components/content/content-bits";

export const metadata: Metadata = { title: "Self-help" };

/*
 * Client mode (G3): plain language (grades 6-8), crisis information first, no diagnosis names,
 * no codes, no scores, and no links into clinician screens other than the header mode switch.
 */

const CLINICAL_TERMS = /disorder|anxiety|depress|panic|ptsd|diagnos/i;

function TalkToSomeone({ id, title }: { id: string; title: string }) {
  return (
    <section aria-labelledby={id}>
      <div className="flex gap-4 rounded-2xl border border-accent/30 bg-accent-soft p-5">
        <HeartHandshake aria-hidden className="mt-0.5 size-7 shrink-0 text-accent" />
        <div className="space-y-1.5">
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="leading-relaxed">
            The tips on this page are things you can try on your own. They do not take the place of a counselor,
            therapist, doctor or nurse. If you are having a hard time, or things are not getting better, please talk
            with a licensed professional. Asking for help is a strong step.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function ClientPage() {
  const pmr = getHandout("pmr-homework");
  const plainSources = pmr?.sources.filter((s) => !CLINICAL_TERMS.test(s.title)) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Self-help</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Help and skills you can use today</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Simple steps to calm your body, and places to get help. You do not need to type anything on this page.
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

      <TalkToSomeone id="talk-1" title="Talk with a licensed professional" />

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
        </Card>
      </section>

      <TalkToSomeone id="talk-2" title="You do not have to do this alone" />
    </div>
  );
}
