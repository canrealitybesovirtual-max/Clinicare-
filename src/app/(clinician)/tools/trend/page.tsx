import type { Metadata } from "next";
import { measures } from "@/lib/content";
import { TrendTool } from "@/components/tools/trend-tool";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Measure trend" };

export default function TrendToolPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <ToolIntro title="Measure trend">
        <p>
          Enter GAD-7 or PHQ-9 totals by session number to see the trend over the severity bands. Response, remission and
          meaningful-change markers follow published definitions, shown with their sources below.
        </p>
      </ToolIntro>
      <TrendTool measures={measures} />
    </div>
  );
}
