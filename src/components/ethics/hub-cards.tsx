/**
 * Server-rendered cards for the Ethics & Legal Hub. Original summaries only, each with the official link,
 * edition and a "check the official source" badge when a person must re-check it. The long parts (reminders,
 * key points, questions, sources and how each item was checked) render only when their disclosure is opened
 * (LazyHubBody), so the page stays light while every card, summary and #id anchor is in the server HTML. Exact
 * regulatory wording (requiredText) is always shown.
 */
import { PROFESSION_LABELS, needsHumanCheck, type EthicsCode, type LegalTopic } from "@/lib/schemas-hub";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { ReviewBadge } from "@/components/content/content-meta";
import { LazyHubBody } from "./lazy-hub-body";
import { EDITION_STATUS_LABELS, scopeLabel, topicPlaceLabel } from "./hub-labels";

// Text-only badges: every card carries them, so icons would add weight without adding meaning.
function CheckOfficialBadge() {
  return <Badge tone="warn">Check the official source</Badge>;
}

/** "3 sources · re-check due": the disclosure that also holds how the item was checked. */
const sourcesMeta = (n: number, check: boolean) => `${n} ${n === 1 ? "source" : "sources"}${check ? " · re-check due" : ""}`;

export function EthicsCodeCard({ code }: { code: EthicsCode }) {
  const check = needsHumanCheck(code);
  const titleId = `${code.id}-title`;
  return (
    <article id={code.id} aria-labelledby={titleId} className="scroll-mt-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{scopeLabel(code)}</Badge>
          <Badge tone={code.editionStatus === "current" ? "accent" : "warn"}>{EDITION_STATUS_LABELS[code.editionStatus]}</Badge>
          {check ? <CheckOfficialBadge /> : null}
          <ReviewBadge reviewedBy={code.reviewedBy} inList />
        </div>
        <div>
          <h3 id={titleId} className="text-lg font-bold leading-snug">
            {code.name}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {code.organization} · <span className="font-medium text-text">{code.editionLabel}</span>
            {code.effectiveDate ? <> · effective {code.effectiveDate}</> : null}
          </p>
        </div>

        {code.editionNote ? (
          <p className="rounded-lg border border-warn-border bg-warn-bg p-3 text-sm leading-relaxed text-text">
            <span className="font-semibold text-warn-fg">Edition note: </span>
            {code.editionNote}
          </p>
        ) : null}

        <p className="text-sm leading-relaxed">{code.summary}</p>

        <p className="text-sm text-muted">
          <span className="font-semibold text-text">Applies to: </span>
          {code.appliesTo.map((p) => PROFESSION_LABELS[p]).join("; ")}
        </p>

        <p className="text-sm">
          <ExternalLink href={code.officialUrl} className="inline-flex min-h-11 items-center">
            Read the official {code.shortName}
          </ExternalLink>
        </p>

        <div>
          <Disclosure
            title="Key reminders and your regulator"
            meta={`${code.keyReminders.length} reminders`}
            bodyClassName="space-y-3 pb-2"
          >
            <LazyHubBody part="ethics-reminders" id={code.id} />
          </Disclosure>
          <Disclosure title="Sources and review" meta={sourcesMeta(code.sources.length, check)}>
            <LazyHubBody part="ethics-sources" id={code.id} />
          </Disclosure>
        </div>
      </Card>
    </article>
  );
}

export function LegalTopicCard({ topic }: { topic: LegalTopic }) {
  const check = needsHumanCheck(topic);
  const titleId = `${topic.id}-title`;
  const practice = topic.kind === "ethics-practice";
  return (
    <article id={topic.id} aria-labelledby={titleId} className="scroll-mt-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{topicPlaceLabel(topic)}</Badge>
          {topic.changesOften ? <Badge tone="warn">Changes often: status as of {topic.statusAsOf}</Badge> : null}
          {check ? <CheckOfficialBadge /> : null}
          <ReviewBadge reviewedBy={topic.reviewedBy} inList />
        </div>
        <h3 id={titleId} className="text-lg font-bold leading-snug">
          {topic.title}
        </h3>
        <p className="text-sm leading-relaxed">{topic.summary}</p>

        {topic.requiredText?.length ? (
          <div className="space-y-3">
            {topic.requiredText.map((r) => (
              <figure key={r.text} className="rounded-lg border-l-4 border-primary bg-surface-2 p-3 text-sm">
                <figcaption className="font-semibold">{r.label}</figcaption>
                <blockquote className="mt-1.5 font-medium leading-relaxed">{r.text}</blockquote>
                <p className="mt-1.5 text-xs text-muted">
                  Exact regulatory wording ({r.citation}).{" "}
                  <ExternalLink href={r.sourceUrl} className="text-xs">
                    Official text
                  </ExternalLink>
                </p>
                {r.note ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.note}</p> : null}
              </figure>
            ))}
          </div>
        ) : null}

        {/* The summary already says it is not legal advice; this line adds the jurisdiction warning. */}
        <p className="text-xs font-semibold text-muted">
          Laws and codes vary by state and country: check with your licensing board and a healthcare attorney.
        </p>

        <div>
          <Disclosure
            title={practice ? "Key points, questions to ask and what to do" : "Key points, what to do and official sources"}
            meta={`${topic.keyPoints.length} points`}
            bodyClassName="space-y-4 pb-2"
          >
            <LazyHubBody part="legal-details" id={topic.id} />
          </Disclosure>
          <Disclosure title="Sources and review" meta={sourcesMeta(topic.sources.length, check)}>
            <LazyHubBody part="legal-sources" id={topic.id} />
          </Disclosure>
        </div>
      </Card>
    </article>
  );
}
