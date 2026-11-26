import { Baby } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { ExternalLink } from "@/components/ui/external-link";

/**
 * Link-out referral resources for clients under 18 (G12). Titles, publishers and URLs only.
 * Verify before release (see /verify-sources).
 */
export const YOUTH_REFERRALS = [
  { title: "988 Suicide & Crisis Lifeline (serves all ages)", publisher: "988 Lifeline", url: "https://988lifeline.org" },
  {
    title: "Child and Adolescent Mental Health",
    publisher: "National Institute of Mental Health",
    url: "https://www.nimh.nih.gov/health/topics/child-and-adolescent-mental-health",
  },
  {
    title: "Child and Adolescent Psychiatrist Finder and family resources",
    publisher: "American Academy of Child and Adolescent Psychiatry",
    url: "https://www.aacap.org",
  },
  { title: "Find A Helpline (international directory)", publisher: "Find A Helpline", url: "https://findahelpline.com" },
] as const;

export function Under18Notice({ className }: { className?: string }) {
  return (
    <Notice tone="warn" icon={Baby} title="Adult content only" className={className}>
      <p>
        Phase 1 covers adults only. Possible diagnoses and adult measures are not shown for clients under 18. Use
        age-appropriate tools and consider referral to child and adolescent services.
      </p>
      <ul className="mt-2 space-y-1.5">
        {YOUTH_REFERRALS.map((r) => (
          <li key={r.url}>
            <ExternalLink href={r.url}>{r.title}</ExternalLink>
            <span className="text-warn-fg/80"> · {r.publisher}</span>
          </li>
        ))}
      </ul>
    </Notice>
  );
}
