import { describe, expect, it } from "vitest";
import { DOC_CRISIS_LINE, DOC_FOOTER, DOC_PART2_NOTICE, docPlainText } from "@/lib/tools/doc-model";
import {
  CARING_MESSAGES,
  TRANSITION_ITEM_IDS,
  TRANSITION_SECTIONS,
  careTransitionDoc,
  careTransitionIncludesPart2,
} from "@/lib/tools/care-transition";
import { mentionsSubstanceUse } from "@/lib/substance-terms";

describe("care transition checklist", () => {
  it("item ids are unique and only the Part 2 item marks substance use", () => {
    expect(new Set(TRANSITION_ITEM_IDS).size).toBe(TRANSITION_ITEM_IDS.length);
    const sudItems = TRANSITION_SECTIONS.flatMap((s) => s.items.filter((i) => i.sud).map((i) => i.id));
    expect(sudItems).toEqual(["part2"]);
  });

  it("prints ticked and unticked steps, blank lines, crisis lines and the disclaimer", () => {
    const t = docPlainText(careTransitionDoc({ done: ["first-appointment", "safety-plan"], channel: "text", messageIds: [] }));
    expect(t).toMatch(/\[x\] First appointment booked within about 7 days/);
    expect(t).toMatch(/\[  \] Current medicine list received/);
    expect(t).toMatch(/^Client: _+$/m);
    expect(t).toMatch(/^First appointment \(date, time, with whom\): _+$/m);
    expect(t).toContain("Agreed channel: Text message");
    expect(t).toContain(DOC_CRISIS_LINE);
    expect(t.trimEnd().endsWith(DOC_FOOTER)).toBe(true);
    expect(t).toMatch(/does not assess or decide risk/);
    expect(t).not.toMatch(/\b(?:low|moderate|high) risk\b/i);
  });

  it("adds the Part 2 notice only when Part 2 records are shared (G6)", () => {
    expect(careTransitionIncludesPart2({ done: ["summary"] })).toBe(false);
    const doc = careTransitionDoc({ done: ["part2"], channel: "phone", messageIds: [] });
    expect(doc.part2).toBe(true);
    expect(docPlainText(doc)).toContain(DOC_PART2_NOTICE);
  });

  it("example caring messages ask for nothing and carry no clinical or substance detail", () => {
    for (const m of CARING_MESSAGES) {
      expect(m.text.length).toBeLessThan(140);
      expect(mentionsSubstanceUse(m.text), m.id).toBe(false);
      expect(m.text).not.toMatch(/therapy|session notes|diagnos|depress|anxi|suicid|medic/i);
    }
    const t = docPlainText(careTransitionDoc({ done: [], channel: "letter", messageIds: ["thinking", "glad"] }));
    expect(t).toContain(CARING_MESSAGES[0]!.text);
    expect(t).not.toContain(CARING_MESSAGES[2]!.text);
  });
});
