import type { Metadata } from "next";
import { PracticeTool } from "@/components/tools/practice-tool";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Practice cases" };

export default function PracticeToolPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <ToolIntro title="Practice cases">
        <p>
          Fictional adult cases that unfold step by step. Each step re-runs the app&rsquo;s scorer in a sandbox, so you
          can see how the possible considerations and their flags change. Your live session is not touched.
        </p>
      </ToolIntro>
      <PracticeTool />
    </div>
  );
}
