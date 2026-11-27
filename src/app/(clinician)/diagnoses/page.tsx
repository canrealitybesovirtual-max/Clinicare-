import type { Metadata } from "next";
import { ClinicianReviewBadge, PageIntro } from "@/components/content/content-bits";
import { DiagnosesView } from "@/components/diagnoses/diagnoses-view";
import { Icd10cmLookup } from "@/components/diagnoses/icd10cm-lookup";
import { HubPrompt } from "@/components/hub/hub-prompt";
// Server component: the curated term list is built on the server and only the strings are passed down.
import { ICD10CM_TERMS } from "@/server/integrations/nlm-icd10cm";

export const metadata: Metadata = { title: "Possible Diagnoses" };

export default function DiagnosesPage() {
  return (
    <>
      <PageIntro title="Possible diagnoses" eyebrow="Step 2 · Clinician mode" badges={<ClinicianReviewBadge />}>
        <p>
          Ranked considerations with matched and missing features, codes and rule-outs. Each one needs your independent
          review; none is a final diagnosis.
        </p>
      </PageIntro>
      <HubPrompt context="assessment" className="mb-6 max-w-3xl" />
      <DiagnosesView />
      <Icd10cmLookup terms={[...ICD10CM_TERMS]} />
    </>
  );
}
