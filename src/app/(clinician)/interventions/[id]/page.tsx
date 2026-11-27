import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, FileText, GraduationCap, HandHeart, ListTodo } from "lucide-react";
import { getAnyHandout, getIntervention, getPlanLibrary, interventions } from "@/lib/library";
import type { Handout } from "@/lib/schemas";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";
import { HelpTip } from "@/components/symptoms/help-tip";
import {
  ClinicianReviewBadge,
  Governance,
  NextStep,
  PageIntro,
  ReviewBadge,
  SourcesList,
} from "@/components/content/content-bits";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { conditionLabel, isSudCondition, pubmedTargetFor, trialsTargetFor } from "@/components/interventions/catalog";
import { orientationLabel, orientationsOf } from "@/components/interventions/orientation";
import { minutesLabel } from "@/components/interventions/format";
import { ScriptReader } from "@/components/interventions/script-reader";
import { EvidencePanel } from "@/components/interventions/evidence-panel";

export const dynamicParams = false;

export function generateStaticParams() {
  return interventions.map((i) => ({ id: i.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getIntervention(id)?.name ?? "Intervention" };
}

function HandoutLinks({ handouts }: { handouts: Handout[] }) {
  if (!handouts.length) {
    return <p className="text-sm text-muted">No matching handout yet. See the third-party link-outs on the Handouts page.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {handouts.map((h) => (
        <li key={h.id}>
          <Link href={`/handouts/${h.id}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline underline-offset-2">
            <FileText aria-hidden className="size-4 shrink-0" />
            {h.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const JUMP_LINKS = [
  { href: "#steps", label: "Steps" },
  { href: "#script", label: "Script" },
  { href: "#handouts-inline", label: "Handouts", phoneOnly: true },
  { href: "#cultural", label: "Cultural adaptations" },
  { href: "#evidence", label: "Evidence" },
  { href: "#sources", label: "Sources" },
];

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

export default async function InterventionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const iv = getIntervention(id);
  if (!iv) notFound();

  const handouts = iv.handoutIds.map((h) => getAnyHandout(h)).filter((h): h is Handout => Boolean(h));
  const sud = iv.conditions.some(isSudCondition);
  const pubmed = pubmedTargetFor(iv);
  const trials = trialsTargetFor(iv);
  const approaches = orientationsOf(iv).map(orientationLabel);

  return (
    <>
      <Link href="/interventions" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All interventions
      </Link>
      <PageIntro
        title={iv.name}
        eyebrow={`Intervention · ${iv.modality}`}
        badges={
          <>
            <ClinicianReviewBadge />
            <ReviewBadge reviewedBy={iv.reviewedBy} />
            <Badge tone="neutral">
              <Clock aria-hidden className="size-3.5" /> {minutesLabel(iv.minutes)}
            </Badge>
            {iv.trainingRequired ? (
              <Badge tone="warn">
                <GraduationCap aria-hidden className="size-3.5" /> Trained clinicians only
              </Badge>
            ) : null}
            {iv.faithIntegrated ? (
              <Badge tone="neutral">
                <HandHeart aria-hidden className="size-3.5" /> Faith-integrated option
              </Badge>
            ) : null}
          </>
        }
      >
        <p>{iv.purpose}</p>
      </PageIntro>
      <HelpTip title="How to use this page" className="mb-5">
        <p>
          Read the cautions first. The clinician steps say what to do; the script is original wording you can read aloud
          or put in your own words, and Large text makes it easier to read in session.
        </p>
        <p>
          Client handouts can be printed or shared as a link. Evidence results load from PubMed or ClinicalTrials.gov only
          when you ask, and only the intervention&apos;s curated search term is sent.
        </p>
      </HelpTip>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {iv.trainingRequired ? (
            <Notice tone="warn" title="Trained clinicians only" icon={GraduationCap}>
              <p>{iv.trainingRequired}</p>
            </Notice>
          ) : null}
          {sud ? <HubPrompt context="sud" /> : null}

          {/* Safety first: cautions come before the steps and the read-aloud script. */}
          <section aria-labelledby="cautions" className="scroll-mt-6">
            <h2 id="cautions" className="sr-only">
              Cautions and contraindications
            </h2>
            <Notice tone="warn" title="Cautions and contraindications">
              <ul className="list-disc space-y-1.5 pl-5">
                {iv.contraindications.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <p className="pt-1">
                Risk decisions stay with you. In a crisis: in the US call or text 988; elsewhere, the local emergency number
                or findahelpline.com.
              </p>
            </Notice>
          </section>

          <nav aria-label="On this page" className="-mt-2">
            <ul className="flex flex-wrap gap-x-4 text-sm">
              {JUMP_LINKS.map((l) => (
                <li key={l.href} className={l.phoneOnly ? "lg:hidden" : undefined}>
                  <a href={l.href} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <Section id="steps" title="Clinician steps">
            <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed marker:font-semibold">
              {iv.steps.map((s, i) => (
                <li key={i} className="pl-1">
                  {s}
                </li>
              ))}
            </ol>
          </Section>

          <section aria-labelledby="script" className="scroll-mt-6">
            <Card className="space-y-4">
              <h2 id="script" className="text-lg font-semibold">
                Script
              </h2>
              <ScriptReader script={iv.script} headingId="script" />
            </Card>
          </section>

          {/* Small screens: handouts right after the script (the sidebar card shows from lg). */}
          <section aria-labelledby="handouts-inline" className="scroll-mt-6 lg:hidden">
            <Card className="space-y-3">
              <h2 id="handouts-inline" className="text-lg font-semibold">
                Client handouts
              </h2>
              <HandoutLinks handouts={handouts} />
            </Card>
          </section>

          <Section id="cultural" title="Cultural adaptations">
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {iv.culturalAdaptations.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Section>

          {iv.faithIntegrated ? (
            <Section id="faith" title="Faith-integrated variant (optional, client-led)">
              <p className="text-sm text-muted">
                Use only when the client asks for their faith to be part of the work. Open to see the consent reminder
                first, then the variant.
              </p>
              <Disclosure
                title="Show the consent reminder and the faith-integrated variant"
                icon={HandHeart}
                bordered={false}
                className="rounded-xl border border-border px-4"
                bodyClassName="space-y-4 border-t border-border pt-4"
              >
                <Notice tone="accent" title="Informed consent comes first" icon={HandHeart}>
                  <p>{iv.faithIntegrated.consentNote}</p>
                </Notice>
                <HubPrompt context="faith-based" />
                <div>
                  <h3 className="text-base font-semibold">The variant</h3>
                  <p className="mt-1 leading-relaxed">{iv.faithIntegrated.note}</p>
                </div>
              </Disclosure>
            </Section>
          ) : null}

          <Section id="evidence" title="Evidence">
            <p className="text-sm leading-relaxed">{iv.evidenceLevel}</p>
            <div className="border-t border-border pt-4">
              <EvidencePanel pubmed={pubmed} trials={trials} />
            </div>
          </Section>

          <Section id="sources" title="Sources and review">
            <SourcesList sources={iv.sources} />
            <Governance license={iv.license} lastVerified={iv.lastVerified} reviewedBy={iv.reviewedBy} />
          </Section>

          <NextStep href="/handouts" label="Step 6 · Handouts" />
        </div>

        <aside aria-label="At a glance" className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-4">
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">At a glance</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="font-semibold">Time</dt>
              <dd>{minutesLabel(iv.minutes)}</dd>
              <dt className="font-semibold">Approach</dt>
              <dd>{approaches.join("; ")}</dd>
              <dt className="font-semibold">Training</dt>
              <dd>{iv.trainingRequired ? "Specialist training required" : "No specialist training listed"}</dd>
            </dl>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Used for</h2>
            <ul className="space-y-2 text-sm">
              {iv.conditions.map((c) => (
                <li key={c} className="flex flex-wrap items-center justify-between gap-x-3">
                  <span>{conditionLabel(c)}</span>
                  {getPlanLibrary(c) ? (
                    <Link
                      href={`/plan?condition=${c}`}
                      className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent underline underline-offset-2"
                    >
                      <ListTodo aria-hidden className="size-4" />
                      Build a plan <span className="sr-only">for {conditionLabel(c)}</span>
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Possible uses for clinician review; not a diagnosis.</p>
          </Card>

          <Card className="hidden space-y-3 lg:block">
            <h2 className="text-lg font-semibold">Client handouts</h2>
            <HandoutLinks handouts={handouts} />
          </Card>
        </aside>
      </div>
    </>
  );
}
