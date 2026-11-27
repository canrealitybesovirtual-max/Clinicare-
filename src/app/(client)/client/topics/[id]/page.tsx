import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, LockKeyhole, Phone, Siren } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CrisisInline, CrisisPanel } from "@/components/crisis/crisis-panel";
import { handoutsById } from "@/components/handouts/catalog";
import { TalkToSomeone } from "@/components/client/talk-to-someone";
import { TopicResults } from "@/components/client/topic-results";
import { CLIENT_TOPICS, TOPIC_SKILLS, getClientTopic } from "@/components/client/topics";
import { SAMHSA_HELPLINE } from "@/lib/referral-links";

/*
 * Client mode topic page (G3): the plain topic label only (never the clinician search keyword), MedlinePlus pages
 * filtered for client-safe wording, related app-authored skills, and crisis help beside the results on crisis topics.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return CLIENT_TOPICS.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getClientTopic(id)?.label ?? "Topic" };
}

export default async function ClientTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = getClientTopic(id);
  if (!topic) notFound();
  const skills = handoutsById(TOPIC_SKILLS[topic.id] ?? []);

  const crisisCard = (
    <section aria-labelledby="topic-crisis">
      <Card className="border-crisis/30 sm:p-6">
        <h2 id="topic-crisis" className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Siren aria-hidden className="size-6 text-crisis" />
          Need help right now?
        </h2>
        <CrisisPanel plain headingLevel="h3" />
      </Card>
    </section>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Link href="/client" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All topics
      </Link>

      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Topic</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{topic.label}</h1>
        <p className="mt-2 text-muted" lang="es">
          {topic.labelEs}
        </p>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Trusted health pages to read, and skills you can practice. You do not need to type anything here.
        </p>
      </div>

      {topic.crisis ? null : (
        <div className="rounded-xl border border-crisis/30 border-l-[6px] border-l-crisis bg-surface p-4">
          <p className="flex items-start gap-2 font-semibold">
            <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-crisis" />
            If you are in danger or thinking about hurting yourself, get help now.
          </p>
          <CrisisInline className="mt-1" />
        </div>
      )}

      {topic.sud ? (
        <div className="flex gap-3 rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed">
          <LockKeyhole aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="space-y-1.5">
            <p className="font-semibold">Your privacy</p>
            <p>
              Nothing you do on this page is saved. If you are worried about drinking or drug use, the SAMHSA National
              Helpline is free, private and open all day, every day.
            </p>
            <a
              href={`tel:${SAMHSA_HELPLINE.number.replace(/\D/g, "")}`}
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
            >
              <Phone aria-hidden className="size-4" /> Call {SAMHSA_HELPLINE.number}
            </a>
            <p>If you drink a lot every day, stopping all at once can be dangerous. Talk with a doctor or nurse first.</p>
          </div>
        </div>
      ) : null}

      <div className={topic.crisis ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start" : "max-w-3xl"}>
        {topic.crisis ? <div className="lg:order-2 lg:sticky lg:top-4">{crisisCard}</div> : null}
        <section aria-labelledby="topic-read" className="min-w-0 lg:order-1">
          <Card className="space-y-4 sm:p-6">
            <h2 id="topic-read" className="text-xl font-bold">
              Read more from MedlinePlus
            </h2>
            <p className="text-sm text-muted">
              MedlinePlus is a free health library from the U.S. National Library of Medicine. Pages open on their site.
            </p>
            <TopicResults topic={topic} />
          </Card>
        </section>
      </div>

      {skills.length ? (
        <section aria-labelledby="topic-skills" className="max-w-3xl">
          <h2 id="topic-skills" className="text-xl font-bold">
            Skills to try
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {skills.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/client/skills/${h.id}`}
                  className="group flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    {h.title}
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="flex items-center gap-1 text-sm text-muted">
                    <Clock aria-hidden className="size-3.5" /> About {h.estimatedMinutes} minutes
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="max-w-3xl">
        <TalkToSomeone id="topic-talk" title="Talk with a licensed professional" />
      </div>
    </div>
  );
}
