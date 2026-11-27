import { describe, expect, it } from "vitest";
import { conditions } from "@/lib/content";
import { DOC_FOOTER, DOC_PART2_NOTICE, docPlainText, type DocBlock } from "@/lib/tools/doc-model";
import {
  ACCOMMODATIONS,
  LIMITATIONS,
  LETTER_SOURCES,
  accommodationLetterDoc,
  letterIncludesSubstanceUse,
  relatedAccommodations,
  type AccommodationLetterInput,
} from "@/lib/tools/accommodation-letter";

const base: AccommodationLetterInput = {
  setting: "work",
  limitationIds: ["concentration", "appointments"],
  accommodationIds: ["breaks", "appointment-time"],
  duration: "temporary",
  conditionLine: "none",
  note: "",
};
const fills = (blocks: DocBlock[]) => blocks.flatMap((b) => (b.kind === "fill" ? [b.label] : []));

describe("accommodation letter: function, not diagnosis (G3)", () => {
  it("never prints a condition name from the knowledge base", () => {
    const all: AccommodationLetterInput = {
      ...base,
      limitationIds: LIMITATIONS.map((l) => l.id),
      accommodationIds: ACCOMMODATIONS.map((a) => a.id),
    };
    for (const input of [all, { ...all, setting: "education" as const }, { ...all, conditionLine: "blank-line" as const }]) {
      const t = docPlainText(accommodationLetterDoc(input)).toLowerCase();
      for (const c of conditions) expect(t, c.id).not.toContain(c.name.toLowerCase());
      expect(t).not.toMatch(/\bdiagnosed with\b|\bthe diagnosis is\b/);
    }
  });

  it("the condition line is a blank, handwritten line only when chosen", () => {
    expect(fills(accommodationLetterDoc(base).blocks)).not.toContain("Condition, in general terms (only if required and agreed)");
    expect(fills(accommodationLetterDoc({ ...base, conditionLine: "blank-line" }).blocks)).toContain(
      "Condition, in general terms (only if required and agreed)",
    );
    expect(docPlainText(accommodationLetterDoc(base))).toMatch(/I have not named the condition/);
  });

  it("states the treating role and the consent check box", () => {
    const t = docPlainText(accommodationLetterDoc(base));
    expect(t).toMatch(/I am the treating clinician/);
    expect(t).toMatch(/\[  \] The client's written consent to share this letter is on file\./);
    expect(t).toMatch(/Decisions are made through the employer's accommodation process/);
    expect(docPlainText(accommodationLetterDoc({ ...base, setting: "education" }))).toMatch(/disability services process/);
  });
});

describe("accommodation letter: identifiers by hand, disclaimer, Part 2 (G5, G6)", () => {
  it("every identifier is a blank line", () => {
    expect(fills(accommodationLetterDoc(base).blocks)).toEqual([
      "To (office, person or organization)",
      "Client name",
      "Date",
      "In my care since (month and year)",
      "Expected to be needed until (date or event)",
      "Name and credentials",
      "License number and state",
      "Phone or secure contact",
      "Signature",
    ]);
    expect(fills(accommodationLetterDoc({ ...base, duration: "ongoing" }).blocks)).toContain("Suggested review date");
  });

  it("ends with the disclaimer; the note is scrubbed again; substance wording adds the Part 2 notice", () => {
    const plain = accommodationLetterDoc(base);
    expect(plain.part2).toBe(false);
    expect(docPlainText(plain).trimEnd().endsWith(DOC_FOOTER)).toBe(true);
    const withNote = accommodationLetterDoc({ ...base, note: "Breaks help after alcohol treatment sessions; email jo@example.com" });
    expect(withNote.part2).toBe(true);
    const t = docPlainText(withNote);
    expect(t).not.toContain("jo@example.com");
    expect(t).toContain(DOC_PART2_NOTICE);
    expect(letterIncludesSubstanceUse({ ...base, note: "short breaks help" })).toBe(false);
  });

  it("lists only what was ticked, and leaves ruled lines when nothing is", () => {
    const t = docPlainText(accommodationLetterDoc(base));
    expect(t).toContain("Short, scheduled breaks");
    expect(t).not.toContain("Remote");
    expect(accommodationLetterDoc({ ...base, limitationIds: [], accommodationIds: [] }).blocks.filter((b) => b.kind === "write").length).toBe(2);
  });
});

describe("accommodation letter: suggestions and sources", () => {
  it("relates accommodations to ticked limitations (a suggestion, never automatic)", () => {
    const rel = relatedAccommodations(["noise"]);
    expect(rel.has("quiet-space")).toBe(true);
    expect(rel.has("appointment-time")).toBe(false);
    expect(relatedAccommodations([]).size).toBe(0);
    const limitIds = new Set(LIMITATIONS.map((l) => l.id));
    for (const a of ACCOMMODATIONS) for (const h of a.helps) expect(limitIds.has(h), `${a.id}: ${h}`).toBe(true);
  });
  it("cites EEOC and JAN", () => {
    expect(LETTER_SOURCES.map((s) => s.url)).toEqual(expect.arrayContaining(["https://askjan.org/"]));
    expect(LETTER_SOURCES.some((s) => /eeoc\.gov/.test(s.url))).toBe(true);
  });
});
