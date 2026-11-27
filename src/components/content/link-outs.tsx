import { ExternalLink } from "@/components/ui/external-link";
import type { LinkOut } from "@/lib/schemas-governance";

/**
 * Curated outside resources for a content item: link out only, never re-hosted (G8). Server-safe.
 * On client pages pass only link-outs whose wording passed the client-safe check (validate-content enforces it).
 */
export function LinkOuts({ links, title = "Trusted outside resources", headingLevel = "h2", className }: {
  links: readonly LinkOut[] | undefined;
  title?: string;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  if (!links?.length) return null;
  const H = headingLevel;
  return (
    <section aria-label={title} className={className}>
      <H className={H === "h2" ? "text-lg font-semibold" : "text-base font-semibold"}>{title}</H>
      <ul className="mt-2 space-y-1.5 text-sm">
        {links.map((l) => (
          <li key={l.url}>
            <ExternalLink href={l.url} className="inline-flex min-h-11 items-center">
              {l.title}
            </ExternalLink>
            <span className="text-muted"> · {l.publisher}</span>
            {l.note ? <p className="text-muted">{l.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
