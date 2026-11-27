import Link from "next/link";
import { ArrowRight, Pill, Scale, ShieldCheck } from "lucide-react";
import { measures, stats } from "@/lib/content";
import { allConditions, allHandouts, ethicsCodes, interventions, legalTopics } from "@/lib/library";
import { MEDICATIONS } from "@/lib/schemas-medications";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewBadge, StatCard } from "@/components/content/content-bits";
import { POSITIONING } from "@/components/content/positioning";
import { ClinicalFlow } from "@/components/home/clinical-flow";
import { ContinueCard } from "@/components/home/continue-card";
import { Disclosure } from "@/components/ui/disclosure";

const cardLink =
  "group flex h-full gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary";

export default function HomePage() {
  const items = [...allConditions, ...interventions, ...allHandouts, ...ethicsCodes, ...legalTopics, ...stats];
  const pending = items.filter((i) => i.reviewedBy === "PENDING").length;
  const lastVerified = items.map((i) => i.lastVerified).sort().at(-1);
  const global = stats.filter((s) => s.region === "Global");
  const us = stats.filter((s) => s.region === "US");
  const featured = [...global.slice(0, 2), ...us.filter((s) => s.id.includes("mde")).slice(-1), ...us.slice(0, 1)];
  const counts = [
    { label: "Conditions", value: allConditions.length },
    { label: "Interventions", value: interventions.length },
    { label: "Handouts", value: allHandouts.length },
    { label: "Ethics codes", value: ethicsCodes.length },
  ];

  return (
    <div className="space-y-12">
      <ContinueCard measures={measures.map((m) => ({ id: m.id, shortName: m.shortName }))} />
      <section aria-labelledby="home-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">For licensed mental-health professionals</p>
          <h1 id="home-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            From symptoms to resources, with the reasoning in view
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-text">{POSITIONING}</p>
          <p className="mt-3 flex max-w-3xl items-start gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            Nothing you type is stored. Lookups send only codes, curated terms, drug names or a ZIP or city.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/symptoms" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Start with symptoms
              <ArrowRight aria-hidden />
            </Link>
            <Link href="/client" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Client self-help
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm shadow-sm">
          <p className="font-semibold">Content status</p>
          <div className="mt-2">
            <ReviewBadge reviewedBy={pending > 0 ? "PENDING" : "a licensed clinician"} />
          </div>
          <p className="mt-3 leading-relaxed text-muted">
            {pending} of {items.length} content items are awaiting licensed clinical review. All clinical wording is
            original, with named sources{lastVerified ? `, last verified ${lastVerified}` : ""}.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            {counts.map((c) => (
              <div key={c.label} className="rounded-lg bg-surface-2 p-2">
                <dt className="text-xs text-muted">{c.label}</dt>
                <dd className="text-lg font-bold">{c.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <ClinicalFlow />

      <section aria-labelledby="features-heading">
        <h2 id="features-heading" className="text-xl font-semibold">
          Also in clinician mode
        </h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          <li>
            <Link href="/ethics" className={cardLink}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Scale aria-hidden className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  Ethics &amp; Legal Hub
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  {ethicsCodes.length} professional codes from the US and abroad and {legalTopics.length} legal topics,
                  including HIPAA, 42 CFR Part 2, telehealth jurisdiction and duty to warn. Original summaries with
                  links to the official text; not legal advice.
                </span>
              </span>
            </Link>
          </li>
          <li>
            <Link href="/medications" className={cardLink}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Pill aria-hidden className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  Medication reference
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  {MEDICATIONS.length} psychotropic and alcohol use disorder medications, with current FDA label
                  warnings, for referral conversations. Not for prescribing decisions.
                </span>
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="stats-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="stats-heading" className="text-xl font-semibold">
              Context for psychoeducation
            </h2>
            <p className="mt-1 text-sm text-muted">Every figure shows its publisher and data year. Data older than 5 years are flagged.</p>
          </div>
          <Badge tone="neutral">{stats.length} curated statistics</Badge>
        </div>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((s) => (
            <li key={s.id}>
              <StatCard stat={s} />
            </li>
          ))}
        </ul>
        <Disclosure title={`Show all ${stats.length} statistics`} bordered={false} className="mt-4">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats
              .filter((s) => !featured.includes(s))
              .map((s) => (
                <li key={s.id}>
                  <StatCard stat={s} compact />
                </li>
              ))}
          </ul>
        </Disclosure>
      </section>
    </div>
  );
}
