/**
 * Measure trend math: response / remission / meaningful-change markers follow their published definitions, every
 * rule cites a source, and points are session numbers only.
 */
import { describe, expect, it } from "vitest";
import { getMeasure } from "@/lib/content";
import { MAX_SESSION, TREND_RULES, analyzeTrend, notOnTrack, pointError, removePoint, upsertPoint } from "@/lib/tools/trend";

const phq9 = getMeasure("phq-9")!;
const gad7 = getMeasure("gad-7")!;
const pts = (...pairs: [number, number][]) => pairs.map(([session, total]) => ({ session, total }));

describe("PHQ-9 markers", () => {
  const rules = TREND_RULES["phq-9"];

  it("marks response at a total at least 50% below baseline, and remission below 5", () => {
    const t = analyzeTrend(pts([1, 18], [3, 12], [5, 9], [8, 4]), rules, phq9.scoring.bands);
    expect(t.markersApply).toBe(true);
    expect(t.rows.map((r) => r.response)).toEqual([false, false, true, true]);
    expect(t.rows.map((r) => r.remission)).toEqual([false, false, false, true]);
    expect(t.firstResponse).toBe(5);
    expect(t.firstRemission).toBe(8);
  });

  it("treats exactly half of baseline as response and exactly 5 as not remission", () => {
    const t = analyzeTrend(pts([1, 20], [2, 10], [3, 5]), rules, phq9.scoring.bands);
    expect(t.rows[1]!.response).toBe(true);
    expect(t.rows[2]!.remission).toBe(false);
  });

  it("does not mark response or remission from a baseline below 10", () => {
    const t = analyzeTrend(pts([1, 8], [2, 3]), rules, phq9.scoring.bands);
    expect(t.markersApply).toBe(false);
    expect(t.rows.some((r) => r.response || r.remission)).toBe(false);
    // Meaningful change still applies: 5 points down.
    expect(t.rows[1]!.improved).toBe(true);
  });

  it("never marks the baseline row", () => {
    const t = analyzeTrend(pts([2, 3]), rules, phq9.scoring.bands);
    expect(t.rows[0]).toMatchObject({ response: false, remission: false, change: null, percentChange: null });
  });

  it("reports change, percent change, band and 5-point meaningful change both ways", () => {
    const t = analyzeTrend(pts([1, 14], [2, 10], [3, 9], [4, 19]), rules, phq9.scoring.bands);
    expect(t.rows.map((r) => r.band)).toEqual(["Moderate", "Moderate", "Mild", "Moderately severe"]);
    expect(t.rows.map((r) => r.change)).toEqual([null, -4, -5, 5]);
    expect(t.rows.map((r) => r.percentChange)).toEqual([null, -29, -36, 36]);
    expect(t.rows.map((r) => r.improved)).toEqual([false, false, true, false]);
    expect(t.rows.map((r) => r.worsened)).toEqual([false, false, false, true]);
  });

  it("sorts by session number whatever the entry order", () => {
    const t = analyzeTrend(pts([6, 7], [1, 16], [3, 11]), rules, phq9.scoring.bands);
    expect(t.rows.map((r) => r.session)).toEqual([1, 3, 6]);
    expect(t.baseline).toEqual({ session: 1, total: 16 });
    expect(t.latest).toEqual({ session: 6, total: 7 });
  });
});

describe("GAD-7 markers", () => {
  const rules = TREND_RULES["gad-7"];

  it("has no response or remission rule, only the 4-point meaningful change", () => {
    expect(rules.rules.map((r) => r.id)).toEqual(["change"]);
    const t = analyzeTrend(pts([1, 15], [2, 11], [3, 2]), rules, gad7.scoring.bands);
    expect(t.markersApply).toBe(false);
    expect(t.rows.some((r) => r.response || r.remission)).toBe(false);
    expect(t.rows.map((r) => r.improved)).toEqual([false, true, true]);
    expect(t.rows.map((r) => r.band)).toEqual(["Severe anxiety", "Moderate anxiety", "Minimal anxiety"]);
  });
});

describe("definitions and sources", () => {
  it.each(Object.values(TREND_RULES))("$measureId: every rule has a definition and an https source", (r) => {
    for (const rule of r.rules) {
      expect(rule.definition.length).toBeGreaterThan(10);
      expect(rule.source.url).toMatch(/^https:\/\//);
      expect(rule.source.publisher.length).toBeGreaterThan(2);
    }
  });

  it("states the published thresholds in the definitions", () => {
    const phq = TREND_RULES["phq-9"].rules;
    expect(phq.find((r) => r.id === "response")!.definition).toMatch(/50%/);
    expect(phq.find((r) => r.id === "remission")!.definition).toMatch(/below 5/);
    expect(phq.find((r) => r.id === "change")!.definition).toMatch(/5 or more points/);
    expect(TREND_RULES["gad-7"].rules[0]!.definition).toMatch(/4 or more points/);
  });
});

describe("points", () => {
  it("validates session numbers and totals against the measure range", () => {
    const range = { min: 0, max: 27 };
    expect(pointError(1, 0, range)).toBeNull();
    expect(pointError(MAX_SESSION, 27, range)).toBeNull();
    expect(pointError(0, 10, range)).toMatch(/Session #/);
    expect(pointError(MAX_SESSION + 1, 10, range)).toMatch(/Session #/);
    expect(pointError(2.5, 10, range)).toMatch(/Session #/);
    expect(pointError(3, 28, range)).toMatch(/Total/);
    expect(pointError(3, -1, range)).toMatch(/Total/);
  });

  it("replaces an entry for the same session and removes by session", () => {
    let list = upsertPoint([], { session: 2, total: 10 });
    list = upsertPoint(list, { session: 1, total: 14 });
    list = upsertPoint(list, { session: 2, total: 8 });
    expect(list).toEqual(pts([1, 14], [2, 8]));
    expect(removePoint(list, 1)).toEqual(pts([2, 8]));
  });
});

describe("not-on-track review prompt (for clinician review, never a decision)", () => {
  const rules = TREND_RULES["phq-9"];
  const run = (...pairs: [number, number][]) => notOnTrack(analyzeTrend(pts(...pairs), rules, phq9.scoring.bands));

  it("is off with no totals, one total or while totals are coming down", () => {
    expect(notOnTrack(analyzeTrend([], rules, phq9.scoring.bands))).toBe(false);
    expect(run([1, 15])).toBe(false);
    expect(run([1, 18], [3, 14], [5, 11], [8, 9])).toBe(false);
  });

  it("shows after 4 totals when the latest is not lower than the baseline", () => {
    expect(run([1, 15], [2, 14], [3, 15])).toBe(false); // only 3 totals
    expect(run([1, 15], [2, 14], [3, 16], [4, 15])).toBe(true);
  });

  it("shows as soon as a total rises by the meaningful-change threshold", () => {
    expect(run([1, 10], [2, 10 + rules.meaningfulChange])).toBe(true);
  });
});
