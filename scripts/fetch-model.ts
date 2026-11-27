/**
 * Downloads the on-device sentence-embedding model used by the optional "Possible matches - on-device AI"
 * feature (src/lib/semantic/**, docs/ON-DEVICE-AI.md) into public/models/all-MiniLM-L6-v2/.
 *
 *   npx tsx scripts/fetch-model.ts            download what is missing or wrong, verify every file
 *   npx tsx scripts/fetch-model.ts --check    verify only; exit 1 if a file is missing or does not match
 *   npx tsx scripts/fetch-model.ts --strict   like the default, but exit 1 when a download fails
 *
 * - Pinned: one exact Hugging Face commit (REVISION) and an exact SHA-256 + size for every file (MANIFEST, which is
 *   MODEL_FILES in src/lib/semantic/model.ts: the worker re-checks the same hashes in the browser).
 *   A file that does not match is never kept. The ONNX hash is the Git LFS object id Hugging Face
 *   publishes for that commit; the JSON hashes were taken from the same commit (their Git blob ids were
 *   checked against the commit tree).
 * - Idempotent: files that already match are not downloaded again.
 * - Non-fatal by default: on a network or verification failure it warns and exits 0. The app then keeps
 *   the feature off (the worker reports "model files not available"); nothing else depends on it.
 * - Only what the browser needs is kept: the int8-quantized ONNX graph, tokenizer.json,
 *   tokenizer_config.json and config.json (about 23.7 MB in total). A NOTICE.txt records attribution.
 * - This is a build-time download of public model weights. No clinical text is involved and the
 *   browser never contacts huggingface.co (it loads /models/** from the app's own origin).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MODEL_FILES, MODEL_HF_ID, MODEL_NAME, MODEL_REVISION, type PinnedFile } from "../src/lib/semantic/model";

const MODEL_ID = MODEL_HF_ID;
/** Hugging Face commit (2025-07-22), from src/lib/semantic/model.ts. Change only together with MANIFEST. */
const REVISION = MODEL_REVISION;
const MODEL_DIR_NAME = MODEL_NAME;

export type ManifestEntry = PinnedFile;

/** The pinned files (src/lib/semantic/model.ts MODEL_FILES: one list, also checked by the worker at runtime). */
export const MANIFEST: readonly ManifestEntry[] = MODEL_FILES;

const root = path.resolve(__dirname, "..");
export const MODEL_DIR = path.join(root, "public", "models", MODEL_DIR_NAME);

const NOTICE = `all-MiniLM-L6-v2 (ONNX, int8 quantized) - used on-device only by the optional
"Possible matches - on-device AI" feature. See docs/ON-DEVICE-AI.md.

Model:     sentence-transformers/all-MiniLM-L6-v2 (Apache License 2.0)
           https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
ONNX:      ${MODEL_ID} (Apache License 2.0), commit ${REVISION}
           https://huggingface.co/${MODEL_ID}/tree/${REVISION}
License:   https://www.apache.org/licenses/LICENSE-2.0

Files are unmodified copies of that commit and are verified by SHA-256 in scripts/fetch-model.ts:
${MANIFEST.map((m) => `  ${m.sha256}  ${m.path} (${m.bytes} bytes)`).join("\n")}
`;

export function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** "ok" when the file on disk matches the manifest entry exactly. */
export function verifyFile(entry: ManifestEntry, dir = MODEL_DIR): "ok" | "missing" | "mismatch" {
  const abs = path.join(dir, entry.path);
  if (!existsSync(abs)) return "missing";
  const buf = readFileSync(abs);
  if (buf.byteLength !== entry.bytes) return "mismatch";
  return sha256(buf) === entry.sha256 ? "ok" : "mismatch";
}

function url(entry: ManifestEntry): string {
  return `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${entry.path}`;
}

async function download(entry: ManifestEntry): Promise<void> {
  const abs = path.join(MODEL_DIR, entry.path);
  const part = `${abs}.part`;
  mkdirSync(path.dirname(abs), { recursive: true });
  const res = await fetch(url(entry), { redirect: "follow", signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${entry.path}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength !== entry.bytes) throw new Error(`${entry.path}: expected ${entry.bytes} bytes, got ${buf.byteLength}`);
  const got = sha256(buf);
  if (got !== entry.sha256) throw new Error(`${entry.path}: SHA-256 mismatch (got ${got})`);
  writeFileSync(part, buf);
  renameSync(part, abs);
}

function mb(n: number): string {
  return `${(n / 1_048_576).toFixed(2)} MB`;
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has("--check");
  const strict = args.has("--strict");

  // Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node >= 22.21). Re-run once with it set.
  const proxied = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!checkOnly && proxied && process.env.NODE_USE_ENV_PROXY !== "1") {
    const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      stdio: "inherit",
      env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_NO_WARNINGS: "1" },
    });
    return r.status ?? 1;
  }

  let failed = 0;
  for (const entry of MANIFEST) {
    const state = verifyFile(entry);
    if (state === "ok") {
      console.log(`model: ok          ${entry.path}`);
      continue;
    }
    if (checkOnly) {
      console.error(`model: ${state.padEnd(11)} ${entry.path}`);
      failed++;
      continue;
    }
    if (state === "mismatch") rmSync(path.join(MODEL_DIR, entry.path), { force: true });
    try {
      await download(entry);
      console.log(`model: downloaded  ${entry.path} (${mb(entry.bytes)})`);
    } catch (err) {
      rmSync(path.join(MODEL_DIR, `${entry.path}.part`), { force: true });
      console.warn(`model: FAILED      ${entry.path}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  if (!checkOnly && failed === 0) {
    const noticePath = path.join(MODEL_DIR, "NOTICE.txt");
    if (!existsSync(noticePath) || readFileSync(noticePath, "utf8") !== NOTICE) writeFileSync(noticePath, NOTICE);
  }

  const total = MANIFEST.reduce((n, m) => n + m.bytes, 0);
  if (failed === 0) {
    console.log(`model: ${MODEL_ID}@${REVISION.slice(0, 12)} ready in public/models/${MODEL_DIR_NAME}/ (${mb(total)})`);
    return 0;
  }
  if (checkOnly) return 1;
  console.warn(
    `model: ${failed} file(s) missing. The on-device matcher stays unavailable until \`npx tsx scripts/fetch-model.ts\` succeeds.`,
  );
  return strict ? 1 : 0;
}

if (typeof require !== "undefined" && require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.warn(`model: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(process.argv.includes("--strict") ? 1 : 0);
    },
  );
}
