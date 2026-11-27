/**
 * Server-rendered cards for the Ethics & Legal Hub. Original summaries only, each with the official link,
 * edition and verification status, and a "check the official source" badge when a person must re-check it.
 * The long parts (reminders, key points, sources) render only when their disclosure is opened (LazyHubBody), so
 * the page stays light while every card, summary and #id anchor is in the server HTML. Exact regulatory wording
 * (requiredText) is always shown.
 */
import { CalendarClock, Landmark, TriangleAlert } from "lucide-react";
import { PROFESSION_LABELS, needsHumanCheck, type EthicsCode, type LegalTopic } from "@/lib/schemas-hub";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { ReviewBadge } from "@/components/content/content-meta";
import { LazyHubBody } from "./lazy-hub-body";
import { EDITION_STATUS_LABELS, VERIFICATION_LABELS, jurisdictionLabel, scopeLabel } from "./hub-labels";

function CheckOfficialBadge() {
  return (
    <Badge tone="warn">
      <TriangleAlert aria-hidden className="size-3.5" />
      Check the official source
    </Badge>
  );
}

function VerificationNote({
  method,
  note,
  lastVerified,
  check,
}: {
  method: keyof typeof VERIFICATION_LABELS;
  note: string;
  lastVerified: string;
  check: boolean;
}) {
  // Neutral; the card's "Check the official source" badge already flags a re-check, so the summary only says so.
  return (
    <Disclosure
      title="How this was checked"
      meta={check ? "re-check due" : VERIFICATION_LABELS[method]}
      bordered={false}
      className="rounded-lg border border-border bg-surface-2 px-3"
      bodyClassName="space-y-2 pb-3"
    >
      <p className="text-muted">{VERIFICATION_LABELS[method]}.</p>
      <p>{note}</p>
      <p className="text-muted">
        Last checked online: <span className="font-semibold text-text">{lastVerified}</span>.
        {check ? " Confirm against the official source before relying on it." : null}
      </p>
    </Disclosure>
  );
}

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
          <Disclosure title="Sources and review" meta={`${code.sources.length} sources`}>
            <LazyHubBody part="ethics-sources" id={code.id} />
          </Disclosure>
        </div>

        <VerificationNote method={code.verification.method} note={code.verification.note} lastVerified={code.lastVerified} check={check} />
      </Card>
    </article>
  );
}

export function LegalTopicCard({ topic }: { topic: LegalTopic }) {
  const check = needsHumanCheck(topic);
  const titleId = `${topic.id}-title`;
  return (
    <article id={topic.id} aria-labelledby={titleId} className="scroll-mt-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">
            <Landmark aria-hidden className="size-3.5" />
            {jurisdictionLabel(topic.jurisdiction, topic.appliesIn)}
          </Badge>
          {topic.changesOften ? (
            <Badge tone="warn">
              <CalendarClock aria-hidden className="size-3.5" />
              Changes often: status as of {topic.statusAsOf}
            </Badge>
          ) : null}
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

        <Disclosure
          title="Key points, what to do and official sources"
          meta={`${topic.keyPoints.length} points`}
          bodyClassName="space-y-4 pb-2"
        >
          <LazyHubBody part="legal-details" id={topic.id} />
        </Disclosure>

        <p className="text-xs font-semibold text-muted">
          Information, not legal advice. Rules differ by jurisdiction and change; consult your licensing board or a
          healthcare attorney about your situation.
        </p>

        <VerificationNote method={topic.verification.method} note={topic.verification.note} lastVerified={topic.lastVerified} check={check} />

        <Disclosure title="Sources and review" meta={`${topic.sources.length} sources`} bordered={false}>
          <LazyHubBody part="legal-sources" id={topic.id} />
        </Disclosure>
      </Card>
    </article>
  );
}
