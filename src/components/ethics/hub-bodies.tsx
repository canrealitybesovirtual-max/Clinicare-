"use client";
/**
 * The long parts of the Ethics & Legal Hub cards (key reminders, key points, questions to ask, what to do, sources
 * and how each item was checked). Loaded as its own chunk the first time a card's disclosure is opened
 * (lazy-hub-body.tsx), so the page HTML carries only the card headers and summaries. Data comes from the same
 * generated content index and zod schemas as the server.
 */
import { CircleHelp, ExternalLink as ExternalIcon, Landmark, ScrollText } from "lucide-react";
import { ethicsRaw } from "@/lib/generated/ethics";
import { legalRaw } from "@/lib/generated/legal";
import {
  EthicsCodeSchema,
  LegalTopicSchema,
  needsHumanCheck,
  type EthicsCode,
  type LegalTopic,
  type Verification,
} from "@/lib/schemas-hub";
import { ClinicianReviewBadge, Governance } from "@/components/content/content-meta";
import { ExternalLink } from "@/components/ui/external-link";
import { CompactSources, LinkList } from "./compact-sources";
import { VERIFICATION_LABELS } from "./hub-labels";

export type HubBodyPart = "ethics-reminders" | "ethics-sources" | "legal-details" | "legal-sources";

const codes = new Map(ethicsRaw.map((r) => EthicsCodeSchema.parse(r)).map((c) => [c.id, c] as const));
const topics = new Map(legalRaw.map((r) => LegalTopicSchema.parse(r)).map((t) => [t.id, t] as const));

function Reminders({ code }: { code: EthicsCode }) {
  return (
    <>
      <ul className="space-y-2">
        {code.keyReminders.map((r) => (
          <li key={r.topic} className="rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
            <span className="font-semibold">{r.topic}. </span>
            {r.text}
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-sm leading-relaxed">
        <Landmark aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <span>
          <span className="font-semibold">Your regulator: </span>
          {code.regulatorNote}
        </span>
      </p>
      {code.relatedLinks?.length ? <LinkList links={code.relatedLinks} /> : null}
    </>
  );
}

function LegalDetails({ topic }: { topic: LegalTopic }) {
  const seeAlso = (topic.seeAlso ?? []).flatMap((id) => {
    const t = topics.get(id);
    return t ? [t] : [];
  });
  return (
    <>
      <div>
        <h4 className="text-sm font-semibold">Key points</h4>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted">
          {topic.keyPoints.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      </div>
      <p>
        <ClinicianReviewBadge />
        <span className="ml-2 text-xs text-muted">Prompts and steps support your judgment; they never decide for you.</span>
      </p>
      {topic.questions?.length ? (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CircleHelp aria-hidden className="size-4 text-accent" />
            Questions to ask yourself
          </h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted">
            {topic.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText aria-hidden className="size-4 text-accent" />
          What to do
        </h4>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:font-semibold marker:text-muted">
          {topic.whatToDo.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      {topic.appPositioning ? (
        <p className="rounded-lg bg-accent-soft p-3 text-sm leading-relaxed">
          <span className="font-semibold">How this app handles it: </span>
          {topic.appPositioning}
        </p>
      ) : null}
      {topic.measuresPending?.length ? (
        <div>
          <h4 className="text-sm font-semibold">Measures (link-out only, not scored here)</h4>
          <ul className="mt-1 space-y-2 text-sm">
            {topic.measuresPending.map((m) => (
              <li key={m.licenseKey}>
                <ExternalLink href={m.url} className="inline-block py-2.5">
                  {m.name}
                </ExternalLink>
                <p className="text-xs text-muted">License not confirmed for use in this app. Check its terms before using it.</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {seeAlso.length ? (
        <div>
          <h4 className="text-sm font-semibold">Read with</h4>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {seeAlso.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className="inline-flex min-h-11 items-center font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                >
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <ExternalIcon aria-hidden className="size-4 text-accent" />
          Official sources
        </h4>
        <LinkList links={topic.officialLinks} className="mt-1" />
      </div>
    </>
  );
}

/** How an item was checked, shown with its sources. The card's badge already flags a due re-check. */
function HowChecked({ verification, lastVerified, check }: { verification: Verification; lastVerified: string; check: boolean }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-surface-2 p-3">
      <h4 className="text-sm font-semibold">How this was checked</h4>
      <p className="text-muted">{VERIFICATION_LABELS[verification.method]}.</p>
      <p>{verification.note}</p>
      <p className="text-muted">
        Last checked online: <span className="font-semibold text-text">{lastVerified}</span>.
        {check ? " Confirm against the official source before relying on it." : null}
      </p>
    </div>
  );
}

function SourcesPart({ item, editionStatus }: { item: EthicsCode | LegalTopic; editionStatus?: EthicsCode["editionStatus"] }) {
  return (
    <>
      <HowChecked
        verification={item.verification}
        lastVerified={item.lastVerified}
        check={needsHumanCheck({ verification: item.verification, reviewedBy: item.reviewedBy, editionStatus })}
      />
      <CompactSources sources={item.sources} />
      <Governance license={item.license} lastVerified={item.lastVerified} reviewedBy={item.reviewedBy} />
    </>
  );
}

/** Renders one part of one card by id. Unknown ids render nothing (the ids come from the server page). */
export default function HubBody({ part, id }: { part: HubBodyPart; id: string }) {
  if (part === "ethics-reminders" || part === "ethics-sources") {
    const code = codes.get(id);
    if (!code) return null;
    if (part === "ethics-reminders") return <Reminders code={code} />;
    return <SourcesPart item={code} editionStatus={code.editionStatus} />;
  }
  const topic = topics.get(id);
  if (!topic) return null;
  if (part === "legal-details") return <LegalDetails topic={topic} />;
  return <SourcesPart item={topic} />;
}
