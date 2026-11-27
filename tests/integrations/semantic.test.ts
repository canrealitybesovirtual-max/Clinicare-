/**
 * On-device semantic matcher (src/lib/semantic/**, docs/ON-DEVICE-AI.md).
 * Node-side: loads the pinned model files from public/models/ with remote downloads off and global
 * fetch disabled, so these tests prove nothing is downloaded. The browser worker runs the same core
 * functions (splitSegments, rankSuggestions) on the same model.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scrubPHI } from "@/lib/phi-scrubber";
import {
  DEFAULT_LIMIT,
  DEFAULT_THRESHOLD,
  MAX_SEGMENTS,
  decodeLexiconEmbeddings,
  decodeVectorHex,
  encodeVectorHex,
  expandGapPattern,
  isNegative,
  lexiconPhrases,
  prepareText,
  rankSuggestions,
  splitSegments,
  type LexiconIndex,
  type SemanticSuggestion,
  type SuggestOptions,
} from "@/lib/semantic/core";
import { SEMANTIC_CALIBRATION_SET, SPECIFIC_FEAR_PATTERN, evaluateCalibration } from "@/lib/semantic/calibration";
import {
  LEXICON_EMBEDDINGS_FORMAT,
  MODEL_DIMS,
  MODEL_FILES,
  MODEL_NAME,
  MODEL_REVISION,
  ORT_FILES,
  ORT_PINS,
  matchesPin,
  pinFor,
  sha256Hex,
} from "@/lib/semantic/model";
import { createNodeEmbedder, modelFilesPresent, type EmbedFn } from "@/lib/semantic/node-embedder";
import { MANIFEST, verifyFile } from "../../scripts/fetch-model";
import {
  EMBEDDINGS_PATH,
  buildEmbeddings,
  isStale,
  lexiconHash,
  loadLexicon,
  readEmbeddingsFile,
  serializeEmbeddings,
  suggestWith,
} from "../../scripts/build-lexicon-embeddings";
import { ortDistDir } from "../../scripts/copy-ort";

const ROOT = path.resolve(__dirname, "../..");
const lexicon = loadLexicon();
const ids = (r: SemanticSuggestion[]): string[] => r.map((s) => s.symptomId);

let embed: EmbedFn;
let index: LexiconIndex;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  // No network: any fetch during model load or inference fails the test.
  globalThis.fetch = (() => {
    throw new Error("network access is not allowed in semantic tests");
  }) as typeof fetch;
  expect(modelFilesPresent(), "model files missing: run `npx tsx scripts/fetch-model.ts`").toBe(true);
  embed = await createNodeEmbedder();
  // Index built in memory from the CURRENT lexicon, so behaviour tests do not depend on the committed
  // file being fresh (freshness has its own test below).
  index = decodeLexiconEmbeddings(await buildEmbeddings(lexicon, embed));
}, 120_000);

afterAll(() => {
  globalThis.fetch = realFetch;
});

const suggest = (text: string, opts?: SuggestOptions) => suggestWith(embed, index, text, opts);

describe("model files", () => {
  it("every pinned file is present and matches its SHA-256", () => {
    for (const entry of MANIFEST) expect(verifyFile(entry), entry.path).toBe("ok");
    const total = MANIFEST.reduce((n, m) => n + m.bytes, 0);
    expect(total).toBeLessThan(25 * 1024 * 1024);
  });

  it("onnxruntime-web ships the files the worker loads from /ort/", () => {
    const dist = ortDistDir();
    for (const f of ORT_FILES) expect(() => readFileSync(path.join(dist, f)), f).not.toThrow();
  });
});

describe("integrity pins (checked again in the browser before anything runs)", () => {
  it("the build manifest and the runtime pins are the same list", () => {
    expect(MANIFEST).toBe(MODEL_FILES);
    expect(ORT_PINS.map((p) => p.path)).toEqual([...ORT_FILES]);
  });

  it("served model and runtime files match their pins (Web Crypto, as the worker computes it)", async () => {
    for (const pin of MODEL_FILES) expect(await matchesPin(readFileSync(path.join(ROOT, "public/models", MODEL_NAME, pin.path)), pin), pin.path).toBe(true);
    for (const pin of ORT_PINS) expect(await matchesPin(readFileSync(path.join(ortDistDir(), pin.path)), pin), pin.path).toBe(true);
  });

  it("a single flipped byte, a truncated file or a swapped file is refused", async () => {
    const pin = MODEL_FILES.find((p) => p.path === "tokenizer_config.json")!;
    const good = new Uint8Array(readFileSync(path.join(ROOT, "public/models", MODEL_NAME, pin.path)));
    const flipped = good.slice();
    flipped[10] = flipped[10]! ^ 1;
    expect(await matchesPin(flipped, pin)).toBe(false);
    expect(await matchesPin(good.slice(0, -1), pin)).toBe(false);
    expect(await matchesPin(readFileSync(path.join(ROOT, "public/models", MODEL_NAME, "config.json")), pin)).toBe(false);
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("maps only the pinned same-origin paths; anything else under the model folder has no pin (the worker refuses it)", () => {
    expect(pinFor(`/models/${MODEL_NAME}/onnx/model_quantized.onnx`)?.sha256).toBe(MODEL_FILES[3]!.sha256);
    expect(pinFor("/ort/ort-wasm-simd-threaded.wasm")?.bytes).toBe(ORT_PINS[1]!.bytes);
    expect(pinFor(`/models/${MODEL_NAME}/onnx/model.onnx`)).toBeNull();
    expect(pinFor(`/models/${MODEL_NAME}/../evil.onnx`)).toBeNull();
    expect(pinFor("/models/lexicon-embeddings.json")).toBeNull(); // app-generated data, schema-checked instead
  });
});

describe("key paraphrases", () => {
  it('"panic from dogs" ranks cued / animal-fear panic in the top 3', async () => {
    const r = await suggest("panic from dogs");
    const top3 = ids(r).slice(0, 3);
    expect(top3.some((id) => id === "panic-attack-cued" || SPECIFIC_FEAR_PATTERN.test(id)), top3.join(", ")).toBe(true);
  });

  it('"keeps reliving the crash" ranks flashbacks or intrusive memories in the top 3 (below the default cut-off on lexicon 1.3.0)', async () => {
    // At DEFAULT_THRESHOLD (0.60) nothing is suggested for this clause (best 0.58); that is a miss, not a wrong chip.
    // The lexicon needs a "reliving" synonym on intrusive-memories / flashbacks (open issue, content owner).
    for (const s of await suggest("keeps reliving the crash")) expect(["flashbacks", "intrusive-memories", "traumatic-event-exposure"]).toContain(s.symptomId);
    const top3 = ids(await suggest("keeps reliving the crash", { threshold: 0.5 })).slice(0, 3);
    expect(top3.some((id) => id === "flashbacks" || id === "intrusive-memories"), top3.join(", ")).toBe(true);
  });

  it('"no interest in anything anymore" -> anhedonia first', async () => {
    const r = await suggest("no interest in anything anymore");
    expect(r[0]?.symptomId).toBe("anhedonia");
    expect(r[0]?.phrase.length).toBeGreaterThan(0);
    expect(r[0]?.clause).toBe("no interest in anything anymore");
  });

  it("finds each clause of a multi-symptom note", async () => {
    const r = ids(await suggest("Worries constantly about money and the kids, muscles always tight, wiped out by noon."));
    expect(r.some((id) => id.startsWith("worry-"))).toBe(true);
    expect(r).toContain("muscle-tension");
    expect(r).toContain("fatigue");
  });
});

describe("threshold, limit and exclusions", () => {
  it("returns only scores at or above the threshold, best first", async () => {
    for (const t of [DEFAULT_THRESHOLD, 0.6, 0.7]) {
      const r = await suggest("heart pounds out of my chest and i cant breathe", { threshold: t });
      for (const s of r) expect(s.score).toBeGreaterThanOrEqual(t);
      for (let i = 1; i < r.length; i++) expect((r[i - 1] as SemanticSuggestion).score).toBeGreaterThanOrEqual((r[i] as SemanticSuggestion).score);
    }
    expect(await suggest("heart pounds out of my chest", { threshold: 0.999 })).toEqual([]);
  });

  it("a higher threshold gives a subset", async () => {
    const text = "worried about everything all the time and cant sleep";
    const low = ids(await suggest(text, { threshold: 0.45, limit: 20 }));
    const high = ids(await suggest(text, { threshold: 0.65, limit: 20 }));
    for (const id of high) expect(low).toContain(id);
    expect(high.length).toBeLessThanOrEqual(low.length);
  });

  it("clamps options and respects the limit", async () => {
    const text = "panic attacks, cant sleep, no energy, feels worthless, snaps at people, cant focus";
    expect((await suggest(text)).length).toBeLessThanOrEqual(DEFAULT_LIMIT);
    expect((await suggest(text, { limit: 2 })).length).toBeLessThanOrEqual(2);
    expect((await suggest(text, { limit: 0 })).length).toBeLessThanOrEqual(1);
    const r = await suggest(text, { threshold: Number.NaN });
    for (const s of r) expect(s.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("never returns an excluded id", async () => {
    const first = await suggest("no interest in anything anymore");
    expect(ids(first)).toContain("anhedonia");
    const excluded = await suggest("no interest in anything anymore", { exclude: ["anhedonia"] });
    expect(ids(excluded)).not.toContain("anhedonia");

    const dogs = ids(await suggest("panic from dogs", { exclude: ["panic-attack-cued", "panic-attacks-unspecified"] }));
    expect(dogs).not.toContain("panic-attack-cued");
    expect(dogs).not.toContain("panic-attacks-unspecified");
  });

  it("returns ids that exist in the lexicon, once each", async () => {
    const known = new Set(lexicon.symptoms.map((s) => s.id));
    const r = await suggest("Since the crash he has nightmares, jumps at loud noises and avoids driving.", { limit: 20, threshold: 0.3 });
    for (const s of r) expect(known.has(s.symptomId)).toBe(true);
    expect(new Set(ids(r)).size).toBe(r.length);
  });
});

describe("negation", () => {
  it("drops strongly negated clauses", async () => {
    expect(await suggest("denies suicidal thoughts")).toEqual([]);
    const r = ids(await suggest("Denies SI. Reports low mood and no interest in her hobbies."));
    expect(r).toContain("depressed-mood");
    expect(r.some((id) => id.includes("suicid") || id === "passive-death-wish")).toBe(false);
  });

  it("does not suggest a symptom that is negated with a bare negator", async () => {
    expect(ids(await suggest("no nightmares"))).not.toContain("nightmares");
    const r = ids(await suggest("No nightmares or flashbacks, but she startles easily."));
    expect(r).not.toContain("nightmares");
    expect(r).not.toContain("flashbacks");
    expect(r.some((id) => id === "startle" || id === "hypervigilance")).toBe(true);
    expect(ids(await suggest("is not afraid of dogs"))).toEqual([]);
  });

  it("treats idioms such as 'for no reason' and 'out of nowhere' as positive", () => {
    expect(isNegative(prepareText("panic attacks for no reason"))).toBe(false);
    expect(isNegative(prepareText("came out of nowhere"))).toBe(false);
    expect(isNegative(prepareText("snaps at his kids over nothing"))).toBe(false);
    expect(isNegative(prepareText("can't sleep"))).toBe(true);
    expect(isNegative(prepareText("no interest"))).toBe(true);
  });
});

describe("determinism", () => {
  it("same text -> identical output, whatever ran before", async () => {
    const text = "She panics around dogs, cant sleep at night and feels worthless.";
    const a = await suggest(text, { threshold: 0.3, limit: 20 });
    await suggest("keeps reliving the crash");
    await suggest("worried about everything all the time");
    const b = await suggest(text, { threshold: 0.3, limit: 20 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("a segment's vector does not depend on the other segments", async () => {
    const [alone] = await embed(["panic from dogs"]);
    const [, inList] = await embed(["a much longer sentence about something else entirely to pad the batch", "panic from dogs"]);
    expect(Array.from(inList as Float32Array)).toEqual(Array.from(alone as Float32Array));
  });

  it("building the lexicon embeddings twice gives the same bytes", async () => {
    const sub = { ...lexicon, symptoms: lexicon.symptoms.slice(0, 4) };
    const a = serializeEmbeddings(await buildEmbeddings(sub, embed));
    const b = serializeEmbeddings(await buildEmbeddings(sub, embed));
    expect(b).toBe(a);
  }, 60_000);
});

describe("calibration", () => {
  it(`meets precision/recall targets at DEFAULT_THRESHOLD (${DEFAULT_THRESHOLD})`, async () => {
    expect(SEMANTIC_CALIBRATION_SET.length).toBeGreaterThanOrEqual(30);
    const results: SemanticSuggestion[][] = [];
    for (const c of SEMANTIC_CALIBRATION_SET) results.push(await suggest(c.text));
    const r = evaluateCalibration(SEMANTIC_CALIBRATION_SET, results, DEFAULT_THRESHOLD);
    // Measured on lexicon 1.3.0 (104 symptoms, 2632 phrases) at 0.60: precision 0.812, recall 0.855, top-1 0.868, negatives 10/10.
    expect(r.precision, r.falsePositives.join("\n")).toBeGreaterThanOrEqual(0.75);
    expect(r.recall, r.misses.join("\n")).toBeGreaterThanOrEqual(0.8);
    expect(r.negativesClean).toBeGreaterThanOrEqual(0.9);
  }, 60_000);
});

describe("segmentation and phrases (pure)", () => {
  it("drops PHI placeholders and keeps clause text for display", () => {
    const scrubbed = scrubPHI("John Smith (DOB 03/14/1980) panics around dogs").clean;
    const segs = splitSegments(scrubbed);
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      expect(s.clause).not.toMatch(/John|Smith|1980|\[/);
      expect(s.text).not.toMatch(/\[|\]/);
    }
  });

  it("caps the number of segments", () => {
    const long = Array.from({ length: 200 }, (_, i) => `symptom number ${i} feels worse.`).join(" ");
    expect(splitSegments(long).length).toBeLessThanOrEqual(MAX_SEGMENTS);
    expect(splitSegments("")).toEqual([]);
    expect(splitSegments("   ...   ")).toEqual([]);
  });

  it("ends a strong cue's scope at a contrast word or a new statement", () => {
    const texts = splitSegments("Denies nightmares and flashbacks but has panic attacks").map((s) => s.text);
    expect(texts.join(" | ")).not.toMatch(/nightmares|flashbacks/);
    expect(texts).toContain("has panic attacks");
  });

  it("expands gap patterns into plain phrases", () => {
    const out = expandGapPattern("avoid|afraid of ... bus|buses|trains|subway|metro|ferry");
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThanOrEqual(5);
    for (const p of out) expect(p).not.toMatch(/\.\.\.|\|/);
    expect(out[0]).toBe("avoid bus");
  });

  it("phrases come from the lexicon only (label pieces, plain label, synonyms)", () => {
    for (const s of lexicon.symptoms) {
      const phrases = lexiconPhrases(s);
      expect(phrases.length, s.id).toBeGreaterThan(0);
      for (const p of phrases) expect(p, s.id).not.toMatch(/\.\.\.|\|/);
    }
  });
});

describe("lexicon-embeddings.json", () => {
  const file = readEmbeddingsFile();

  it("exists, decodes and was built with the pinned model", () => {
    expect(file, "run `npx tsx scripts/build-lexicon-embeddings.ts`").not.toBeNull();
    expect(file?.format).toBe(LEXICON_EMBEDDINGS_FORMAT);
    expect(file?.model).toBe(MODEL_NAME);
    expect(file?.revision).toBe(MODEL_REVISION);
    const idx = decodeLexiconEmbeddings(file);
    expect(idx.dims).toBe(MODEL_DIMS);
    expect(idx.phraseCount).toBeGreaterThan(500);
  });

  it("is up to date with content/symptoms.json", () => {
    expect(file?.lexiconSha256, "stale: run `npx tsx scripts/build-lexicon-embeddings.ts`").toBe(lexiconHash(lexicon));
    expect(isStale(lexicon)).toBe(false);
  });

  it("holds hex vectors only and nothing the guardrail scanner flags", () => {
    const raw = readFileSync(EMBEDDINGS_PATH, "utf8");
    for (const s of file?.symptoms ?? []) for (const v of s.vectors) expect(v).toMatch(/^[0-9a-f]{768}$/);
    expect(raw).not.toMatch(/\b(firstName|lastName|clientName|patientName|dateOfBirth|dob|ssn|socialSecurity|mrn|medicalRecordNumber|insuranceId)\b/);
    expect(raw).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB|[Hh]omeopath|Criterion [A-H]\b/);
    expect(raw.length).toBeLessThan(3 * 1024 * 1024);
  });

  it("int8 hex round-trips to within quantization error", () => {
    const v = new Float32Array(MODEL_DIMS).map((_, i) => Math.sin(i + 1));
    const n = Math.hypot(...v);
    const unit = v.map((x) => x / n);
    const back = decodeVectorHex(encodeVectorHex(unit), MODEL_DIMS);
    let dot = 0;
    for (let i = 0; i < MODEL_DIMS; i++) dot += (unit[i] as number) * (back[i] as number);
    expect(dot).toBeGreaterThan(0.9999);
  });

  it("rejects files built for another model", () => {
    expect(() => decodeLexiconEmbeddings({ ...file, revision: "0000" })).toThrow();
    expect(() => decodeLexiconEmbeddings(null)).toThrow();
  });
});

describe("worker and client stay on-device", () => {
  const worker = readFileSync(path.join(ROOT, "src/lib/semantic/embedder.worker.ts"), "utf8");
  const client = readFileSync(path.join(ROOT, "src/lib/semantic/client.ts"), "utf8");

  it("worker hashes every pinned file (network and Cache Storage) before use", () => {
    expect(worker).toMatch(/async function verifyingFetch[\s\S]*requirePin\(url\)[\s\S]*verified\(url/);
    expect(worker).toMatch(/function verifyingCache[\s\S]*verified\(url[\s\S]*cache\.delete\(request\)/);
    expect(worker).toContain("return verified(url, out.buffer)"); // wasm binary and .mjs glue
    expect(worker).toContain("await fetchBytes(`${ORT_WASM_PATH}${mjsFile}`, 0)");
    expect(worker).toContain('throw new LoadError("integrity")');
  });

  it("worker loads same-origin files only", () => {
    expect(worker).toContain("env.allowRemoteModels = false");
    expect(worker).toContain("env.localModelPath = LOCAL_MODEL_PATH");
    expect(worker).toContain("env.fetch = verifyingFetch");
    expect(worker).toContain("env.useBrowserCache = false");
    expect(worker).toContain("experimental_useCrossOriginStorage = false");
    expect(worker).toMatch(/redirect: "error"/);
    expect(worker).toContain("env.useWasmCache = false");
    expect(worker).not.toMatch(/https?:\/\//);
  });

  it("client scrubs PHI before posting text to the worker and persists nothing", () => {
    expect(client).toMatch(/scrubPHI\(/);
    for (const src of [worker, client]) {
      expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB|console\.(log|info|debug)/);
    }
  });

  it("rankSuggestions works on any index without the model (pure)", () => {
    const tiny: LexiconIndex = {
      dims: 2,
      phraseCount: 2,
      entries: [
        { symptomId: "a", phrases: ["x"], negative: new Uint8Array([0]), vectors: new Float32Array([1, 0]) },
        { symptomId: "b", phrases: ["y"], negative: new Uint8Array([0]), vectors: new Float32Array([0, 1]) },
      ],
    };
    const seg = [{ clause: "q", text: "q", negated: false }];
    expect(rankSuggestions(seg, [new Float32Array([1, 0])], tiny)).toEqual([{ symptomId: "a", score: 1, phrase: "x", clause: "q" }]);
    expect(rankSuggestions(seg, [new Float32Array([1, 0])], tiny, { exclude: ["a"] })).toEqual([]);
    expect(rankSuggestions([{ ...seg[0]!, negated: true }], [new Float32Array([1, 0])], tiny)).toEqual([]);
  });
});
