import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookMarked, FileText, GraduationCap, Scale } from "lucide-react";
import { getOrientation, orientationLinks, orientations } from "@/lib/orientations";
import { EVIDENCE_TIER_LABELS, ORIENTATION_FAMILY_LABELS } from "@/lib/schemas-orientations";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { ClinicianReviewBadge, Governance, NextStep, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-meta";
import { EvidenceTierBadge, TrainingBadge } from "@/components/orientations/orientation-badges";
import { TechniqueList } from "@/components/orientations/technique-list";

export const dynamicParams = false;

export function generateStaticParams() {
  return orientations.map((o) => ({ id: o.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getOrientation(id)?.name ?? "Orientation" };
}

const linkClass =
  "inline-flex min-h-11 items-center font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent";

/**
 * Readable name for a curated id whose page belongs to another section (practice guides, populations) and whose
 * loader this page does not import.
 */
function idLabel(id: string): string {
  const text = id.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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

const JUMP_LINKS = [
  { href: "#ideas", label: "Key ideas" },
  { href: "#fit", label: "Fit and cautions" },
  { href: "#techniques", label: "Techniques" },
  { href: "#evidence", label: "Evidence" },
  { href: "#training", label: "Training and ethics" },
  { href: "#sources", label: "Sources" },
];

export default async function OrientationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = getOrientation(id);
  if (!o) notFound();

  const links = orientationLinks(o);
  const tier = EVIDENCE_TIER_LABELS[o.evidenceTier];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/orientations" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All orientations
      </Link>
      <PageIntro
        title={o.name}
        eyebrow={`Orientation · ${ORIENTATION_FAMILY_LABELS[o.family]}`}
        badges={
          <>
            <ClinicianReviewBadge />
            <ReviewBadge reviewedBy={o.reviewedBy} />
            <EvidenceTierBadge tier={o.evidenceTier} />
            <TrainingBadge orientation={o} />
          </>
        }
      >
        <p>{o.summary}</p>
      </PageIntro>

      <div className="space-y-6">
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">At a glance</h2>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold">Evidence</dt>
            <dd>
              {tier.label} for its best-supported model. <span className="text-muted">{tier.meaning}</span>
            </dd>
            <dt className="font-semibold">Training</dt>
            <dd>
              {o.trainingRequired
                ? "Trained clinicians only for every model."
                : o.models.some((m) => m.trainingRequired)
                  ? "Some models need specific training; others are within general clinical training."
                  : "Within general clinical training."}{" "}
              <a href="#training" className="font-semibold text-accent underline underline-offset-2">
                Training and ethics
              </a>
            </dd>
            <dt className="font-semibold">In the library</dt>
            <dd>
              {links.typical.length ? `${links.typical.length} ${links.typical.length === 1 ? "technique" : "techniques"}` : "Overview only"}
              {links.related.length ? `, plus ${links.related.length} related ${links.related.length === 1 ? "skill" : "skills"} that partly fit` : ""}
            </dd>
          </dl>
          <p className="text-xs leading-relaxed text-muted">
            Reference only: the app does not rank orientations or decide which one a client should receive. Choose with the
            client, within your training and scope.
          </p>
        </Card>

        {o.trainingRequired ? (
          <Notice tone="warn" title="Trained clinicians only" icon={GraduationCap}>
            <p>
              Every model in this profile needs its own training. Use this page as an overview for referral and for
              informed-consent conversations; see Training and ethics for the training bodies.
            </p>
          </Notice>
        ) : null}

        <nav aria-label="On this page">
          <ul className="flex flex-wrap gap-x-4 text-sm">
            {JUMP_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={linkClass}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="ideas" title="Key ideas">
          <dl className="space-y-3 text-sm leading-relaxed">
            {o.keyConcepts.map((k) => (
              <div key={k.term}>
                <dt className="font-semibold">{k.term}</dt>
                <dd className="text-muted">{k.meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="view" title="How it understands problems and change">
          {(
            [
              ["The problem", o.viewOfProblem],
              ["How change happens", o.viewOfChange],
              ["The therapist's stance", o.therapistStance],
            ] as const
          ).map(([heading, body]) => (
            <div key={heading}>
              <h3 className="text-base font-semibold">{heading}</h3>
              <p className="mt-1 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </Section>

        <Section id="session" title="A typical session">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed marker:font-semibold">
            {o.sessionShape.map((s, i) => (
              <li key={i} className="pl-1">
                {s}
              </li>
            ))}
          </ol>
        </Section>

        <Section id="goals" title="Goals, progress and formulation">
          <div>
            <h3 className="text-base font-semibold">How goals are written</h3>
            <p className="mt-1 text-sm leading-relaxed">{o.goalStyle}</p>
          </div>
          <div>
            <h3 className="text-base font-semibold">How progress shows</h3>
            <div className="mt-1">
              <Bullets items={o.progressMarkers} />
            </div>
          </div>
          {links.formulations.length ? (
            <div>
              <h3 className="text-base font-semibold">Formulation frameworks</h3>
              <ul className="mt-1 text-sm">
                {links.formulations.map((f) => (
                  <li key={f.id}>
                    <Link href={`/formulations/${f.id}`} className={`${linkClass} gap-2`}>
                      <BookMarked aria-hidden className="size-4 shrink-0" />
                      {f.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        <Section id="fit" title="Fit, cautions and when to refer">
          <div>
            <h3 className="text-base font-semibold">Often a good fit for</h3>
            <div className="mt-1">
              <Bullets items={o.bestFit} />
            </div>
          </div>
          <Notice tone="warn" title="Cautions">
            <ul className="list-disc space-y-1.5 pl-5">
              {o.cautions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            <p className="pt-1">
              Risk decisions stay with you. In a crisis: in the US call or text 988; elsewhere, the local emergency number or
              findahelpline.com.
            </p>
          </Notice>
          <div>
            <h3 className="text-base font-semibold">When to refer or step up</h3>
            <div className="mt-1">
              <Bullets items={o.whenToRefer} />
            </div>
          </div>
        </Section>

        <Section id="techniques" title="Techniques in the library">
          {links.typical.length ? (
            <TechniqueList items={links.typical} label={`${o.shortName} techniques`} />
          ) : (
            <p className="text-sm text-muted">
              The library has no technique entries for this orientation: it is described as an overview for referral.
            </p>
          )}
          {links.related.length ? (
            <div>
              <h3 className="text-base font-semibold">Related techniques that partly fit</h3>
              <div className="mt-1">
                <TechniqueList items={links.related} label="Related techniques" />
              </div>
            </div>
          ) : null}
          {o.missingTechniques.length ? (
            <div>
              <h3 className="text-base font-semibold">Not yet in the library</h3>
              <ul className="mt-1 space-y-1.5 text-sm leading-relaxed">
                {o.missingTechniques.map((m) => (
                  <li key={m.name}>
                    <span className="font-semibold">{m.name}.</span> <span className="text-muted">{m.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        <Section id="evidence" title="Models and evidence">
          <p className="text-sm leading-relaxed">{o.evidenceSummary}</p>
          <ul className="space-y-3">
            {o.models.map((m) => (
              <li key={m.name} className="rounded-xl border border-border p-4">
                <h3 className="text-base font-semibold leading-snug">{m.name}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <EvidenceTierBadge tier={m.evidenceTier} />
                  {m.trainingRequired ? (
                    <Badge tone="warn">
                      <GraduationCap aria-hidden className="size-3.5" /> Trained clinicians only
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed">{m.summary}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{m.evidence}</p>
              </li>
            ))}
          </ul>
        </Section>

        {o.responsiveness?.length ? (
          <Section id="responsiveness" title="Adapting therapy to the person">
            <p className="text-sm text-muted">
              Research-based ways to adjust any approach. These are prompts for your judgment and for discussion with the
              client; the app never asks for these characteristics or matches a client to anything.
            </p>
            <ul className="space-y-4">
              {o.responsiveness.map((r) => (
                <li key={r.characteristic}>
                  <h3 className="text-base font-semibold">{r.characteristic}</h3>
                  <p className="mt-1 text-sm leading-relaxed">{r.adaptation}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{r.evidence}</p>
                  {r.practiceIds.length ? (
                    <ul className="mt-1 flex flex-wrap gap-x-4 text-sm">
                      {r.practiceIds.map((p) => (
                        <li key={p}>
                          <Link href={`/practice/${p}`} className={linkClass}>
                            {idLabel(p)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section id="training" title="Training and ethics">
          <p className="text-sm leading-relaxed">{o.trainingNote}</p>
          {o.trainingPath.length ? (
            <ul className="space-y-2 text-sm">
              {o.trainingPath.map((t) => (
                <li key={t.url}>
                  <ExternalLink href={t.url}>{t.body}</ExternalLink>
                  <span className="block text-muted">{t.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">There is no certifying body for this orientation.</p>
          )}
          <div className="border-t border-border pt-4">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Scale aria-hidden className="size-4 text-muted" />
              Ethics prompts
            </h3>
            <ul className="mt-2 space-y-3 text-sm leading-relaxed">
              {links.ethics.map((e) => (
                <li key={e.prompt}>
                  {e.prompt}
                  {e.topics.length ? (
                    <span className="flex flex-wrap gap-x-4">
                      {e.topics.map((t) => (
                        <Link key={t.id} href={`/ethics#${t.id}`} className={linkClass}>
                          {t.title}
                        </Link>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="culture" title="Culture and context">
          <Bullets items={o.culturalNotes} />
          {o.relatedPopulationIds.length || o.relatedPracticeIds.length ? (
            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              {(
                [
                  ["Practice guides", "practice", o.relatedPracticeIds],
                  ["Population adaptations", "populations", o.relatedPopulationIds],
                ] as const
              ).map(([title, route, ids]) =>
                ids.length ? (
                  <div key={route}>
                    <h3 className="text-base font-semibold">{title}</h3>
                    <ul className="mt-1 text-sm">
                      {ids.map((p) => (
                        <li key={p}>
                          <Link href={`/${route}/${p}`} className={linkClass}>
                            {idLabel(p)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          ) : null}
        </Section>

        {links.handouts.length ? (
          <Section id="handouts" title="Client handouts">
            <ul className="space-y-1 text-sm">
              {links.handouts.map((h) => (
                <li key={h.id}>
                  <Link href={`/handouts/${h.id}`} className={`${linkClass} gap-2`}>
                    <FileText aria-hidden className="size-4 shrink-0" />
                    {h.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section id="sources" title="Sources and review">
          <SourcesList sources={o.sources} />
          <Governance license={o.license} lastVerified={o.lastVerified} reviewedBy={o.reviewedBy} />
        </Section>
      </div>

      <NextStep href="/interventions" label="Interventions" />
    </div>
  );
}
