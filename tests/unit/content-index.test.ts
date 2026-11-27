/**
 * The generated static content index (src/lib/generated/content-index.ts) must match the files under
 * content/. A stale index silently drops new content from both loaders (content.ts and library.ts), so CI
 * fails here until `npm run gen:content` is run (G10).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { conditionsRaw } from "@/lib/generated/content-index";
import { renderIndex } from "../../scripts/gen-content-index";

const ROOT = path.resolve(__dirname, "../..");

describe("generated content index", () => {
  it("is up to date with content/ (run npm run gen:content after adding or removing files)", () => {
    const committed = readFileSync(path.join(ROOT, "src/lib/generated/content-index.ts"), "utf8");
    expect(committed).toBe(renderIndex());
  });

  it("lists every condition file", () => {
    const ids = conditionsRaw.map((c) => (c as { id: string }).id).sort();
    expect(ids).toHaveLength(13);
    expect(ids).toContain("obsessive-compulsive-disorder");
    expect(ids).toContain("alcohol-use-disorder");
  });
});
