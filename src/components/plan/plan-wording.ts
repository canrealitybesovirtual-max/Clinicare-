/**
 * Fixed, original wording shared by the plan builder screen and the plan exports (src/lib/plan-export.ts).
 * No imports, so the screen can use it without loading the PDF or DOCX libraries.
 */
export const PLAN_REVIEW_LABEL =
  "For clinician review. Original wording from the app's plan library, adapted with the client. Not a diagnosis and not a substitute for clinical judgment.";

export const PLAN_MBC_NOTE =
  "Measurement-based care: give the same measure at the start and on the schedule below, look at the results together with the client, and use the change over time to adjust the plan. A score is screening information for clinician review, not a diagnosis.";

export const PLAN_PHQ9_NOTE =
  "PHQ-9: if item 9 is answered above 0, follow up with a suicide risk assessment and safety planning. The app never decides risk.";

export const PLAN_COLLAB_TITLE = "Write the plan with the client, in their own words";
