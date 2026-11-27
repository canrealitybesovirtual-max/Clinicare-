import type { Metadata } from "next";
import { AccommodationLetterTool } from "@/components/tools/accommodation-letter-tool";
import { ToolIntro } from "@/components/tools/tool-intro";

export const metadata: Metadata = { title: "Accommodation letter" };

export default function AccommodationLetterPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <ToolIntro title="Accommodation letter">
        <p>
          A supporting letter for changes at work or in study, from the treating clinician: what is harder at present and
          what would help, without a diagnosis. Names, dates and your details are written by hand on the printout.
        </p>
      </ToolIntro>
      <AccommodationLetterTool />
    </div>
  );
}
