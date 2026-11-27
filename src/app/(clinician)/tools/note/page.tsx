import type { Metadata } from "next";
import { interventions, planLibraries } from "@/lib/library";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { isSudCondition } from "@/components/interventions/catalog";
import { NoteHelper } from "@/components/tools/note-helper";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Session note helper" };

export default function NoteToolPage() {
  const interventionNames = Object.fromEntries(interventions.map((i) => [i.id, i.name]));
  const sudPlanIds = planLibraries.filter((p) => p.sud || isSudCondition(p.conditionId)).map((p) => p.conditionId);
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Session note helper">
        <p>
          A SOAP, DAP, BIRP or GIRP draft prefilled from this session: documented symptoms, measure totals, chosen
          interventions and plan objectives. Edit every section, then copy it or export it. It never states a diagnosis.
        </p>
      </ToolIntro>
      <NoteHelper interventionNames={interventionNames} sudPlanIds={sudPlanIds} sudPrompt={<HubPrompt context="sud" />} />
    </div>
  );
}
