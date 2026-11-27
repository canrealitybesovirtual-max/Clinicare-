import type { Metadata } from "next";
import Link from "next/link";
import { getOrientation } from "@/lib/orientations";
import { GOALS_SOURCES, GOAL_TEMPLATES } from "@/lib/tools/goals";
import { SourcesList } from "@/components/content/content-meta";
import { GoalsTool, type GoalStyles } from "@/components/tools/goals-tool";
import { ToolIntro } from "@/components/tools/tool-intro";
import { HelpTip } from "@/components/ui/help-tip";

export const metadata: Metadata = { title: "Goal writer" };

const linkClass = "font-semibold text-accent underline underline-offset-2";

export default function GoalsToolPage() {
  // Each template shows how its orientation writes goals; a template whose profile is missing uses its own guidance.
  const styles: GoalStyles = {};
  for (const t of GOAL_TEMPLATES) {
    const o = t.orientationId ? getOrientation(t.orientationId) : undefined;
    if (o) styles[t.id] = { name: o.shortName, goalStyle: o.goalStyle };
  }
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Goal writer">
        <p>
          Write goals in the style of the approach you are using, check the SMART parts, and optionally scale up to three
          goals with goal attainment scaling. Nothing is saved; the printout has a blank line for the name.
        </p>
      </ToolIntro>
      <HelpTip title="How this works" className="mb-5">
        <p>
          Pick how goals are written, fill in the boxes in the client&apos;s words, and add the goal to the list. Likely
          identifiers are removed as you type. The SMART check only shows which parts are filled in or ticked.
        </p>
        <p>
          Goal attainment scaling describes five levels for each goal, from much less to much more than expected. The
          summary T-score is 50 when goals are met as expected. See the{" "}
          <Link href="/practice/goals-by-orientation" className={linkClass}>
            goal-writing guide
          </Link>{" "}
          and the{" "}
          <Link href="/practice/goal-attainment-scaling" className={linkClass}>
            goal attainment scaling guide
          </Link>
          .
        </p>
      </HelpTip>
      <GoalsTool styles={styles} />
      <section aria-labelledby="goals-sources" className="mt-8">
        <h2 id="goals-sources" className="mb-2 text-base font-semibold">
          Sources
        </h2>
        <SourcesList sources={GOALS_SOURCES} />
      </section>
    </div>
  );
}
