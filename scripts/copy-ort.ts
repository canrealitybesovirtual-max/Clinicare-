/**
 * Copies the onnxruntime-web files the on-device embedder worker needs from node_modules into
 * public/ort/, so the browser loads the runtime from the app's own origin (no CDN; CSP stays
 * `connect-src 'self'`). Generated at build time; public/ort/ is not committed.
 *
 *   npx tsx scripts/copy-ort.ts           copy when missing or different
 *   npx tsx scripts/copy-ort.ts --check   exit 1 if public/ort/ is missing a file or out of date
 *
 * Only the plain SIMD build is copied (ORT_FILES in src/lib/semantic/model.ts): the module glue (.mjs)
 * and its WebAssembly binary. The onnxruntime-web copy used is the one @huggingface/transformers
 * resolves, so the JS API and the binary always come from the same release.
 *
 * Integrity: both files must match ORT_PINS (size + SHA-256) in src/lib/semantic/model.ts, which the worker checks
 * again in the browser before it runs them. When @huggingface/transformers pulls in a different onnxruntime-web
 * build, --check fails and the default run warns: review the new release, then update ORT_VERSION and ORT_PINS.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { ORT_FILES, ORT_PINS, ORT_VERSION } from "../src/lib/semantic/model";

const root = path.resolve(__dirname, "..");
export const ORT_OUT_DIR = path.join(root, "public", "ort");

/** Node's lookup: `<dir>/node_modules/<name>`, walking up from `fromDir`. */
function findPackage(name: string, fromDir: string): string {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`${name} not found`);
  }
}

/** dist/ folder of the onnxruntime-web package that @huggingface/transformers imports. */
export function ortDistDir(): string {
  const transformers = findPackage("@huggingface/transformers", root);
  return path.join(findPackage("onnxruntime-web", transformers), "dist");
}

export function ortVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(ortDistDir(), "..", "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

const sha = (f: string): string => createHash("sha256").update(readFileSync(f)).digest("hex");

function main(): number {
  const check = process.argv.includes("--check");
  let src: string;
  try {
    src = ortDistDir();
  } catch {
    console.warn("ort: onnxruntime-web is not installed; the on-device matcher stays unavailable.");
    return check ? 1 : 0;
  }
  if (!check) mkdirSync(ORT_OUT_DIR, { recursive: true });
  let stale = 0;
  let total = 0;
  for (const name of ORT_FILES) {
    const from = path.join(src, name);
    const to = path.join(ORT_OUT_DIR, name);
    if (!existsSync(from)) {
      console.warn(`ort: ${name} not found in ${path.relative(root, src)}`);
      stale++;
      continue;
    }
    const size = statSync(from).size;
    total += size;
    const pin = ORT_PINS.find((p) => p.path === name);
    if (!pin || pin.bytes !== size || pin.sha256 !== sha(from)) {
      const msg = `ort: PIN MISMATCH ${name}: node_modules has onnxruntime-web ${ortVersion()}, pinned ${ORT_VERSION}. Review the release, then update ORT_PINS in src/lib/semantic/model.ts (the browser refuses unpinned runtime files).`;
      if (check) console.error(msg);
      else console.warn(msg);
      stale++;
    }
    const same = existsSync(to) && statSync(to).size === size && sha(to) === sha(from);
    if (same) {
      console.log(`ort: ok      ${name} (${(size / 1_048_576).toFixed(2)} MB)`);
      continue;
    }
    if (check) {
      console.error(`ort: STALE   ${name}`);
      stale++;
      continue;
    }
    copyFileSync(from, to);
    console.log(`ort: copied  ${name} (${(size / 1_048_576).toFixed(2)} MB)`);
  }
  // Remove anything else (an older release's files) so only what the worker loads is served.
  if (!check && existsSync(ORT_OUT_DIR)) {
    for (const f of readdirSync(ORT_OUT_DIR)) {
      if (!(ORT_FILES as readonly string[]).includes(f)) rmSync(path.join(ORT_OUT_DIR, f), { recursive: true, force: true });
    }
  }
  console.log(`ort: onnxruntime-web ${ortVersion()} -> public/ort/ (${(total / 1_048_576).toFixed(2)} MB)`);
  return stale > 0 ? (check ? 1 : 0) : 0;
}

if (typeof require !== "undefined" && require.main === module) process.exit(main());
