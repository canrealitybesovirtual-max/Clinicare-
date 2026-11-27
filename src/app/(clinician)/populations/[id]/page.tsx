import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookMarked, Compass, FileText, HeartHandshake, MessageCircleQuestion, Route, Scale, Sparkles } from "lucide-react";
import { PART2_NOTICE, getPopulation, populationLinks, populations } from "@/lib/populations";
import { POPULATION_GROUP_LABELS } from "@/lib/schemas-populations";
import { ClinicianReviewBadge, Governance, NextStep, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-meta";
import { CrisisPanel } from "@/components/crisis/crisis-panel";
import { DirectoryEntryCard } from "@/components/referrals/directory-entry";
import { KIND_LABELS } from "@/components/referrals/referral-format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { ReportProblemLink } from "@/components/content/report-problem-link";

export const dynamicParams = false;

export function generateStaticParams() {
  return populations.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getPopulation(id)?.name ?? "Population adaptations" };
}

const linkClass =
  "inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-6">
      <Card className="space-y-4">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function LinkGroup({ title, icon: Icon, links }: { title: string; icon: typeof FileText; links: { href: string; label: string }[] }) {
  if (!links.length) return null;
  return (
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="mt-1 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={linkClass}>
              <Icon aria-hidden className="size-4 shrink-0" />
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function PopulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPopulation(id);
  if (!p) notFound();

  const links = populationLinks(p);
  const group = POPULATION_GROUP_LABELS[p.group];
  const hasResources = links.referrals.length > 0 || p.referralKinds.length > 0 || p.linkOuts.length > 0;
  const jump = [
    { href: "#ask", label: "Questions to ask" },
    { href: "#considerations", label: "Considerations" },
    { href: "#assessment", label: "Assessment" },
    { href: "#sessions", label: "Sessions" },
    { href: "#adapting", label: "Adapting interventions" },
    { href: "#safety", label: "Safety" },
    ...(hasResources ? [{ href: "#resources", label: "Referrals and resources" }] : []),
    { href: "#sources", label: "Sources" },
  ];
  const related = [
    { title: "Client handouts", icon: FileText, links: links.handouts.map((h) => ({ href: `/handouts/${h.id}`, label: h.title })) },
    { title: "Client topics (client mode)", icon: Sparkles, links: links.topics.map((t) => ({ href: `/client/topics/${t.id}`, label: t.clientLabel })) },
    { title: "Practice guides", icon: Route, links: links.practice.map((g) => ({ href: `/practice/${g.id}`, label: g.title })) },
    { title: "Formulation frameworks", icon: BookMarked, links: links.formulations.map((f) => ({ href: `/formulations/${f.id}`, label: f.name })) },
    { title: "Related orientations", icon: Compass, links: links.orientations.map((o) => ({ href: `/orientations/${o.id}`, label: o.name })) },
    {
      title: "Legal and ethics topics",
      icon: Scale,
      links: [...links.legal.map((t) => ({ href: `/ethics#${t.id}`, label: t.title })), ...links.ethics.map((c) => ({ href: `/ethics#${c.id}`, label: c.shortName }))],
    },
  ].filter((r) => r.links.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/populations" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All population adaptations
      </Link>
      <PageIntro
        title={p.name}
        eyebrow={`Population adaptations · ${group.label}`}
        badges={
          <>
            <ClinicianReviewBadge />
            <ReviewBadge reviewedBy={p.reviewedBy} />
            {p.sud ? <Badge tone="warn">42 CFR Part 2</Badge> : null}
          </>
        }
      >
        <p>{p.summary}</p>
      </PageIntro>

      <div className="space-y-6">
        <Notice tone="accent" title="Ask, do not assume">
          <p>{p.stereotypeCaution}</p>
          <p className="text-muted">{p.scopeNote}</p>
        </Notice>

        {p.sud ? (
          <Notice tone="warn" title="Substance-use content">
            <p className="font-semibold">{PART2_NOTICE}</p>
            <p>Records and exports that include a client&apos;s substance-use information need Part 2 consent before they are shared.</p>
          </Notice>
        ) : null}

        <nav aria-label="On this page">
          <ul className="flex flex-wrap gap-x-4 text-sm">
            {jump.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={linkClass}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="ask" title="Questions to explore together">
          <p className="text-sm text-muted">Written for this app. Ask only what is relevant, in your own words, and let the person lead.</p>
          <ul className="space-y-2.5">
            {p.askAbout.map((q) => (
              <li key={q} className="flex gap-2.5 rounded-xl border-l-4 border-accent/50 bg-surface-2 px-4 py-3 text-sm leading-relaxed">
                <MessageCircleQuestion aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="considerations" title="Why it matters and key considerations">
          <p className="text-sm leading-relaxed">{p.whyItMatters}</p>
          <Bullets items={p.keyConsiderations} />
        </Section>

        <Section id="assessment" title="Assessment">
          <Bullets items={p.assessmentAdaptations} />
          <div>
            <h3 className="text-base font-semibold">Measures</h3>
            <div className="mt-2">
              <Bullets items={p.measureNotes} />
            </div>
          </div>
          {p.measuresPending.length ? (
            <div>
              <h3 className="text-base font-semibold">Other measures (license pending, link-out only)</h3>
              <p className="mt-0.5 text-sm text-muted">Not built into the app until their terms are confirmed. Only the GAD-7 and PHQ-9 are built in.</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {p.measuresPending.map((m) => (
                  <li key={m.licenseKey}>
                    <ExternalLink href={m.url} className="inline-flex min-h-11 items-center">{m.name}</ExternalLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        <Section id="sessions" title="Sessions">
          <Bullets items={p.sessionAdaptations} />
        </Section>

        <Section id="adapting" title="Adapting interventions">
          <ClinicianReviewBadge />
          <ul className="space-y-4">
            {links.adaptations.map((a) => {
              const target =
                a.kind === "intervention"
                  ? { href: `/interventions/${a.intervention.id}`, label: a.intervention.name, Icon: HeartHandshake }
                  : { href: `/orientations/${a.orientation.id}`, label: `${a.orientation.name} (orientation)`, Icon: Compass };
              return (
                <li key={target.href} className="space-y-0.5 text-sm leading-relaxed">
                  <Link href={target.href} className={linkClass}>
                    <target.Icon aria-hidden className="size-4 shrink-0" />
                    {target.label}
                  </Link>
                  <p>{a.note}</p>
                </li>
              );
            })}
          </ul>
        </Section>

        <section aria-labelledby="safety" className="scroll-mt-6">
          <Card className="space-y-4">
            <h2 id="safety" className="text-lg font-semibold">
              Safety
            </h2>
            <Bullets items={p.safetyNotes} />
            {p.cautions.length ? (
              <Notice tone="warn" title="Avoid">
                <ul className="list-disc space-y-1.5 pl-5">
                  {p.cautions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            <p className="text-sm text-muted">Risk decisions stay with you. This app never scores or decides risk.</p>
            <CrisisPanel headingLevel="h3" />
          </Card>
        </section>

        {hasResources ? (
          <Section id="resources" title="Referrals and community resources">
            {links.referrals.length ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {links.referrals.map((e) => (
                  <li key={e.id}>
                    <DirectoryEntryCard entry={e} headingLevel="h3" />
                  </li>
                ))}
              </ul>
            ) : null}
            {p.referralKinds.length ? (
              <p className="text-sm">
                More in the{" "}
                <Link href="/referrals#directory" className="font-semibold text-accent underline underline-offset-2">
                  Referrals directory
                </Link>
                : {p.referralKinds.map((k) => KIND_LABELS[k]).join(", ")}.
              </p>
            ) : null}
            {p.linkOuts.length ? (
              <div>
                <h3 className="text-base font-semibold">Official and community resources</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {p.linkOuts.map((l) => (
                    <li key={l.url}>
                      <ExternalLink href={l.url} className="inline-flex min-h-11 items-center">{l.title}</ExternalLink>
                      <span className="text-muted"> · {l.publisher}</span>
                      {l.note ? <span className="block text-muted">{l.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>
        ) : null}

        {related.length ? (
          <Section id="related" title="Related in the app">
            <div className="grid gap-4 sm:grid-cols-2">
              {related.map((r) => (
                <LinkGroup key={r.title} title={r.title} icon={r.icon} links={r.links} />
              ))}
            </div>
          </Section>
        ) : null}

        <Section id="sources" title="Sources and review">
          <SourcesList sources={p.sources} />
          <Governance license={p.license} lastVerified={p.lastVerified} reviewedBy={p.reviewedBy} />
          <ReportProblemLink type="population" id={p.id} />
        </Section>
      </div>

      <NextStep href="/populations" label="All population adaptations" />
    </div>
  );
}
