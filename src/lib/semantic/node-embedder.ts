/**
 * Node-only embedder for build scripts and tests (never imported by app code). Loads the same pinned
 * model files the browser uses, from public/models/, with remote downloads switched off: no network.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { MODEL_DIMS, MODEL_DTYPE, MODEL_NAME } from "./model";
import { normalize } from "./core";

export type EmbedFn = (texts: readonly string[]) => Promise<Float32Array[]>;

/** public/models/ (absolute). */
export const NODE_MODEL_ROOT = path.resolve(__dirname, "../../../public/models");

export function modelFilesPresent(root = NODE_MODEL_ROOT): boolean {
  const dir = path.join(root, MODEL_NAME);
  return ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"].every((f) =>
    existsSync(path.join(dir, f)),
  );
}

/**
 * One text per model call. The int8 model quantizes activations per tensor (DynamicQuantizeLinear), so
 * in a padded batch every text's vector depends on its neighbours. One at a time, a phrase's vector is
 * a pure function of the phrase: the same in the build, the tests and the browser worker.
 */
const BATCH = 1;

/** Mean-pooled, L2-normalized embeddings, one Float32Array(384) per input, in input order. */
export async function createNodeEmbedder(root = NODE_MODEL_ROOT): Promise<EmbedFn> {
  if (!modelFilesPresent(root)) throw new Error("model files missing: run `npx tsx scripts/fetch-model.ts`");
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = root.endsWith(path.sep) ? root : root + path.sep;
  env.useFSCache = false;
  const extractor = await pipeline("feature-extraction", MODEL_NAME, { dtype: MODEL_DTYPE, device: "cpu" });
  return async (texts) => {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const t = await extractor([...batch], { pooling: "mean", normalize: true });
      const data = t.data as Float32Array;
      for (let j = 0; j < batch.length; j++) {
        out.push(normalize(Float32Array.from(data.subarray(j * MODEL_DIMS, (j + 1) * MODEL_DIMS))));
      }
    }
    return out;
  };
}
