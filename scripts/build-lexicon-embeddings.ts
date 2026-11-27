/**
 * Builds public/models/lexicon-embeddings.json: one on-device embedding per lexicon phrase (label pieces,
 * plain-language label, synonyms, expanded gap patterns) from content/symptoms.json, with the same pinned
 * model the browser uses (src/lib/semantic/model.ts). See docs/ON-DEVICE-AI.md.
 *
 *   npx tsx scripts/build-lexicon-embeddings.ts              rebuild if the lexicon or model changed
 *   npx tsx scripts/build-lexicon-embeddings.ts --force      rebuild unconditionally
 *   npx tsx scripts/build-lexicon-embeddings.ts --check      exit 1 if the file is missing or stale
 *   npx tsx scripts/build-lexicon-embeddings.ts --calibrate  print precision/recall per threshold
 *   add --strict to exit 1 (instead of 0) when the model files are missing
 *
 * - Deterministic: fixed phrase order, fixed batch size, int8 quantization, fixed JSON layout. The file
 *   records `lexiconSha256` (phrases + model revision); when it matches, nothing is rewritten.
 * - Compact: near-duplicate phrases of the same symptom (cosine >= DEDUPE_COSINE) are stored once;
 *   vectors are int8 in hex (384 bytes -> 768 characters; hex also keeps the file clear of the guardrail
 *   scanner's word patterns).
 * - Offline: reads the model from public/models/ only (scripts/fetch-model.ts downloads it).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SymptomLexiconSchema, type SymptomLexicon } from "../src/lib/schemas";
import {
  DEFAULT_THRESHOLD,
  decodeLexiconEmbeddings,
  encodeVectorHex,
  lexiconPhrases,
  prepareText,
  rankSuggestions,
  splitSegments,
  type LexiconEmbeddingsFile,
  type LexiconIndex,
  type SemanticSuggestion,
} from "../src/lib/semantic/core";
import { LEXICON_EMBEDDINGS_FORMAT, MODEL_DIMS, MODEL_NAME, MODEL_REVISION } from "../src/lib/semantic/model";
import { SEMANTIC_CALIBRATION_SET, evaluateCalibration } from "../src/lib/semantic/calibration";
import { createNodeEmbedder, modelFilesPresent, type EmbedFn } from "../src/lib/semantic/node-embedder";

const root = path.resolve(__dirname, "..");
export const LEXICON_PATH = path.join(root, "content", "symptoms.json");
export const EMBEDDINGS_PATH = path.join(root, "public", "models", "lexicon-embeddings.json");
/** Phrases of one symptom closer than this to an already-kept phrase add nothing and are dropped. */
export const DEDUPE_COSINE = 0.96;

export function loadLexicon(file = LEXICON_PATH): SymptomLexicon {
  return SymptomLexiconSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function phraseTable(lexicon: SymptomLexicon): { id: string; phrases: string[] }[] {
  return lexicon.symptoms.map((s) => ({ id: s.id, phrases: lexiconPhrases(s) }));
}

/** Changes whenever a phrase, an id, the phrase rules' output or the model revision changes. */
export function lexiconHash(lexicon: SymptomLexicon): string {
  const payload = JSON.stringify({ format: LEXICON_EMBEDDINGS_FORMAT, model: MODEL_NAME, revision: MODEL_REVISION, dedupe: DEDUPE_COSINE, table: phraseTable(lexicon) });
  return createHash("sha256").update(payload).digest("hex");
}

const dot = (a: Float32Array, b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
  return s;
};

/** Embed every phrase and build the file object (not yet serialized). */
export async function buildEmbeddings(lexicon: SymptomLexicon, embed: EmbedFn): Promise<LexiconEmbeddingsFile> {
  const table = phraseTable(lexicon);
  const flat = table.flatMap((t) => t.phrases.map((p) => prepareText(p)));
  const vectors = await embed(flat);
  let k = 0;
  const symptoms = table.map((t) => {
    const keptPhrases: string[] = [];
    const keptVectors: Float32Array[] = [];
    for (const phrase of t.phrases) {
      const v = vectors[k++] as Float32Array;
      if (keptVectors.some((u) => dot(u, v) >= DEDUPE_COSINE)) continue;
      keptPhrases.push(phrase);
      keptVectors.push(v);
    }
    return { id: t.id, phrases: keptPhrases, vectors: keptVectors.map((v) => encodeVectorHex(v)) };
  });
  return {
    format: LEXICON_EMBEDDINGS_FORMAT,
    model: MODEL_NAME,
    revision: MODEL_REVISION,
    dims: MODEL_DIMS,
    encoding: "int8-hex",
    lexiconVersion: lexicon.version,
    lexiconSha256: lexiconHash(lexicon),
    generatedBy: "scripts/build-lexicon-embeddings.ts",
    symptoms,
  };
}

/** Stable layout: header fields, then one symptom per line (readable diffs). */
export function serializeEmbeddings(f: LexiconEmbeddingsFile): string {
  const { symptoms, ...header } = f;
  const head = JSON.stringify(header);
  const rows = symptoms.map((s) => JSON.stringify(s));
  return `${head.slice(0, -1)},"symptoms":[\n${rows.join(",\n")}\n]}\n`;
}

export function readEmbeddingsFile(file = EMBEDDINGS_PATH): LexiconEmbeddingsFile | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LexiconEmbeddingsFile;
  } catch {
    return null;
  }
}

export function isStale(lexicon: SymptomLexicon, file = EMBEDDINGS_PATH): boolean {
  const f = readEmbeddingsFile(file);
  if (!f) return true;
  try {
    decodeLexiconEmbeddings(f);
  } catch {
    return true;
  }
  return f.lexiconSha256 !== lexiconHash(lexicon);
}

/** Same steps as the worker: split, embed, rank. */
export async function suggestWith(
  embed: EmbedFn,
  index: LexiconIndex,
  text: string,
  opts: Parameters<typeof rankSuggestions>[3] = {},
): Promise<SemanticSuggestion[]> {
  const segments = splitSegments(text);
  if (segments.length === 0) return [];
  const vectors = await embed(segments.map((s) => s.text));
  return rankSuggestions(segments, vectors, index, opts);
}

async function calibrate(embed: EmbedFn, index: LexiconIndex): Promise<void> {
  const results: SemanticSuggestion[][] = [];
  for (const c of SEMANTIC_CALIBRATION_SET) results.push(await suggestWith(embed, index, c.text, { threshold: 0, limit: 5 }));
  console.log(`calibration: ${SEMANTIC_CALIBRATION_SET.length} cases, top-5 suggestions, ${index.phraseCount} phrases`);
  console.log("threshold  precision  recall  top1   negatives-clean");
  for (let t = 0.3; t <= 0.701; t += 0.025) {
    const r = evaluateCalibration(SEMANTIC_CALIBRATION_SET, results, Math.round(t * 1000) / 1000);
    const mark = Math.abs(r.threshold - DEFAULT_THRESHOLD) < 1e-9 ? "  <- DEFAULT_THRESHOLD" : "";
    console.log(
      `${r.threshold.toFixed(3).padEnd(10)} ${r.precision.toFixed(3).padEnd(10)} ${r.recall.toFixed(3).padEnd(7)} ${r.top1.toFixed(3).padEnd(6)} ${r.negativesClean.toFixed(3)}${mark}`,
    );
  }
  const r = evaluateCalibration(SEMANTIC_CALIBRATION_SET, results, DEFAULT_THRESHOLD);
  console.log(`\nat ${DEFAULT_THRESHOLD}: misses (${r.misses.length}):`);
  for (const m of r.misses) {
    const i = SEMANTIC_CALIBRATION_SET.findIndex((c) => c.text === m);
    const top = (results[i] ?? []).slice(0, 3).map((s) => `${s.symptomId} ${s.score}`).join(", ");
    console.log(`  - ${m}   [best: ${top || "none"}]`);
  }
  console.log(`false positives (${r.falsePositives.length}):`);
  for (const f of r.falsePositives) console.log(`  - ${f}`);
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const strict = args.has("--strict");
  const lexicon = loadLexicon();

  if (args.has("--check")) {
    const stale = isStale(lexicon);
    console.log(`lexicon embeddings: ${stale ? "STALE or missing (run npx tsx scripts/build-lexicon-embeddings.ts)" : "up to date"}`);
    return stale ? 1 : 0;
  }
  if (!modelFilesPresent()) {
    console.warn("lexicon embeddings: model files missing (npx tsx scripts/fetch-model.ts); on-device matcher stays off.");
    return strict ? 1 : 0;
  }
  const embed = await createNodeEmbedder();

  if (!args.has("--force") && !isStale(lexicon) && !args.has("--calibrate")) {
    console.log("lexicon embeddings: unchanged");
    return 0;
  }
  let file = readEmbeddingsFile();
  if (args.has("--force") || isStale(lexicon)) {
    const t0 = Date.now();
    file = await buildEmbeddings(lexicon, embed);
    const text = serializeEmbeddings(file);
    writeFileSync(EMBEDDINGS_PATH, text);
    const phrases = file.symptoms.reduce((n, s) => n + s.phrases.length, 0);
    console.log(
      `lexicon embeddings: wrote ${path.relative(root, EMBEDDINGS_PATH)} (${file.symptoms.length} symptoms, ${phrases} phrases, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB, ${Date.now() - t0} ms)`,
    );
  }
  if (args.has("--calibrate") && file) await calibrate(embed, decodeLexiconEmbeddings(file));
  return 0;
}

if (typeof require !== "undefined" && require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`lexicon embeddings: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(process.argv.includes("--strict") ? 1 : 0);
    },
  );
}
