/**
 * Shared decision option grid (src/lib/tools/option-grid.ts): facts come from curated library data, long text is
 * shortened at sentence boundaries, the client view and client sheet never name a diagnosis or code, typed text is
 * scrubbed, and a substance-use area adds the Part 2 notice.
 */
import { describe, expect, it } from "vitest";
import { isClientSafeText } from "@/lib/client-safe";
import { getIntervention, interventions } from "@/lib/library";
import { DOC_PART2_NOTICE, docPlainText } from "@/lib/tools/doc-model";
import {
  CLIENT_QUESTIONS,
  PRIORITIES,
  WAIT_AND_REVIEW,
  clientOptionLabel,
  clientRows,
  optionFacts,
  optionGridDoc,
  optionGridRecordsSubstanceUse,
  summarize,
  type OptionFacts,
} from "@/lib/tools/option-grid";

describe("summarize", () => {
  it("keeps whole sentences within the limit, always at least the first", () => {
    expect(summarize("One. Two words here. Three.", 12)).toBe("One.");
    expect(summarize("One. Two words here. Three.", 40)).toBe("One. Two words here. Three.");
    expect(summarize("A very long first sentence that is over the limit. Next.", 10)).toBe("A very long first sentence that is over the limit.");
  });

  it("does not split at abbreviations", () => {
    expect(summarize("Use short steps, e.g. one task a day. Then review.", 30)).toBe("Use short steps, e.g. one task a day.");
  });
});

describe("optionFacts", () => {
  it("builds facts from a library intervention and links to its full entry", () => {
    const i = getIntervention("behavioral-activation")!;
    const f = optionFacts(i);
    expect(f).toMatchObject({ id: i.id, name: i.name, modality: i.modality, minutes: i.minutes, practice: i.handoutIds.length > 0 });
    expect(f.training).toBe(Boolean(i.trainingRequired));
    expect(f.href).toBe("/interventions/behavioral-activation");
    expect(i.evidenceLevel.startsWith(f.evidence.replace(/\.$/, ""))).toBe(true);
  });

  it("marks trained-only methods", () => {
    const trained = interventions.find((i) => i.trainingRequired)!;
    expect(optionFacts(trained).training).toBe(true);
  });
});

describe("client view", () => {
  const unsafe: OptionFacts = { ...WAIT_AND_REVIEW, id: "x", name: "CBT for psychosis", modality: "CBT", href: "/interventions/x" };

  it("never shows a diagnosis in an option name", () => {
    expect(clientOptionLabel(unsafe, 1)).toBe("Option 2 (CBT)");
    expect(clientOptionLabel({ ...unsafe, modality: "Psychosis care" }, 0)).toBe("Option 1");
    expect(clientOptionLabel(WAIT_AND_REVIEW, 3)).toBe("Wait and check in again");
    for (const i of interventions) expect(isClientSafeText(clientOptionLabel(optionFacts(i), 0)), i.id).toBe(true);
  });

  it("shows the clinician's plain description only when it is client-safe", () => {
    expect(clientRows(unsafe, "Talk through worries each week")[0]).toEqual({ label: "What you would do", value: "Talk through worries each week" });
    expect(clientRows(unsafe, "Work on your depression symptoms").some((r) => r.label === "What you would do")).toBe(false);
  });

  it("uses only client-safe curated wording", () => {
    for (const t of [...PRIORITIES.map((p) => p.label), ...CLIENT_QUESTIONS, ...clientRows(WAIT_AND_REVIEW, "").map((r) => r.value)])
      expect(isClientSafeText(t), t).toBe(true);
  });
});

describe("optionGridDoc", () => {
  const options = interventions.slice(0, 3).map(optionFacts);

  it("prints a client sheet with no diagnosis, code or score, one blank name line and the crisis box", () => {
    const doc = optionGridDoc({ options: [...options, WAIT_AND_REVIEW], plain: {}, priorities: ["time", "skills"], sud: false });
    expect(doc.blocks.filter((b) => b.kind === "fill")).toEqual([{ kind: "fill", label: "Name" }]);
    expect(doc.blocks.some((b) => b.kind === "crisis")).toBe(true);
    const text = docPlainText(doc);
    expect(isClientSafeText(text)).toBe(true);
    expect(text).toContain("Fitting sessions around work, care or study");
    expect(doc.part2).toBe(false);
  });

  it("scrubs typed descriptions and drops unsafe ones", () => {
    const text = docPlainText(
      optionGridDoc({ options, plain: { [options[0]!.id]: "Call 555-123-4567 to book", [options[1]!.id]: "Treats panic disorder" }, priorities: [], sud: false }),
    );
    expect(text).not.toContain("555-123-4567");
    expect(text).not.toMatch(/panic disorder/i);
  });

  it("carries the Part 2 notice for a substance-use area or substance-use wording", () => {
    expect(optionGridDoc({ options, plain: {}, priorities: [], sud: true }).part2).toBe(true);
    expect(optionGridRecordsSubstanceUse({ options, plain: { a: "Plan for cutting down alcohol" }, priorities: [], sud: false })).toBe(true);
    expect(docPlainText(optionGridDoc({ options, plain: {}, priorities: [], sud: true }))).toContain(DOC_PART2_NOTICE);
  });
});
