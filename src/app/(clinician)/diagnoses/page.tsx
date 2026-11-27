import type { Metadata } from "next";
import { connection } from "next/server";
import { ClinicianReviewBadge, PageIntro } from "@/components/content/content-meta";
import { DiagnosesView } from "@/components/diagnoses/diagnoses-view";
import { Icd10cmLookup } from "@/components/diagnoses/icd10cm-lookup";
import { HelpTip } from "@/components/ui/help-tip";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { defaultResourceCatalog } from "@/lib/follow-up/catalog";
// Server component: the curated term list is built on the server and only the strings are passed down.
import { ICD10CM_TERMS } from "@/server/integrations/nlm-icd10cm";
import { assistantStatus } from "@/server/ai/config";

export const metadata: Metadata = { title: "Possible Diagnoses" };

export default async function DiagnosesPage() {
  // Rendered per request: the assistant switches are server environment values, read at request time.
  await connection();
  return (
    <>
      <PageIntro title="Possible diagnoses" eyebrow="Step 2 · Clinician mode" badges={<ClinicianReviewBadge />} compact>
        <p>Patterns that fit the features you documented, with codes and what is still missing. None is a final diagnosis.</p>
      </PageIntro>
      <HelpTip className="mb-5">
        <p>
          Each card is a pattern from the app&apos;s small adult knowledge base whose feature list overlaps with what you
          documented. &ldquo;Strong feature match&rdquo; means many of its listed features are documented; it is not a
          likelihood. The score and how it was worked out are under &ldquo;Why suggested&rdquo;.
        </p>
        <p>
          Use it to check what is missing, rule-outs and codes, then confirm with the DSM-5-TR or ICD criteria and your own
          interview. Answers to the follow-up questions update this list on this device.
        </p>
      </HelpTip>
      <DiagnosesView catalog={defaultResourceCatalog()} assistant={assistantStatus()} />
      <HubPrompt context="assessment" className="mt-6 max-w-3xl" />
      <Icd10cmLookup terms={[...ICD10CM_TERMS]} />
    </>
  );
}
