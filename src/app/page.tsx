import Link from "next/link";
import { ArrowRight, ClipboardList, FileText, HeartHandshake, ListChecks, Stethoscope, TextSearch } from "lucide-react";
import { conditions, handouts, lexicon, measures, stats } from "@/lib/content";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewBadge, StatCard } from "@/components/content/content-bits";
import { POSITIONING } from "@/components/content/positioning";


const STEPS = [
  {
    icon: TextSearch,
    title: "Describe",
    body: "Type what the client reports or tap symptoms. Identifiers are scrubbed on this device.",
    href: "/symptoms",
    cta: "Symptom Finder",
  },
  {
    icon: ListChecks,
    title: "Review",
    body: "See possible considerations with matched and missing features, ICD codes and rule-outs.",
    href: "/diagnoses",
    cta: "Possible diagnoses",
  },
  {
    icon: ClipboardList,
    title: "Measure",
    body: "Run the GAD-7 or PHQ-9 with live totals. Scores are never saved.",
    href: "/measures",
    cta: "Measures",
  },
  {
    icon: FileText,
    title: "Hand out",
    body: "Print or download original plain-language handouts and blank forms.",
    href: "/handouts",
    cta: "Handouts",
  },
] as const;

export default function HomePage() {
  const items = [lexicon, ...conditions, ...measures, ...handouts, ...stats];
  const pending = items.filter((i) => i.reviewedBy === "PENDING").length;
  const lastVerified = items.map((i) => i.lastVerified).sort().at(-1);
  const global = stats.filter((s) => s.region === "Global");
  const us = stats.filter((s) => s.region === "US");
  const featured = [...global.slice(0, 2), ...us.filter((s) => s.id.includes("mde")).slice(-1), ...us.slice(0, 1)];

  return (
    <div className="space-y-12">
      <section aria-labelledby="home-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">For licensed mental-health professionals</p>
          <h1 id="home-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            From symptoms to resources, with the reasoning in view
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-text">{POSITIONING}</p>
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
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-xs text-muted">Conditions</dt>
              <dd className="text-lg font-bold">{conditions.length}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-xs text-muted">Symptom features</dt>
              <dd className="text-lg font-bold">{lexicon.symptoms.length}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-xs text-muted">Measures</dt>
              <dd className="text-lg font-bold">{measures.length}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-xs text-muted">Handouts</dt>
              <dd className="text-lg font-bold">{handouts.length}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="modes-heading">
        <h2 id="modes-heading" className="text-xl font-semibold">
          Choose a mode
        </h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          <li>
            <Link
              href="/symptoms"
              className="group flex h-full gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg">
                <Stethoscope aria-hidden className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-lg font-semibold">
                  Clinician mode
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Symptom Finder, possible diagnoses for clinician review with ICD-10-CM and ICD-11 codes, GAD-7 and PHQ-9,
                  and printable handouts.
                </span>
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/client"
              className="group flex h-full gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <HeartHandshake aria-hidden className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-lg font-semibold">
                  Client self-help
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Plain-language skills and where to get help, with crisis information first. No diagnosis labels, codes or
                  scores.
                </span>
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="flow-heading">
        <h2 id="flow-heading" className="text-xl font-semibold">
          How a session flows
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">
                  {i + 1}
                </span>
                <s.icon aria-hidden className="size-5 text-muted" />
              </div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{s.body}</p>
              <Link
                href={s.href}
                className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
              >
                {s.cta}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="stats-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="stats-heading" className="text-xl font-semibold">
              Context for psychoeducation
            </h2>
            <p className="mt-1 text-sm text-muted">Every figure shows its publisher and data year. Older data are flagged.</p>
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
        <details className="group mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-accent [&::-webkit-details-marker]:hidden">
            Show all {stats.length} statistics
          </summary>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats
              .filter((s) => !featured.includes(s))
              .map((s) => (
                <li key={s.id}>
                  <StatCard stat={s} compact />
                </li>
              ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
