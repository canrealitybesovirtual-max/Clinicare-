import type { Metadata } from "next";
import { getAnyHandout } from "@/lib/library";
import { clientSafeSources } from "@/lib/client-safe";
import type { Source } from "@/lib/schemas";
import { CalmCorner } from "@/components/calm/calm-corner";

export const metadata: Metadata = { title: "Calm" };

/** The exercises follow the app's own breathing, grounding and muscle-relaxation handouts; their sources apply. */
const BASED_ON = ["breathing-practice", "grounding-5-4-3-2-1", "pmr-homework"] as const;

export default function CalmPage() {
  const seen = new Set<string>();
  const sources: Source[] = BASED_ON.flatMap((id) => clientSafeSources(getAnyHandout(id)?.sources ?? [])).filter((s) =>
    seen.has(s.url) ? false : (seen.add(s.url), true),
  );
  return <CalmCorner sources={sources} />;
}
