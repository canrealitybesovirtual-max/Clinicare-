/**
 * Compact source list for pages that render many content items at once (Ethics & Legal Hub, referral directory):
 * same information as SourcesList (title, publisher, year, link) without per-item icons, to keep pages light.
 */
import type { Source } from "@/lib/schemas";
import { ExternalLink } from "@/components/ui/external-link";
import { cn } from "@/lib/utils";

export function CompactSources({ sources, className }: { sources: readonly Source[]; className?: string }) {
  return (
    <ul className={cn("list-disc space-y-1 pl-5 text-sm marker:text-muted", className)}>
      {sources.map((s) => (
        <li key={s.url + s.title}>
          <ExternalLink href={s.url} showIcon={false}>
            {s.title}
          </ExternalLink>
          <span className="text-muted">
            {" "}
            · {s.publisher}
            {s.year ? `, ${s.year}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Plain list of official links (title + URL), icon-free. */
export function LinkList({ links, className }: { links: readonly { title: string; url: string }[]; className?: string }) {
  return (
    <ul className={cn("space-y-0.5 text-sm", className)}>
      {links.map((l) => (
        <li key={l.url}>
          <ExternalLink href={l.url} showIcon={false} className="inline-flex min-h-11 items-center">
            {l.title}
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}
