import type { Metadata } from "next";
import { connection } from "next/server";
import { PageIntro } from "@/components/content/content-bits";
import { SymptomFinder } from "@/components/symptoms/symptom-finder";
import { HelpTip } from "@/components/symptoms/help-tip";
import { defaultResourceCatalog } from "@/lib/follow-up/catalog";
// Server only: whether the optional assistant is switched on (never the key).
import { assistantStatus } from "@/server/ai/config";

export const metadata: Metadata = { title: "Symptom Finder" };

export default async function SymptomsPage() {
  // Rendered per request: the assistant switches are server environment values, read at request time.
  await connection();
  return (
    <>
      <PageIntro title="Symptom Finder" eyebrow="Step 1 · Clinician mode" compact>
        <p>Describe what the client reports. The app suggests patterns to consider for your review; it never states a diagnosis.</p>
      </PageIntro>
      <HelpTip className="mb-5">
        <p>
          Type what the client tells you, in your words or theirs. The app looks for symptom words on this device, asks
          follow-up questions you may want to cover, and lists patterns to consider on the next screen.
        </p>
        <p>
          It is a checklist helper, not a diagnosis or a risk assessment. Leave out names, dates, places and other
          identifiers; anything that looks like one is removed. Nothing is saved: it all clears when you close the tab,
          press Clear session, or step away for 15 minutes.
        </p>
      </HelpTip>
      <SymptomFinder catalog={defaultResourceCatalog()} assistant={assistantStatus()} />
    </>
  );
}
