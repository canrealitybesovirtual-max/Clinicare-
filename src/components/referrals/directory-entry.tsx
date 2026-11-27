/**
 * One curated directory or helpline entry (link out only, G8). Shows how to reach the service (tel:/sms: links,
 * chat, website), who it serves, and whether a person has re-verified it against the official site.
 */
import { BadgeCheck, Clock, LifeBuoy, TriangleAlert, Video } from "lucide-react";
import { isVerified, type ReferralEntry } from "@/lib/schemas-referrals";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { CompactSources } from "@/components/ethics/compact-sources";
import { HelplineActions } from "./helpline-actions";
import { KIND_LABELS, languageList, regionLabel } from "./referral-format";

export function VerificationBadge({ entry }: { entry: Pick<ReferralEntry, "lastVerified"> }) {
  return isVerified(entry) ? (
    <Badge tone="accent">
      <BadgeCheck aria-hidden className="size-3.5" />
      Verified {entry.lastVerified}
    </Badge>
  ) : (
    <Badge tone="warn">
      <TriangleAlert aria-hidden className="size-3.5" />
      Not yet re-verified
    </Badge>
  );
}

export function DirectoryEntryCard({ entry, headingLevel = "h4" }: { entry: ReferralEntry; headingLevel?: "h3" | "h4" }) {
  const H = headingLevel;
  const crisisLike = entry.kind === "crisis" || entry.kind === "veterans" || entry.kind === "deaf-hoh";
  return (
    <article aria-labelledby={`ref-${entry.id}`} className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Crisis red is kept for call buttons and active red flags; the category badge stays neutral. */}
        <Badge tone="neutral">
          {entry.kind === "crisis" ? <LifeBuoy aria-hidden className="size-3.5" /> : null}
          {KIND_LABELS[entry.kind]}
        </Badge>
        <Badge tone="info">{regionLabel(entry.region)}</Badge>
        <VerificationBadge entry={entry} />
        {entry.commercial ? <Badge tone="warn">Commercial directory</Badge> : null}
      </div>
      <H id={`ref-${entry.id}`} className="text-base font-semibold leading-snug">
        {entry.name}
      </H>
      <p className="text-sm leading-relaxed text-text">{entry.description}</p>

      <HelplineActions name={entry.name} phone={entry.phone} text={entry.text} chat={entry.chat} crisis={crisisLike} />

      <ul className="space-y-1 text-sm text-muted empty:hidden">
        {entry.phoneNote ? <li className="text-text">{entry.phoneNote}</li> : null}
        {entry.videophone ? (
          <li className="flex items-start gap-1.5">
            <Video aria-hidden className="mt-0.5 size-4 shrink-0" />
            {entry.videophone}
          </li>
        ) : null}
        {entry.hours ? (
          <li className="flex items-start gap-1.5">
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
            {entry.hours}
          </li>
        ) : null}
        {entry.languages?.length ? (
          <li>Languages: {languageList(entry.languages)}</li>
        ) : null}
        {entry.audience ? <li>For: {entry.audience}</li> : null}
        {entry.cost ? <li>Cost: {entry.cost}</li> : null}
      </ul>

      {entry.commercial ? (
        <p className="rounded-lg bg-warn-bg p-2.5 text-xs text-warn-fg">
          Listings are paid and are not vetted by this app. Verify licensure with the state board.
        </p>
      ) : null}
      {entry.notes?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted">
          {entry.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto space-y-2 border-t border-border pt-3">
        <p className="text-sm">
          <ExternalLink href={entry.url} className="inline-flex min-h-11 items-center">
            Official website
            <span className="sr-only"> of {entry.name}</span>
          </ExternalLink>
        </p>
        <Disclosure title="How this was checked" bordered={false} bodyClassName="space-y-2 pb-1 text-xs text-muted">
          <p className="leading-relaxed">{entry.verification}</p>
          {!isVerified(entry) ? <p className="font-semibold text-text">Confirm details on the official site before relying on them.</p> : null}
          <CompactSources sources={entry.sources} className="text-xs" />
        </Disclosure>
      </div>
    </article>
  );
}
