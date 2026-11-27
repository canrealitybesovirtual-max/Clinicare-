/**
 * Build wiring of the opt-in on-device model (docs/ON-DEVICE-AI.md), checked without loading the model:
 * - public/models/lexicon-embeddings.json is reproducible from content/symptoms.json and must be rebuilt whenever
 *   the lexicon changes (`npm run model:embed`, i.e. `npx tsx scripts/build-lexicon-embeddings.ts`);
 * - the production CSP adds only 'wasm-unsafe-eval' for it (no 'unsafe-eval', no other host);
 * - prebuild regenerates the content index and copies the runtime; /ort/ is generated, not committed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLexiconEmbeddings } from "@/lib/semantic/core";
import { MODEL_NAME, MODEL_REVISION } from "@/lib/semantic/model";
import { isStale, lexiconHash, loadLexicon, readEmbeddingsFile } from "../../scripts/build-lexicon-embeddings";
import { contentSecurityPolicy } from "../../next.config";

const ROOT = path.resolve(__dirname, "../..");
const REBUILD = "content/symptoms.json changed: run `npm run model:embed` (npx tsx scripts/build-lexicon-embeddings.ts) and commit public/models/lexicon-embeddings.json";

describe("lexicon embeddings", () => {
  const lexicon = loadLexicon();
  const file = readEmbeddingsFile();

  it("are up to date with content/symptoms.json", () => {
    expect(file, "public/models/lexicon-embeddings.json is missing").not.toBeNull();
    expect(file?.lexiconSha256, REBUILD).toBe(lexiconHash(lexicon));
    expect(isStale(lexicon), REBUILD).toBe(false);
  });

  it("cover exactly the lexicon's symptoms, in lexicon order, for the pinned model", () => {
    expect(file?.symptoms.map((s) => s.id), REBUILD).toEqual(lexicon.symptoms.map((s) => s.id));
    expect(file?.model).toBe(MODEL_NAME);
    expect(file?.revision).toBe(MODEL_REVISION);
    expect(() => decodeLexiconEmbeddings(file!)).not.toThrow();
  });

  it("hash every phrase, so any lexicon edit is detected", () => {
    const edited = structuredClone(lexicon);
    edited.symptoms[0]!.synonyms = [...edited.symptoms[0]!.synonyms, "a newly added phrasing"];
    expect(lexiconHash(edited)).not.toBe(lexiconHash(lexicon));
  });
});

describe("production CSP for the on-device model", () => {
  const directives = new Map(
    contentSecurityPolicy.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name as string, values] as const;
    }),
  );

  it("allows WebAssembly compilation and same-origin workers, and nothing more", () => {
    expect(directives.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"]);
    expect(directives.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(directives.get("connect-src")).toEqual(["'self'"]);
    expect(contentSecurityPolicy).not.toMatch(/'unsafe-eval'/);
    expect(contentSecurityPolicy).not.toMatch(/https?:/);
  });
});

describe("build scripts", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const gitignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8").split("\n");

  it("prebuild regenerates the content index and copies the onnxruntime-web files", () => {
    expect(pkg.scripts.prebuild).toContain("scripts/gen-content-index.ts");
    expect(pkg.scripts.prebuild).toContain("scripts/copy-ort.ts");
    expect(pkg.scripts["model:embed"]).toBe("tsx scripts/build-lexicon-embeddings.ts");
  });

  it("keeps the generated runtime out of git", () => {
    expect(gitignore).toContain("public/ort/");
  });
});
