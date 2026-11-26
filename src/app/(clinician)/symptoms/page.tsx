import type { Metadata } from "next";
import { PageIntro } from "@/components/content/content-bits";
import { SymptomFinder } from "@/components/symptoms/symptom-finder";

export const metadata: Metadata = { title: "Symptom Finder" };

export default function SymptomsPage() {
  return (
    <>
      <PageIntro title="Symptom Finder" eyebrow="Step 1 · Clinician mode">
        <p>
          Describe the presentation or tap symptoms, then add context. The app suggests possible considerations for your
          review; it never states a diagnosis.
        </p>
      </PageIntro>
      <SymptomFinder />
    </>
  );
}
