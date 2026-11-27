/**
 * Every server route module is exposed at src/app/api/<name>/route.ts as a thin wrapper: the same POST handler,
 * runtime "nodejs" declared in the file itself (Next.js reads segment config statically), and no other exports
 * (no GET, so nothing can be fetched by URL with values in the query string).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  "icd10cm",
  "icd11",
  "medlineplus",
  "health-topics",
  "providers",
  "health-centers",
  "treatment-facilities",
  "rxnorm",
  "drug-label",
  "pubmed",
  "trials",
  "gho",
  "assistant", // optional Claude assistant (CLAUDE.md owner amendment 2026-11-27); off unless configured server-side
] as const;

const APP = path.resolve(__dirname, "../../src/app/api");
const SERVER = path.resolve(__dirname, "../../src/server/routes");

describe("src/app/api route wiring", () => {
  it("there is exactly one app route per server route module", () => {
    const app = fs.readdirSync(APP).filter((d) => fs.existsSync(path.join(APP, d, "route.ts"))).sort();
    const server = fs.readdirSync(SERVER).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, "")).sort();
    expect(app).toEqual([...ROUTES].sort());
    expect(server).toEqual([...ROUTES].sort());
  });

  for (const name of ROUTES) {
    it(`/api/${name} re-exports the server POST and declares runtime nodejs`, async () => {
      const src = fs.readFileSync(path.join(APP, name, "route.ts"), "utf8");
      expect(src).toContain(`export { POST } from "@/server/routes/${name}";`);
      expect(src).toMatch(/^export const runtime = "nodejs";$/m);
      const appMod = (await import(`@/app/api/${name}/route`)) as Record<string, unknown>;
      const serverMod = (await import(`@/server/routes/${name}`)) as Record<string, unknown>;
      expect(appMod.POST).toBe(serverMod.POST);
      expect(appMod.runtime).toBe("nodejs");
      expect(Object.keys(appMod).sort()).toEqual(["POST", "runtime"]);
    });
  }
});
