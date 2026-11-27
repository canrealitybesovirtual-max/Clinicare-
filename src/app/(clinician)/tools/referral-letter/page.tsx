import type { Metadata } from "next";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { ReferralLetterTool } from "@/components/tools/referral-letter-tool";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Referral letter" };

export default function ReferralLetterToolPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Referral letter">
        <p>
          A referral letter without identifiers: choose the service, the reasons and any screening results, then print
          it. The client&rsquo;s name and date of birth are written by hand on the printout.
        </p>
      </ToolIntro>
      <ReferralLetterTool sudPrompt={<HubPrompt context="sud" />} />
    </div>
  );
}
