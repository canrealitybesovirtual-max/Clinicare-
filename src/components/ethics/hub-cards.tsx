/**
 * Server-rendered cards for the Ethics & Legal Hub. Original summaries only, each with the official link,
 * edition and verification status, and a "check the official source" badge when a person must re-check it.
 */
import { BadgeCheck, CalendarClock, ExternalLink as ExternalIcon, Landmark, ListChecks, ScrollText, TriangleAlert } from "lucide-react";
import { PROFESSION_LABELS, needsHumanCheck, type EthicsCode, type LegalTopic } from "@/lib/schemas-hub";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Governance, ReviewBadge, SourcesList } from "@/components/content/content-bits";
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
  return (
    <details className="group rounded-lg border border-border bg-surface-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {check ? <TriangleAlert aria-hidden className="size-4 text-warn-fg" /> : <BadgeCheck aria-hidden className="size-4 text-ok" />}
        <span className="flex-1">Verification: {VERIFICATION_LABELS[method]}</span>
        <span aria-hidden className="text-muted group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-2 px-3 pb-3 text-sm leading-relaxed">
        <p>{note}</p>
        <p className="text-muted">
          Last checked online: <span className="font-semibold text-text">{lastVerified}</span>.
          {check ? " Confirm against the official source before relying on it." : null}
        </p>
      </div>
    </details>
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
          <ReviewBadge reviewedBy={code.reviewedBy} />
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
          <p className="rounded-lg border border-warn-border bg-warn-bg p-3 text-sm leading-relaxed text-warn-fg">
            <span className="font-semibold">Edition note: </span>
            {code.editionNote}
          </p>
        ) : null}

        <p className="text-sm leading-relaxed">{code.summary}</p>

        <p className="text-sm text-muted">
          <span className="font-semibold text-text">Applies to: </span>
          {code.appliesTo.map((p) => PROFESSION_LABELS[p]).join("; ")}
        </p>

        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks aria-hidden className="size-4 text-accent" />
            Key reminders
          </h4>
          <ul className="mt-2 space-y-2">
            {code.keyReminders.map((r) => (
              <li key={r.topic} className="rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
                <span className="font-semibold">{r.topic}. </span>
                {r.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-start gap-2 text-sm leading-relaxed">
          <Landmark aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>
            <span className="font-semibold">Your regulator: </span>
            {code.regulatorNote}
          </span>
        </p>

        <div className="space-y-1.5 text-sm">
          <p>
            <ExternalLink href={code.officialUrl} className="inline-flex min-h-11 items-center">
              Read the official {code.shortName}
            </ExternalLink>
          </p>
          {code.relatedLinks?.length ? (
            <ul className="space-y-1">
              {code.relatedLinks.map((l) => (
                <li key={l.url}>
                  <ExternalLink href={l.url} className="inline-flex min-h-11 items-center">
                    {l.title}
                  </ExternalLink>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="flex items-start gap-2 text-xs text-muted">
          <CalendarClock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Codes are revised from time to time: check for newer editions every year. This is a summary in the app&apos;s
          own words; it is information, not legal advice.
        </p>

        <VerificationNote method={code.verification.method} note={code.verification.note} lastVerified={code.lastVerified} check={check} />

        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent">Sources and review</summary>
          <div className="space-y-3 pt-2">
            <SourcesList sources={code.sources} />
            <Governance license={code.license} lastVerified={code.lastVerified} reviewedBy={code.reviewedBy} />
          </div>
        </details>
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
          <ReviewBadge reviewedBy={topic.reviewedBy} />
        </div>
        <h3 id={titleId} className="text-lg font-bold leading-snug">
          {topic.title}
        </h3>
        <p className="text-sm leading-relaxed">{topic.summary}</p>

        <div>
          <h4 className="text-sm font-semibold">Key points</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted">
            {topic.keyPoints.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>

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
          <ul className="mt-1 space-y-0.5 text-sm">
            {topic.officialLinks.map((l) => (
              <li key={l.url}>
                <ExternalLink href={l.url} className="inline-flex min-h-11 items-center">
                  {l.title}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs font-semibold text-muted">
          Information, not legal advice. Rules differ by jurisdiction and change; consult your licensing board or a
          healthcare attorney about your situation.
        </p>

        <VerificationNote method={topic.verification.method} note={topic.verification.note} lastVerified={topic.lastVerified} check={check} />

        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent">Sources and review</summary>
          <div className="space-y-3 pt-2">
            <SourcesList sources={topic.sources} />
            <Governance license={topic.license} lastVerified={topic.lastVerified} reviewedBy={topic.reviewedBy} />
          </div>
        </details>
      </Card>
    </article>
  );
}
