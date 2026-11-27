import type { Metadata } from "next";
import { ClinicianReviewBadge, PageIntro } from "@/components/content/content-meta";
import { DifferentialCompare } from "@/components/diagnoses/differential-compare";

export const metadata: Metadata = { title: "Compare considerations" };

export default function CompareConsiderationsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageIntro title="Compare considerations" eyebrow="Step 2 · Clinician mode" badges={<ClinicianReviewBadge />} compact>
        <p>
          Two or three possible considerations from this session, side by side: what is documented, what is missing, what
          only one pattern lists and the questions that help tell them apart. None is a final diagnosis.
        </p>
      </PageIntro>
      <DifferentialCompare />
    </div>
  );
}
