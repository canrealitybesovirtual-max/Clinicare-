import type { Metadata } from "next";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { CareTransitionTool } from "@/components/tools/care-transition-tool";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Care transition checklist" };

export default function CareTransitionPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Care transition checklist">
        <p>
          Steps for a move between services, such as discharge from hospital or an emergency visit, or a referral: first
          appointment, medicines, safety plan, supports, sharing information and closing the loop, plus a caring-contacts
          plan. Tick boxes only, printed with blank lines.
        </p>
      </ToolIntro>
      <CareTransitionTool sudPrompt={<HubPrompt context="sud" />} />
    </div>
  );
}
