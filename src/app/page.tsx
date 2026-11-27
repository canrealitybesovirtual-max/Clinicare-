import { measures, stats } from "@/lib/content";
import { allConditions, allHandouts, ethicsCodes, interventions, legalTopics } from "@/lib/library";
import { MEDICATIONS } from "@/lib/schemas-medications";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { ReviewBadge, StatCard } from "@/components/content/content-meta";
import { ContinueCard } from "@/components/home/continue-card";
import { HomeHero } from "@/components/home/home-hero";
import { StartHere } from "@/components/home/start-here";

/**
 * Home (clinician mode): continue the session, the positioning statement and one primary action, the guided
 * "Start here" flow, then psychoeducation statistics and content status. Every number comes from the content
 * library. Statistics and content status are English-only content, marked lang="en".
 */
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
    <div className="space-y-12 sm:space-y-16">
      <ContinueCard measures={measures.map((m) => ({ id: m.id, shortName: m.shortName }))} />
      <HomeHero />
      <StartHere
        counts={{
          measures: measures.map((m) => m.shortName),
          ethicsCodes: ethicsCodes.length,
          legalTopics: legalTopics.length,
          medications: MEDICATIONS.length,
        }}
      />

      <section aria-labelledby="stats-heading" lang="en">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="stats-heading" className="text-xl font-semibold">
              Context for psychoeducation
            </h2>
            <p className="mt-1 max-w-reading text-sm text-muted">
              Every figure shows its publisher and data year. Data older than 5 years are flagged.
            </p>
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

      <section aria-labelledby="status-heading" lang="en" className="max-w-3xl rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="status-heading" className="text-lg font-semibold">
            Content status
          </h2>
          <ReviewBadge reviewedBy={pending > 0 ? "PENDING" : "a licensed clinician"} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {pending} of {items.length} content items are awaiting licensed clinical review. All clinical wording is
          original, with named sources{lastVerified ? `, last verified ${lastVerified}` : ""}.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {counts.map((c) => (
            <div key={c.label} className="rounded-xl bg-surface-2 p-3">
              <dt className="text-xs text-muted">{c.label}</dt>
              <dd className="text-lg font-bold">{c.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
