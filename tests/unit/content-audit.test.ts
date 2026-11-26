/**
 * The CI content audit covers EVERY content file (G10), not only Phase 1: each file must match a
 * registered schema with governance, unregistered files fail, and crisis lines must be verified by a
 * person before release.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditContent } from "../../scripts/content-audit";

const ROOT = path.resolve(__dirname, "../..");
const CONTENT = path.join(ROOT, "content");
const TODAY = "2026-11-26";

describe("content audit on the real content", () => {
  const audit = auditContent(CONTENT, { today: TODAY });

  it("parses every file against its schema with no problems", () => {
    expect(audit.problems).toEqual([]);
  });

  it("covers Phase 2 content too (interventions, plans, every handout, referrals, topics, medications)", () => {
    const files = audit.files.map((f) => f.file);
    expect(files.filter((f) => f.startsWith("handouts/")).length).toBeGreaterThan(20);
    expect(files.filter((f) => f.startsWith("interventions/")).length).toBeGreaterThan(50);
    expect(files.filter((f) => f.startsWith("plans/")).length).toBeGreaterThan(10);
    for (const f of ["medications.json", "topics.json", "evidence-queries.json", "gho-indicators.json", "referrals/us.json"])
      expect(files).toContain(f);
  });

  it("labels geography tables as non-clinical data and the license/API lists as registries", () => {
    const kind = (f: string) => audit.files.find((x) => x.file === f)?.kind;
    expect(kind("referrals/zcta-centroids.json")).toBe("data");
    expect(kind("licenses.json")).toBe("registry");
    expect(kind("symptoms.json")).toBe("clinical");
  });

  it("warns (and fails in --release mode) while crisis lines are unverified", () => {
    const crisis = JSON.parse(readFileSync(path.join(CONTENT, "crisis-lines.json"), "utf8")) as {
      countries: { lastVerified: string | null }[];
    };
    if (crisis.countries.some((c) => !c.lastVerified)) {
      expect(audit.warnings.join(" ")).toMatch(/crisis-lines\.json: not yet verified/);
      expect(auditContent(CONTENT, { today: TODAY, release: true }).problems.join(" ")).toMatch(/not yet verified/);
    }
  });
});

describe("content audit rules (temporary content folder)", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });
  const write = (rel: string, data: unknown) => {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, JSON.stringify(data));
  };
  const handout = JSON.parse(readFileSync(path.join(CONTENT, "handouts/pmr-homework.json"), "utf8")) as Record<string, unknown>;

  it("fails an unregistered file", () => {
    dir = mkdtempSync(path.join(tmpdir(), "content-audit-"));
    write("new-thing.json", { hello: "world" });
    expect(auditContent(dir, { today: TODAY }).problems).toEqual([expect.stringMatching(/^new-thing\.json: no schema registered/)]);
  });

  it("fails a clinical file without governance, a future lastVerified, and an id that does not match the file", () => {
    dir = mkdtempSync(path.join(tmpdir(), "content-audit-"));
    const { sources: _s, ...noSources } = handout;
    write("handouts/no-sources.json", { ...noSources, id: "no-sources" });
    write("handouts/future.json", { ...handout, id: "future", lastVerified: "2099-01-01" });
    write("handouts/wrong-name.json", handout);
    const problems = auditContent(dir, { today: TODAY }).problems.join("\n");
    expect(problems).toMatch(/handouts\/no-sources\.json: sources/);
    expect(problems).toMatch(/handouts\/future\.json: lastVerified 2099-01-01 is in the future/);
    expect(problems).toMatch(/handouts\/wrong-name\.json: id "pmr-homework" does not match the file name/);
  });

  it("checks intervention -> handout cross-references", () => {
    dir = mkdtempSync(path.join(tmpdir(), "content-audit-"));
    const intervention = JSON.parse(readFileSync(path.join(CONTENT, "interventions/progressive-muscle-relaxation.json"), "utf8")) as Record<
      string,
      unknown
    >;
    write("interventions/progressive-muscle-relaxation.json", { ...intervention, handoutIds: ["missing-handout"] });
    expect(auditContent(dir, { today: TODAY }).problems.join("\n")).toMatch(/unknown handout missing-handout/);
  });
});
