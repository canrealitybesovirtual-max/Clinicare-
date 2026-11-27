import type { Metadata } from "next";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { ReleaseOfInformationTool } from "@/components/tools/release-of-information-tool";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Release of information" };

export default function ReleaseOfInformationPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Release of information">
        <p>
          Build a plain-language authorization to share records: choose the records, the information and the purpose, then
          print it. Every name, date and signature is a blank line the client and you fill in by hand. Not legal advice.
        </p>
      </ToolIntro>
      <ReleaseOfInformationTool sudPrompt={<HubPrompt context="sud" />} />
    </div>
  );
}
