import type { Metadata } from "next";
import { interventions } from "@/lib/library";
import { PRECAUTION_CONTEXTS, PRECAUTION_RULES, type InterventionCautions } from "@/lib/tools/precautions";
import { PrecautionsTool } from "@/components/tools/precautions-tool";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Intervention precautions" };

const ruled = new Set(PRECAUTION_RULES.flatMap((r) => r.interventionIds));
const mentionsContext = (line: string) => PRECAUTION_CONTEXTS.some((c) => c.pattern.test(line));

/**
 * Server component: passes the browser only the caution lines that mention one of the contexts (and the
 * interventions the curated notes name), not the whole intervention library.
 */
const slices: InterventionCautions[] = interventions
  .map((i) => ({ id: i.id, name: i.name, contraindications: i.contraindications.filter(mentionsContext) }))
  .filter((i) => i.contraindications.length > 0 || ruled.has(i.id));

export default function PrecautionsToolPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Intervention precautions">
        <p>
          Tick the health and life context that applies, and see which interventions have cautions or adaptations to
          weigh for it, with sources. Nothing is ruled in or out: the plan stays yours and the client&apos;s.
        </p>
      </ToolIntro>
      <PrecautionsTool interventions={slices} />
    </div>
  );
}
