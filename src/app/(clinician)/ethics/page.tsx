import type { Metadata } from "next";
import { BookOpenCheck, Filter, Gavel, Signpost } from "lucide-react";
import { ethicsCodes, legalTopics } from "@/lib/library";
import { HUB_PROMPTS, PROFESSIONS, PROFESSION_LABELS, ethicsCodesFor, legalTopicsFor } from "@/lib/schemas-hub";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageIntro } from "@/components/content/content-bits";
import { HubPrompt } from "@/components/hub/hub-prompt";
import {
  ALL,
  FacetCount,
  FacetEmpty,
  FacetFilterProvider,
  FacetGate,
  FacetReset,
  FacetSelect,
  type FacetOption,
} from "@/components/ethics/facet-filter";
import { EthicsCodeCard, LegalTopicCard } from "@/components/ethics/hub-cards";
import { HUB_CONTEXTS, HUB_CONTEXT_LABELS, buildHubIndex, countryLabel, hubCountries } from "@/components/ethics/hub-labels";

export const metadata: Metadata = { title: "Ethics & Legal Hub" };

/**
 * Screen 8: Ethics & Legal Hub (docs/SPEC.md sections 3, 7, 8). Server-rendered so every #id anchor works; the
 * profession and country filters only show or hide cards (memory only, nothing in the URL or storage).
 */
export default function EthicsPage() {
  const codes = ethicsCodesFor(ethicsCodes); // national, regional, then global; alphabetical within each
  const topics = legalTopicsFor(legalTopics);
  const countries = hubCountries(codes, topics);
  const index = buildHubIndex(codes, topics, countries);
  const items = { ethics: codes.map((c) => c.id), legal: topics.map((t) => t.id) };
  const names = new Map<string, string>([
    ...codes.map((c) => [c.id, c.shortName] as const),
    ...topics.map((t) => [t.id, t.title] as const),
  ]);

  const professionOptions: FacetOption[] = [
    { value: ALL, label: "All professions" },
    ...PROFESSIONS.map((p) => ({ value: p, label: PROFESSION_LABELS[p] })),
  ];
  const countryOptions: FacetOption[] = [
    { value: ALL, label: "All countries" },
    ...countries.map((c) => ({ value: c, label: countryLabel(c) })),
  ];

  return (
    <>
      <PageIntro title="Ethics & Legal Hub" eyebrow="Codes and laws by profession and country">
        <p>
          Original summaries of the professional codes and laws that shape everyday practice, each with a link to the
          official text. This is information, not legal advice: read the official source, and consult your licensing
          board or a healthcare attorney about your own situation.
        </p>
      </PageIntro>

      <section aria-labelledby="when-heading" className="mb-8">
        <h2 id="when-heading" className="flex items-center gap-2 text-xl font-bold">
          <Signpost aria-hidden className="size-5 text-accent" />
          When this comes up
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Other screens show these reminders when the situation arises. Each one links to the codes and topics below.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HUB_CONTEXTS.map((ctx) => {
            const p = HUB_PROMPTS[ctx];
            const ids = [...p.ethicsIds, ...p.legalIds].filter((id) => names.has(id));
            return (
              <li key={ctx}>
                <Card className="flex h-full flex-col gap-2">
                  <h3 className="text-base font-semibold">{HUB_CONTEXT_LABELS[ctx]}</h3>
                  <p className="text-sm leading-relaxed text-muted">{p.message}</p>
                  {ids.length ? (
                    <ul className="mt-auto flex flex-col gap-0.5 pt-1 text-sm">
                      {ids.map((id) => (
                        <li key={id}>
                          <a
                            href={`#${id}`}
                            className="inline-flex min-h-11 items-center font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                          >
                            {names.get(id)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <FacetFilterProvider index={index} items={items}>
        <section aria-labelledby="filter-heading" className="mb-8">
          <Card className="space-y-4">
            <h2 id="filter-heading" className="flex items-center gap-2 text-lg font-semibold">
              <Filter aria-hidden className="size-5 text-muted" />
              Filter by profession and country
            </h2>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] md:items-end">
              <FacetSelect facet="profession" label="Profession" options={professionOptions} />
              <FacetSelect facet="country" label="Country" options={countryOptions} />
              <FacetReset label="Show all" className="w-full md:w-auto" />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Global frameworks are always included. Legal topics follow the country only. Wherever you practice, your
              licensing board or regulator sets the rules that bind you.
            </p>
          </Card>
        </section>

        <section aria-labelledby="codes-heading" className="mb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="codes-heading" className="flex items-center gap-2 text-xl font-bold">
              <BookOpenCheck aria-hidden className="size-5 text-accent" />
              Ethics codes
            </h2>
            <FacetCount group="ethics" singular="code" plural="codes" />
          </div>
          <FacetEmpty group="ethics">
            <Notice tone="neutral" title="No code in this list matches both filters">
              <p>
                Try All countries or All professions. Your national association and your licensing board or regulator
                remain the authoritative sources.
              </p>
            </Notice>
          </FacetEmpty>
          <ul className="space-y-5">
            {codes.map((c) => (
              <FacetGate key={c.id} as="li" group="ethics" id={c.id}>
                <EthicsCodeCard code={c} />
              </FacetGate>
            ))}
          </ul>
        </section>

        <section aria-labelledby="legal-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="legal-heading" className="flex items-center gap-2 text-xl font-bold">
              <Gavel aria-hidden className="size-5 text-accent" />
              Legal and regulatory topics
            </h2>
            <FacetCount group="legal" singular="topic" plural="topics" />
          </div>
          <div className="mb-5 space-y-3">
            <HubPrompt context="telehealth" />
            <p className="text-sm text-muted">
              Information, not legal advice. Duties such as warning, reporting and record keeping differ by state and
              country; every topic ends by pointing you to your licensing board or a healthcare attorney.
            </p>
          </div>
          <FacetEmpty group="legal">
            <Notice tone="neutral" title="No legal topic here covers that country yet">
              <p>Check your regulator&apos;s website, or choose All countries to read the general topics.</p>
            </Notice>
          </FacetEmpty>
          <ul className="space-y-5">
            {topics.map((t) => (
              <FacetGate key={t.id} as="li" group="legal" id={t.id}>
                <LegalTopicCard topic={t} />
              </FacetGate>
            ))}
          </ul>
        </section>
      </FacetFilterProvider>
    </>
  );
}
