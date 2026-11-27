import type { Metadata } from "next";
import { SessionTimer } from "@/components/tools/session-timer";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Session flow timer" };

export default function SessionToolPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Session flow timer">
        <p>
          A simple agenda with the time left in each step. Move on when you are ready; the timer only keeps count. Nothing
          is typed or saved.
        </p>
      </ToolIntro>
      <SessionTimer />
    </div>
  );
}
