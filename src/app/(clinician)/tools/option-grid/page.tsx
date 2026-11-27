import type { Metadata } from "next";
import Link from "next/link";
import { allConditions, interventionsFor } from "@/lib/library";
import { optionFacts, type OptionFacts } from "@/lib/tools/option-grid";
import { OptionGridTool, type GridCondition } from "@/components/tools/option-grid-tool";
import { ToolIntro } from "@/components/tools/tool-intro";
import { HelpTip } from "@/components/ui/help-tip";

export const metadata: Metadata = { title: "Option grid" };

const linkClass = "font-semibold text-accent underline underline-offset-2";

export default function OptionGridPage() {
  // Curated data only: each condition's library interventions, shortened to the facts the grid compares.
  const facts: Record<string, OptionFacts> = {};
  const conditions: GridCondition[] = allConditions
    .map((c) => {
      const items = interventionsFor(c.id);
      for (const i of items) facts[i.id] ??= optionFacts(i);
      return { id: c.id, name: c.name, sud: c.sud, optionIds: items.map((i) => i.id).sort((a, b) => facts[a]!.name.localeCompare(facts[b]!.name)) };
    })
    .filter((c) => c.optionIds.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-4xl">
      <ToolIntro title="Option grid">
        <p>
          Compare treatment options side by side for a shared decision: what each involves, session length, practice between
          sessions, training needed and the evidence. Switch to the client view to talk it through in plain words.
        </p>
      </ToolIntro>
      <HelpTip title="How this works" className="mb-5">
        <p>
          Choose the area of concern, pick up to four options from the library, and add plain-language descriptions if you
          like. The client view and the printed sheet never name a diagnosis or code. Options are listed A to Z, never
          ranked; the choice is made with the client.
        </p>
        <p>
          The steps for the conversation (team talk, option talk, decision talk) are in the{" "}
          <Link href="/practice/shared-decision-making" className={linkClass}>
            shared decision making guide
          </Link>
          .
        </p>
      </HelpTip>
      <OptionGridTool conditions={conditions} facts={facts} />
    </div>
  );
}
