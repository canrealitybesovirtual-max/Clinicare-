import { describe, expect, it } from "vitest";
import { DOC_FOOTER, DOC_PART2_NOTICE, docBlocks, docPlainText, type DocBlock } from "@/lib/tools/doc-model";
import {
  ROI_CONDITIONING,
  ROI_COPY,
  ROI_HIPAA_ELEMENTS,
  ROI_PART2_ELEMENTS,
  ROI_PART2_LINE,
  ROI_PSYCHOTHERAPY_ONLY,
  ROI_REDISCLOSURE,
  ROI_REVOKE,
  ROI_SOURCES,
  roiDoc,
  roiIncludesPart2,
  type RoiInput,
} from "@/lib/tools/release-of-information";

const base: RoiInput = { recordKind: "general", direction: "release", infoIds: ["assessment", "treatment-plan"], purposeIds: ["treatment"], note: "" };
const fills = (blocks: DocBlock[]) => blocks.flatMap((b) => (b.kind === "fill" ? [b.label] : []));
const text = (input: RoiInput) => docPlainText(roiDoc(input));

describe("release of information: HIPAA authorization content (45 CFR 164.508(c))", () => {
  it("prints every identifier as a blank line and nothing typed (G5)", () => {
    const doc = roiDoc(base);
    expect(fills(doc.blocks)).toEqual([
      "Client name",
      "Provider or program",
      "Recipient (person or organization)",
      "Recipient's address or secure contact",
      "End date or event",
      "Send a written revocation to",
      "Signature",
      "Date signed",
      "If signed by a representative: their name and authority to act",
    ]);
    expect(text(base)).toMatch(/^Client name: _+$/m);
  });

  it("includes the information, purpose and the required statements, plus the disclaimer", () => {
    const t = text(base);
    for (const s of ["Assessment and evaluation summaries", "Treatment plan and progress summaries", "Coordination of treatment", ROI_REVOKE, ROI_CONDITIONING, ROI_REDISCLOSURE, ROI_COPY])
      expect(t).toContain(s);
    expect(t.trimEnd().endsWith(DOC_FOOTER)).toBe(true);
    expect(t).toMatch(/Not legal advice/);
    expect(ROI_HIPAA_ELEMENTS.map((e) => e.id)).toEqual(
      expect.arrayContaining(["description", "discloser", "recipient", "purpose", "expiration", "signature", "revocation", "conditioning", "redisclosure"]),
    );
  });

  it("asks for a description when nothing is ticked, instead of printing a blank authorization", () => {
    const doc = roiDoc({ ...base, infoIds: [], purposeIds: [] });
    expect(doc.blocks.filter((b) => b.kind === "write").length).toBe(2);
  });

  it("psychotherapy notes get their own form that cannot be combined", () => {
    const doc = roiDoc({ ...base, recordKind: "psychotherapy-notes", infoIds: ["sud-records"] });
    expect(doc.title).toBe("Authorization to disclose psychotherapy notes");
    const t = docPlainText(doc);
    expect(t).toContain(ROI_PSYCHOTHERAPY_ONLY);
    expect(t).not.toContain("Assessment and evaluation summaries");
    expect(doc.part2).toBe(false);
  });

  it("the exchange choice says both may share", () => {
    expect(text({ ...base, direction: "exchange" })).toMatch(/may share the information below with each other/);
  });
});

describe("release of information: 42 CFR Part 2 (G6)", () => {
  it("Part 2 records add the notice at the top and in the footer, and the Part 2 line", () => {
    const input: RoiInput = { ...base, infoIds: ["sud-records"] };
    expect(roiIncludesPart2(input)).toBe(true);
    const doc = roiDoc(input);
    expect(doc.part2).toBe(true);
    expect(docBlocks(doc)[1]).toEqual({ kind: "notice", text: DOC_PART2_NOTICE });
    const t = docPlainText(doc);
    expect(t).toContain(ROI_PART2_LINE);
    expect(t.trimEnd().endsWith(DOC_PART2_NOTICE)).toBe(true);
    expect(DOC_PART2_NOTICE).toBe("42 CFR Part 2 prohibits unauthorized use or disclosure of these records.");
  });

  it("substance-use wording in the limits note also triggers Part 2", () => {
    expect(roiIncludesPart2({ ...base, note: "only the alcohol treatment summary" })).toBe(true);
    expect(roiIncludesPart2(base)).toBe(false);
  });

  it("lists the Part 2 consent points, including separate SUD counseling notes", () => {
    expect(ROI_PART2_ELEMENTS.length).toBeGreaterThanOrEqual(9);
    expect(ROI_PART2_ELEMENTS.join(" ")).toMatch(/revoke/);
    expect(ROI_PART2_ELEMENTS.join(" ")).toMatch(/SUD counseling notes/);
    expect(ROI_SOURCES.map((s) => s.url)).toEqual(
      expect.arrayContaining([
        "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.508",
        "https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2/subpart-C/section-2.31",
      ]),
    );
  });
});

describe("release of information: the limits note is scrubbed again and states no diagnosis (G3, G5)", () => {
  it("scrubs identifiers that reach the builder", () => {
    const t = text({ ...base, note: "records since 03/14/2025, call 555-301-2299" });
    expect(t).not.toMatch(/555-301-2299|03\/14\/2025/);
    expect(t).toMatch(/\[PHONE\]/);
  });
  it("never prints a condition name", () => {
    expect(text(base)).not.toMatch(/\bdisorder\b|\bdiagnosed\b/i);
  });
});
