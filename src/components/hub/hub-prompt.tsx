import Link from "next/link";
import { Scale } from "lucide-react";
import { HUB_PROMPTS, type HubContext } from "@/lib/schemas-hub";
import { Notice } from "@/components/ui/notice";

/**
 * Contextual Ethics & Legal Hub reminder (spec screen 8): faith-based -> informed consent (AACC/ACA),
 * substance use -> 42 CFR Part 2, telehealth -> jurisdiction, etc. Links into /ethics, filtered by id anchors.
 */
export function HubPrompt({ context, className }: { context: HubContext; className?: string }) {
  const prompt = HUB_PROMPTS[context];
  const ids = [...prompt.ethicsIds, ...prompt.legalIds];
  return (
    <Notice tone={context === "sud" || context === "duty-to-warn" ? "warn" : "accent"} icon={Scale} className={className}>
      <p>{prompt.message}</p>
      {ids.length > 0 ? (
        <p className="mt-1">
          <Link href={`/ethics#${prompt.anchor ?? ids[0]}`} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
            Ethics &amp; Legal Hub
          </Link>
          <span className="text-muted"> · {ids.length} related {ids.length === 1 ? "item" : "items"}</span>
        </p>
      ) : null}
    </Notice>
  );
}
