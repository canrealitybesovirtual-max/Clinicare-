/**
 * Handout wiring and evidence grades (scripts/validate-content.ts): every handout has its Spanish version and is
 * offered by at least one page, inverse links are reported without failing CI, and the optional structured
 * evidence grades on interventions parse and point at the intervention's own conditions.
 */
import { describe, expect, it } from "vitest";
import { contentWiring, evidenceGradeProblems, handoutLinks, wiringReport, type WiringInput } from "../../scripts/validate-content";
import { interventionsRaw } from "@/lib/generated/interventions";
import { handouts } from "@/lib/library";

const ES = { translatedBy: "machine-assisted, PENDING human review" } as unknown as NonNullable<WiringInput["handouts"][number]["es"]>;

const base: WiringInput = {
  handouts: [
    { id: "worry-time", es: ES },
    { id: "sleep-diary", es: ES },
  ],
  conditions: [{ id: "generalized-anxiety-disorder", handouts: ["worry-time"] }],
  interventions: [{ id: "worry-postponement", conditions: ["generalized-anxiety-disorder"], handoutIds: ["worry-time"] }],
  links: [{ where: "topics.json/sleep", kind: "topic", handoutIds: ["sleep-diary"] }],
};

describe("wiringReport", () => {
  it("is clean when every handout is translated and offered somewhere", () => {
    expect(wiringReport(base)).toEqual({ problems: [], warnings: [] });
  });

  it("fails a handout with no Spanish version", () => {
    const r = wiringReport({ ...base, handouts: [{ id: "worry-time" }, base.handouts[1]!] });
    expect(r.problems).toEqual(["handouts/worry-time: no Spanish version (es); every client handout needs one"]);
  });

  it("fails a handout that no condition, intervention, topic or library item links", () => {
    const r = wiringReport({ ...base, links: [] });
    expect(r.problems).toEqual([expect.stringMatching(/^handouts\/sleep-diary: not linked from any condition/)]);
  });

  it("only reports a handout that library items alone reach", () => {
    const r = wiringReport({ ...base, links: [{ where: "practice/session-structure", kind: "library", handoutIds: ["sleep-diary"] }] });
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([expect.stringMatching(/^handouts\/sleep-diary: reached only from practice\/session-structure/)]);
  });

  it("only reports an intervention handout that none of its conditions lists", () => {
    const r = wiringReport({
      ...base,
      interventions: [{ id: "worry-postponement", conditions: ["generalized-anxiety-disorder"], handoutIds: ["worry-time", "sleep-diary"] }],
    });
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual(["interventions/worry-postponement: sleep-diary not listed on any of its conditions (generalized-anxiety-disorder)"]);
  });
});

describe("handout wiring on the real content", () => {
  it("leaves no handout without Spanish or without a page that offers it", () => {
    expect(contentWiring().problems).toEqual([]);
  });

  it("collects client topics and every library type that links handouts", () => {
    const where = new Set(handoutLinks().map((l) => l.where.split("/")[0]));
    for (const type of ["topics.json", "formulations", "practice", "populations", "orientations", "plans"]) expect(where).toContain(type);
    const known = new Set(handouts.map((h) => h.id));
    for (const l of handoutLinks()) for (const id of l.handoutIds) expect(known.has(id), `${l.where} -> ${id}`).toBe(true);
  });
});

describe("evidenceGradeProblems", () => {
  const grade = {
    body: "NICE",
    guideline: "Generalised anxiety disorder and panic disorder in adults (CG113)",
    year: 2011,
    conditionId: "generalized-anxiety-disorder",
    population: "Adults with generalized anxiety",
    direction: "for",
    strength: "offer",
    url: "https://www.nice.org.uk/guidance/cg113",
  };
  const item = (grades: unknown) => ({ id: "worry-postponement", conditions: ["generalized-anxiety-disorder"], evidenceGrades: grades });

  it("accepts a well-formed grade and skips items without grades", () => {
    expect(evidenceGradeProblems([item([grade]), { id: "no-grades", conditions: ["x"] }], 2026)).toEqual([]);
  });

  it("rejects an unknown body, an http link and extra fields", () => {
    const problems = evidenceGradeProblems([item([{ ...grade, body: "Blog", url: "http://example.org", score: 3 }])], 2026).join("\n");
    expect(problems).toMatch(/body/);
    expect(problems).toMatch(/url/);
  });

  it("rejects a future year and a condition the intervention does not list", () => {
    expect(evidenceGradeProblems([item([{ ...grade, year: 2031, conditionId: "insomnia-disorder" }])], 2026)).toEqual([
      "interventions/worry-postponement evidenceGrades: NICE 2031 is in the future",
      "interventions/worry-postponement evidenceGrades: NICE grade names insomnia-disorder, which this intervention does not list",
    ]);
  });

  it("finds no problem in the grades already written into content/interventions", () => {
    expect(evidenceGradeProblems(interventionsRaw)).toEqual([]);
  });
});
