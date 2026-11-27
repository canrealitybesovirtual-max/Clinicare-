import type { Metadata } from "next";
import { SafetyPlanTool } from "@/components/tools/safety-plan-tool";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Safety plan worksheet" };

export default function SafetyPlanToolPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Safety plan worksheet">
        <p>
          Build a safety plan together with the client, in their own words. Print it with blank lines for names and phone
          numbers, which the client writes by hand. The worksheet never scores or decides risk.
        </p>
      </ToolIntro>
      <SafetyPlanTool />
    </div>
  );
}
