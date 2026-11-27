"use client";
/**
 * The long parts of the Ethics & Legal Hub cards (key reminders, key points, what to do, sources). Loaded as its
 * own chunk the first time a card's disclosure is opened (lazy-hub-body.tsx), so the page HTML carries only the
 * card headers and summaries. Data comes from the same generated content index and zod schemas as the server.
 */
import { Landmark, ScrollText, ExternalLink as ExternalIcon } from "lucide-react";
import { ethicsRaw } from "@/lib/generated/ethics";
import { legalRaw } from "@/lib/generated/legal";
import { EthicsCodeSchema, LegalTopicSchema, type EthicsCode, type LegalTopic } from "@/lib/schemas-hub";
import { Governance } from "@/components/content/content-meta";
import { CompactSources, LinkList } from "./compact-sources";

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

/** Renders one part of one card by id. Unknown ids render nothing (the ids come from the server page). */
export default function HubBody({ part, id }: { part: HubBodyPart; id: string }) {
  if (part === "ethics-reminders" || part === "ethics-sources") {
    const code = codes.get(id);
    if (!code) return null;
    if (part === "ethics-reminders") return <Reminders code={code} />;
    return (
      <>
        <CompactSources sources={code.sources} />
        <Governance license={code.license} lastVerified={code.lastVerified} reviewedBy={code.reviewedBy} />
      </>
    );
  }
  const topic = topics.get(id);
  if (!topic) return null;
  if (part === "legal-details") return <LegalDetails topic={topic} />;
  return (
    <>
      <CompactSources sources={topic.sources} />
      <Governance license={topic.license} lastVerified={topic.lastVerified} reviewedBy={topic.reviewedBy} />
    </>
  );
}
