import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookMarked, Compass, FileText, HeartHandshake, Route, Scale, Users, Wrench } from "lucide-react";
import { PART2_NOTICE, getPracticeGuide, practiceGuides, practiceLinks } from "@/lib/practice";
import { PRACTICE_CATEGORY_LABELS } from "@/lib/schemas-practice";
import { ClinicianReviewBadge, Governance, NextStep, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-meta";
import { CrisisPanel } from "@/components/crisis/crisis-panel";
import { TOOLS } from "@/components/tools/catalog";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { ReportProblemLink } from "@/components/content/report-problem-link";
import { populationName } from "@/lib/cross-links";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";

export const dynamicParams = false;

export function generateStaticParams() {
  return practiceGuides.map((g) => ({ id: g.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getPracticeGuide(id)?.title ?? "Practice guide" };
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

export default async function PracticeGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = getPracticeGuide(id);
  if (!g) notFound();

  const links = practiceLinks(g);
  const category = PRACTICE_CATEGORY_LABELS[g.category];
  const tool = g.toolHref ? TOOLS.find((t) => t.href === g.toolHref) : undefined;
  const jump = [
    { href: "#when", label: "When to use" },
    { href: "#steps", label: "Steps" },
    ...(g.prompts.length ? [{ href: "#wording", label: "Example wording" }] : []),
    { href: "#cautions", label: "Cautions" },
    ...(g.evidenceSummary || g.measuresPending.length || g.linkOuts.length ? [{ href: "#evidence", label: "Evidence and links" }] : []),
    { href: "#sources", label: "Sources" },
  ];
  const related = [
    { title: "Interventions", icon: HeartHandshake, links: links.interventions.map((i) => ({ href: `/interventions/${i.id}`, label: i.name })) },
    { title: "Client handouts", icon: FileText, links: links.handouts.map((h) => ({ href: `/handouts/${h.id}`, label: h.title })) },
    { title: "Formulation frameworks", icon: BookMarked, links: links.formulations.map((f) => ({ href: `/formulations/${f.id}`, label: f.name })) },
    { title: "Other practice guides", icon: Route, links: links.guides.map((p) => ({ href: `/practice/${p.id}`, label: p.title })) },
    { title: "Orientations that use this guide", icon: Compass, links: links.orientations.map((o) => ({ href: `/orientations/${o.id}`, label: o.name })) },
    { title: "Legal and ethics topics", icon: Scale, links: links.legal.map((t) => ({ href: `/ethics#${t.id}`, label: t.title })) },
    { title: "Population adaptations", icon: Users, links: g.relatedPopulationIds.map((p) => ({ href: `/populations/${p}`, label: populationName(p) })) },
  ].filter((r) => r.links.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/practice" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All practice guides
      </Link>
      <PageIntro
        title={g.title}
        eyebrow={`Practice guide · ${category.label}`}
        badges={
          <>
            {g.forClinicianReview ? <ClinicianReviewBadge /> : null}
            <ReviewBadge reviewedBy={g.reviewedBy} />
            {g.sud ? <Badge tone="warn">42 CFR Part 2</Badge> : null}
          </>
        }
      >
        <p>{g.summary}</p>
      </PageIntro>

      <div className="space-y-6">
        {g.sud ? (
          <Notice tone="warn" title="Substance-use content">
            <p className="font-semibold">{PART2_NOTICE}</p>
            <p>Records and exports that include a client&apos;s substance-use information need Part 2 consent before they are shared.</p>
          </Notice>
        ) : null}

        {g.toolHref ? (
          <Link
            href={g.toolHref}
            className="group flex min-h-11 items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent"
          >
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              {tool ? <tool.icon aria-hidden className="size-5" /> : <Wrench aria-hidden className="size-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-base font-semibold">
                {tool ? `Open the ${tool.title.toLowerCase()}` : "Open the tool"}
                <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </span>
              <span className="mt-0.5 block text-sm text-muted">{tool?.line ?? "Works in memory only. Nothing is saved or sent."}</span>
            </span>
          </Link>
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

        <Section id="when" title="When to use it">
          <Bullets items={g.whenToUse} />
        </Section>

        {g.id === "group-formats" ? <HubPrompt context="groups" /> : null}

        {g.crisisPanel ? (
          <section aria-labelledby="crisis" className="scroll-mt-6">
            <Card className="space-y-4">
              <h2 id="crisis" className="text-lg font-semibold">
                If safety is a concern now
              </h2>
              <CrisisPanel headingLevel="h3" />
            </Card>
          </section>
        ) : null}

        <Section id="steps" title="Steps">
          <ol className="space-y-5">
            {g.steps.map((s, i) => (
              <li key={s.heading} className="flex gap-3">
                <span
                  aria-hidden
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h3 className="text-base font-semibold leading-snug">{s.heading}</h3>
                  {s.body ? <p className="text-sm leading-relaxed">{s.body}</p> : null}
                  {s.items ? <Bullets items={s.items} /> : null}
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {g.prompts.length ? (
          <Section id="wording" title="Example wording">
            <p className="text-sm text-muted">Written for this app, not quoted from a manual. Adapt it to your own voice and to the person.</p>
            <ul className="space-y-2.5">
              {g.prompts.map((p, i) => (
                <li key={i} className="rounded-xl border-l-4 border-accent/50 bg-surface-2 px-4 py-3 text-sm leading-relaxed">
                  {p}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section id="cautions" title="Cautions and pitfalls">
          <Notice tone="warn" title="Watch for">
            <ul className="list-disc space-y-1.5 pl-5">
              {g.cautions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            <p className="pt-1">
              Risk decisions stay with you. In a crisis: in the US call or text 988; elsewhere, the local emergency number or
              findahelpline.com.
            </p>
          </Notice>
          {g.adaptations?.length ? (
            <div>
              <h3 className="text-base font-semibold">Adapting it</h3>
              <dl className="mt-2 space-y-3 text-sm leading-relaxed">
                {g.adaptations.map((a) => (
                  <div key={a.context}>
                    <dt className="font-semibold">{a.context}</dt>
                    <dd className="text-muted">{a.adaptation}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </Section>

        {g.evidenceSummary || g.measuresPending.length || g.linkOuts.length ? (
          <Section id="evidence" title="Evidence and links">
            {g.evidenceSummary ? <p className="text-sm leading-relaxed">{g.evidenceSummary}</p> : null}
            {g.measuresPending.length ? (
              <div>
                <h3 className="text-base font-semibold">Other measures (license pending, link-out only)</h3>
                <p className="mt-0.5 text-sm text-muted">Not built into the app until their terms are confirmed. Only the GAD-7 and PHQ-9 are built in.</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {g.measuresPending.map((m) => (
                    <li key={m.url}>
                      <ExternalLink href={m.url} className="inline-flex min-h-11 items-center">{m.name}</ExternalLink>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {g.linkOuts.length ? (
              <div>
                <h3 className="text-base font-semibold">Further reading and tools</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {g.linkOuts.map((l) => (
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
          <SourcesList sources={g.sources} />
          <Governance license={g.license} lastVerified={g.lastVerified} reviewedBy={g.reviewedBy} />
          <ReportProblemLink type="practice" id={g.id} />
        </Section>
      </div>

      <NextStep href="/practice" label="All practice guides" />
    </div>
  );
}
