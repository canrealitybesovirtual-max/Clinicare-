import type { Metadata } from "next";
import { BookOpenCheck, CalendarClock, Compass, Filter, Gavel, ListTree, Signpost } from "lucide-react";
import { ethicsCodes, legalTopics } from "@/lib/library";
import { HUB_PROMPTS, PROFESSIONS, PROFESSION_LABELS, ethicsCodesFor, legalTopicsFor } from "@/lib/schemas-hub";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";
import { PageIntro } from "@/components/content/content-meta";
import { HelpTip } from "@/components/ui/help-tip";
import { HubPrompt } from "@/components/hub/hub-prompt";
import {
  FacetCount,
  FacetEmpty,
  FacetFilterProvider,
  FacetGate,
  FacetReset,
  FacetSelect,
  FacetSessionCountry,
} from "@/components/ethics/facet-filter";
import { ALL, type FacetOption } from "@/components/ethics/facet-index";
import { EthicsCodeCard, LegalTopicCard } from "@/components/ethics/hub-cards";
import {
  HUB_CONTEXTS,
  HUB_CONTEXT_LABELS,
  LEGAL_KIND_LABELS,
  buildHubIndex,
  countryLabel,
  hubCountries,
} from "@/components/ethics/hub-labels";

export const metadata: Metadata = { title: "Ethics & Legal Hub" };

const chip =
  "inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-sm font-medium text-text hover:border-accent hover:bg-surface-2";

/**
 * Screen 8: Ethics & Legal Hub (docs/SPEC.md sections 3, 7, 8). Server-rendered so every #id anchor works; the
 * profession and country filters only show or hide cards (memory only, nothing in the URL or storage). Three
 * sections: professional codes, ethics in practice (questions codes answer more than statutes do), and laws.
 */
export default function EthicsPage() {
  const codes = ethicsCodesFor(ethicsCodes); // national, regional, then global; alphabetical within each
  const topics = legalTopicsFor(legalTopics);
  const practice = topics.filter((t) => t.kind === "ethics-practice").sort((a, b) => a.title.localeCompare(b.title));
  const laws = topics.filter((t) => t.kind === "legal").sort((a, b) => a.title.localeCompare(b.title));
  const practiceIds = practice.map((t) => t.id);
  const lawIds = laws.map((t) => t.id);
  const countries = hubCountries(codes, topics);
  const index = buildHubIndex(codes, topics, countries);
  const items = { ethics: codes.map((c) => c.id), legal: topics.map((t) => t.id) };
  const names = new Map<string, string>([
    ...codes.map((c) => [c.id, c.shortName] as const),
    ...topics.map((t) => [t.id, t.title] as const),
  ]);

  const jumpList = [
    ...codes.map((c) => ({ id: c.id, label: c.shortName })),
    ...topics.map((t) => ({ id: t.id, label: t.title })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const sections = [
    { id: "codes-heading", label: "Ethics codes", n: codes.length },
    { id: "practice-heading", label: LEGAL_KIND_LABELS["ethics-practice"], n: practice.length },
    { id: "legal-heading", label: LEGAL_KIND_LABELS.legal, n: laws.length },
    { id: "when-heading", label: "When this comes up", n: HUB_CONTEXTS.length },
  ];

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
      <PageIntro title="Ethics & Legal Hub" eyebrow="Codes, ethics in practice and laws" compact>
        <p>
          Original summaries of professional codes, everyday ethics questions and laws, each linked to the official text.
          Information, not legal advice.
        </p>
      </PageIntro>
      <HelpTip title="How to use the hub" className="mb-5">
        <p>
          Choose your profession and country to see the codes and topics that apply. Each card gives a short summary in
          the app&apos;s own words and a link to the official text; open a card&apos;s details for key points, questions
          to ask yourself and what to do.
        </p>
        <p>
          Other screens link here when a situation comes up, such as faith-based care, substance use records, groups or
          letters for a court. This is information, not legal advice: read the official source, and ask your licensing
          board or a healthcare attorney about your own situation.
        </p>
      </HelpTip>

      <FacetFilterProvider index={index} items={items}>
        <FacetSessionCountry facet="country" allowed={countries} />
        <section aria-labelledby="filter-heading" className="mb-6">
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
              Global frameworks and ethics-in-practice topics are always included. Laws follow the country only. The
              country starts at the one chosen for crisis numbers. Wherever you practice, your licensing board or
              regulator sets the rules that bind you.
            </p>
          </Card>
        </section>

        <nav aria-label="On this page" className="mb-8 space-y-3">
          <ul className="flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={chip}>
                  {s.label}
                  <span className="ml-1.5 text-xs font-normal text-muted">{s.n}</span>
                </a>
              </li>
            ))}
          </ul>
          <Disclosure
            title={`Jump to a code or topic (A–Z, ${jumpList.length})`}
            icon={ListTree}
            bordered={false}
            className="rounded-xl border border-border bg-surface px-4"
          >
            <ul className="flex flex-wrap gap-1.5">
              {jumpList.map((j) => (
                <li key={j.id}>
                  <a href={`#${j.id}`} className={chip}>
                    {j.label}
                  </a>
                </li>
              ))}
            </ul>
          </Disclosure>
        </nav>

        <section aria-labelledby="codes-heading" className="mb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="codes-heading" className="flex scroll-mt-6 items-center gap-2 text-xl font-bold">
              <BookOpenCheck aria-hidden className="size-5 text-accent" />
              Ethics codes
            </h2>
            <FacetCount group="ethics" singular="code" plural="codes" />
          </div>
          <p className="mb-4 flex max-w-3xl items-start gap-2 text-sm text-muted">
            <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
            Each card is a summary in the app&apos;s own words, not legal advice. Codes are revised from time to time:
            check for newer editions every year.
          </p>
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

        <section aria-labelledby="practice-heading" className="mb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="practice-heading" className="flex scroll-mt-6 items-center gap-2 text-xl font-bold">
              <Compass aria-hidden className="size-5 text-accent" />
              {LEGAL_KIND_LABELS["ethics-practice"]}
            </h2>
            <FacetCount group="legal" ids={practiceIds} singular="topic" plural="topics" />
          </div>
          <p className="mb-5 max-w-3xl text-sm text-muted">
            Everyday questions that codes answer more than statutes do, such as boundaries, competence, groups and
            contested methods. For clinician review: each topic offers questions to ask yourself and steps to consider,
            never a decision. Information, not legal advice.
          </p>
          <ul className="space-y-5">
            {practice.map((t) => (
              <FacetGate key={t.id} as="li" group="legal" id={t.id}>
                <LegalTopicCard topic={t} />
              </FacetGate>
            ))}
          </ul>
        </section>

        <section aria-labelledby="legal-heading" className="mb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="legal-heading" className="flex scroll-mt-6 items-center gap-2 text-xl font-bold">
              <Gavel aria-hidden className="size-5 text-accent" />
              {LEGAL_KIND_LABELS.legal}
            </h2>
            <FacetCount group="legal" ids={lawIds} singular="topic" plural="topics" />
          </div>
          <div className="mb-5 space-y-3">
            <HubPrompt context="telehealth" />
            <p className="text-sm text-muted">
              Information, not legal advice. Duties such as warning, reporting and record keeping differ by state and
              country; every topic ends by pointing you to your licensing board or a healthcare attorney.
            </p>
          </div>
          <FacetEmpty group="legal" ids={lawIds}>
            <Notice tone="neutral" title="No law topic here covers that country yet">
              <p>Check your regulator&apos;s website, or choose All countries to read the general topics.</p>
            </Notice>
          </FacetEmpty>
          <ul className="space-y-5">
            {laws.map((t) => (
              <FacetGate key={t.id} as="li" group="legal" id={t.id}>
                <LegalTopicCard topic={t} />
              </FacetGate>
            ))}
          </ul>
        </section>

        <section aria-labelledby="when-heading">
          <h2 id="when-heading" className="flex scroll-mt-6 items-center gap-2 text-xl font-bold">
            <Signpost aria-hidden className="size-5 text-accent" />
            When this comes up
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Other screens show these reminders when the situation arises. Each one links to the codes and topics above.
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
                      <ul className="mt-1 flex flex-col gap-0.5 text-sm">
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
      </FacetFilterProvider>
    </>
  );
}
