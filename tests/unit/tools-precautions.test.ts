import { describe, expect, it } from "vitest";
import { interventions } from "@/lib/library";
import {
  PRECAUTION_CONTEXTS,
  PRECAUTION_CONTEXT_IDS,
  PRECAUTION_RULES,
  PRECAUTION_SOURCES,
  PRECAUTIONS_GOVERNANCE,
  matchingCautions,
  precautionsFor,
  type InterventionCautions,
} from "@/lib/tools/precautions";

const library: InterventionCautions[] = interventions.map((i) => ({ id: i.id, name: i.name, contraindications: i.contraindications }));
const byId = new Map(interventions.map((i) => [i.id, i] as const));

describe("precaution rules: curated, sourced, original (G1, G10)", () => {
  it("every rule names real interventions and known contexts, with https sources", () => {
    const ids = new Set<string>();
    for (const r of PRECAUTION_RULES) {
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
      expect(r.contexts.length, r.id).toBeGreaterThan(0);
      for (const c of r.contexts) expect(PRECAUTION_CONTEXT_IDS, r.id).toContain(c);
      expect(r.interventionIds.length, r.id).toBeGreaterThan(0);
      for (const iv of r.interventionIds) expect(byId.has(iv), `${r.id}: ${iv}`).toBe(true);
      expect(r.sources.length, r.id).toBeGreaterThan(0);
      for (const s of r.sources) expect(s.url, r.id).toMatch(/^https:\/\//);
      expect(r.note, r.id).not.toMatch(/["“”]/);
    }
    expect(PRECAUTION_SOURCES.length).toBe(new Set(PRECAUTION_RULES.flatMap((r) => r.sources.map((s) => s.url))).size);
    expect(PRECAUTIONS_GOVERNANCE).toEqual({ license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" });
  });

  it("never scores, ranks or rules anything out (G9)", () => {
    const text = PRECAUTION_RULES.map((r) => r.note).join(" ");
    expect(text).not.toMatch(/\b(?:score|points|low|moderate|high) risk\b|\bcontraindicated\b|\bnever (?:use|offer)\b|\bsafe for (?:everyone|all)\b/i);
  });

  it("covers every tick-box context with at least one curated note", () => {
    for (const c of PRECAUTION_CONTEXT_IDS) expect(PRECAUTION_RULES.some((r) => r.contexts.includes(c)), c).toBe(true);
  });
});

describe("precautionsFor", () => {
  it("bipolar history: sleep scheduling and light therapy carry the curated note, A to Z", () => {
    const entries = precautionsFor("bipolar-history", library);
    const sleep = entries.find((e) => e.interventionId === "cbti-sleep-restriction")!;
    expect(sleep.notes.map((n) => n.id)).toContain("sleep-scheduling-mania");
    expect(sleep.cautionLines.some((l) => /mania|hypomania/i.test(l))).toBe(true);
    expect(entries.find((e) => e.interventionId === "bright-light-therapy")!.notes.map((n) => n.id)).toEqual(["light-therapy-mania"]);
    const names = entries.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("matches the library's own caution lines to the ticked context", () => {
    const iv = library.find((i) => i.id === "interoceptive-exposure")!;
    expect(matchingCautions(iv, "seizures").length).toBeGreaterThan(0);
    expect(matchingCautions(iv, "pregnancy").length).toBeGreaterThan(0);
    for (const line of matchingCautions(iv, "post-exertional-malaise")) expect(line).toMatch(/post-exertional/i);
  });

  it("post-exertional malaise reaches the activity interventions", () => {
    const ids = precautionsFor("post-exertional-malaise", library).map((e) => e.interventionId);
    for (const id of ["physical-activity", "behavioral-activation", "graded-in-vivo-exposure"]) expect(ids).toContain(id);
  });

  it("leaves out interventions with nothing to say and never invents ids", () => {
    const tiny: InterventionCautions[] = [
      { id: "x-a", name: "Alpha", contraindications: ["Keep sessions short."] },
      { id: "x-b", name: "Beta", contraindications: ["Check seizure history first."] },
    ];
    expect(precautionsFor("seizures", tiny).map((e) => e.interventionId)).toEqual(["x-b"]);
    expect(precautionsFor("pregnancy", tiny)).toEqual([]);
  });

  it("context patterns are stateless (no global flag), so repeated tests give the same answer", () => {
    for (const c of PRECAUTION_CONTEXTS) expect(c.pattern.flags).not.toContain("g");
  });
});
