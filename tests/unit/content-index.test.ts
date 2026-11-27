/**
 * The generated folder modules (src/lib/generated/<folder>.ts) must match the files under content/. A stale
 * module silently drops new content from both loaders (content.ts and library.ts), so CI fails here until
 * `npm run gen:content` is run (G10). One module per folder keeps client bundles small; content.ts, which
 * client components import, must never reach the server-only folders.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { conditions, measures, parseAll } from "@/lib/content";
import { handouts } from "@/lib/library";
import { ConditionSchema } from "@/lib/schemas";
import { CONTENT_DIRS, GENERATED_DIR, PLACE_NAMES_FILE, contentFiles, renderModule, renderPlaceNames } from "../../scripts/gen-content-index";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("generated content modules", () => {
  it.each(CONTENT_DIRS)("%s module is up to date with content/ (run npm run gen:content)", (dir) => {
    const file = path.join(GENERATED_DIR, `${dir}.ts`);
    expect(existsSync(file), `${dir}.ts is missing`).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(renderModule(dir));
  });

  it("names-only gazetteer copy is up to date with content/referrals/us-places.json", () => {
    const file = path.join(GENERATED_DIR, PLACE_NAMES_FILE);
    expect(existsSync(file), `${PLACE_NAMES_FILE} is missing`).toBe(true);
    const text = readFileSync(file, "utf8");
    expect(text).toBe(renderPlaceNames());
    expect(text).not.toMatch(/-?\d+\.\d+,-?\d+\.\d+/); // no centre points reach the browser copy
  });

  it("generates nothing but the folder modules and the names-only gazetteer", () => {
    const expected = [...CONTENT_DIRS.map((d) => `${d}.ts`), PLACE_NAMES_FILE].sort();
    expect(readdirSync(GENERATED_DIR).sort()).toEqual(expected);
  });

  it("content.ts loads every condition and measure file, library.ts every handout", () => {
    expect(conditions.map((c) => `${c.id}.json`)).toEqual(contentFiles("conditions"));
    expect(handouts.map((h) => `${h.id}.json`)).toEqual(contentFiles("handouts"));
    // Built-in measures are the license-confirmed subset of the measure files (G7).
    for (const m of measures) expect(contentFiles("measures")).toContain(`${m.id}.json`);
  });

  it("content.ts (imported by client components) reaches only the folders it needs", () => {
    const src = read("src/lib/content.ts");
    const generated = [...src.matchAll(/from "\.\/generated\/([a-z-]+)"/g)].map((m) => m[1]).sort();
    expect(generated).toEqual(["conditions", "measures"]);
    expect(src).not.toMatch(/from "\.\/library"|schemas-hub|schemas-phase2/);
  });

  it("names the kind and id of a malformed content file so the build fails clearly (G10)", () => {
    expect(() => parseAll([{ id: "broken-condition" }], ConditionSchema, "condition")).toThrow(/Invalid condition content \(broken-condition\)/);
    expect(() => parseAll([{ conditionId: "broken-plan" }], ConditionSchema, "plan")).toThrow(/Invalid plan content \(broken-plan\)/);
    expect(() => parseAll([null], ConditionSchema, "condition")).toThrow(/Invalid condition content \(#0\)/);
  });
});
