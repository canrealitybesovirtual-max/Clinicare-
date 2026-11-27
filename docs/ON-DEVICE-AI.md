# On-device semantic matcher ("Possible matches - on-device AI")

An optional helper for the free-text symptom box. When a clinician types something the deterministic
matcher (`src/lib/matcher.ts`) has no phrase for, such as "panic from dogs", "freaks out near dogs" or
"keeps reliving the crash", a small sentence-embedding model running **inside the browser** suggests
the closest curated lexicon symptoms. The clinician taps a suggestion to add it. Nothing is added on its
own, nothing is diagnosed, no risk decision is made, and **no text leaves the device**.

It is not an AI/LLM API call: there is no server-side inference and no third-party service. The model
is a static file served from this app's own origin, like an image.

## What runs where

| Where | What | Code |
| --- | --- | --- |
| Build machine (Node) | Download the pinned model files once, verify SHA-256 | `scripts/fetch-model.ts` |
| Build machine (Node) | Copy the onnxruntime-web WASM runtime from `node_modules` to `public/ort/` | `scripts/copy-ort.ts` |
| Build machine (Node) | Embed every lexicon phrase (labels, plain-language labels, synonyms) into `public/models/lexicon-embeddings.json` | `scripts/build-lexicon-embeddings.ts` |
| Server | Serves static files only (`/models/**`, `/ort/**`). Sees no clinical text. | (Next.js static `public/`) |
| Browser page | Feature toggle, progress, PHI scrub (again), tap-to-add chips | `src/lib/semantic/client.ts`, `use-semantic.ts` |
| Browser Web Worker | Loads the model + runtime + lexicon vectors, embeds the clinician's clauses, ranks matches | `src/lib/semantic/embedder.worker.ts`, `core.ts` |

Model: [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
(Apache-2.0), int8 ONNX export by [`Xenova/all-MiniLM-L6-v2`](https://huggingface.co/Xenova/all-MiniLM-L6-v2),
pinned to commit `751bff37182d3f1213fa05d7196b954e230abad9` (`src/lib/semantic/model.ts`). 22M parameters,
384-dimension mean-pooled sentence vectors. Runtime: transformers.js 4.3.2 (Apache-2.0) on
onnxruntime-web 1.31 (MIT), CPU via WebAssembly SIMD; multi-threaded only when the page is
cross-origin isolated. Attribution: `public/models/all-MiniLM-L6-v2/NOTICE.txt`.

## Download size

Nothing is downloaded until the clinician turns the feature on. Then, once per browser:

| File | Bytes | gzip on the wire |
| --- | ---: | ---: |
| `/models/all-MiniLM-L6-v2/onnx/model_quantized.onnx` | 22,972,370 | ~16.2 MB |
| `/models/all-MiniLM-L6-v2/tokenizer.json` (+ `config.json`, `tokenizer_config.json`) | 712,677 | ~0.2 MB |
| `/ort/ort-wasm-simd-threaded.wasm` (+ `.mjs` glue, 24 KB) | 14,289,219 | ~3.7 MB |
| `/models/lexicon-embeddings.json` (67 symptoms, 1,686 phrases) | 1,344,655 | ~0.7 MB |
| **Total** | **~39.3 MB** | **~21 MB** |

Committed to the repo: `public/models/**` (about 25 MB). Generated at build and git-ignored: `public/ort/**`.
Measured in headless Chromium (localhost): load about 0.9 s after download, about 20 ms per clause.

## Privacy

- **Text never leaves the device.** The worker fetches only same-origin static files; `env.allowRemoteModels = false`
  and a guarded `env.fetch` refuses any other origin, so the CSP `connect-src 'self'` keeps holding.
  Verified in Chromium under a strict CSP: the only requests are `/models/**` and `/ort/**`.
- **Scrubbed first.** The page passes scrubbed text, and `semanticSuggest()` runs `scrubPHI()` again (idempotent)
  before posting to the worker. Scrubber placeholders ("[NAME]") are dropped before embedding.
- **Memory only.** Text and vectors live in page/worker memory. The worker keeps up to 128 recent clause vectors
  so re-suggesting while typing is cheap; `clearSemanticMemory()` drops them and `disableSemanticModel()` terminates
  the worker. No localStorage, sessionStorage, cookies, IndexedDB, logs or analytics.
- **Pinned and verified in the browser.** Every model file and both runtime files carry a size + SHA-256 pin
  (`MODEL_FILES`, `ORT_PINS` in `src/lib/semantic/model.ts`; `scripts/fetch-model.ts` uses the same list). The worker
  reads each pinned file whole, hashes it with Web Crypto and refuses anything that does not match (error code
  `integrity`, "files on this server do not match their pinned checksums"), before transformers.js or
  onnxruntime-web sees a byte: the model weights, tokenizer and config through `env.fetch`, the WebAssembly binary,
  and the `.mjs` glue (checked by a fetch before onnxruntime-web imports it). Any path under
  `/models/all-MiniLM-L6-v2/` without a pin is refused. Fetches use `redirect: "error"`, so a same-origin URL cannot
  bounce to another host. Web Crypto needs a secure context: on plain HTTP (other than localhost) the feature reports
  `unsupported`. The lexicon embeddings are app-generated data and are schema-checked instead of pinned.
- **Model cache.** With `cacheModel: true` (default) the *model files* (public weights, never text) are kept in Cache
  Storage `transformers-cache` through a verifying wrapper (`env.customCache`): every cached copy is hashed again
  before reuse and deleted if it does not match, then re-fetched and verified. The library's own unverified browser
  cache, its WASM cache and its experimental cross-origin storage are switched off. `clearSemanticModelCache()`
  deletes the cache; pass `cacheModel: false` to never cache.
- **Not a decision-maker.** Output is curated lexicon ids for clinician review. Red flags are still found by the
  deterministic matcher and the crisis button stays on every screen; the semantic list may also surface a
  safety symptom, which the UI must show like any other suggestion (never hidden, never auto-added).
- **Not in client mode.** The UI must not offer it in client mode.

## How it matches

1. `splitSegments()` cuts the text into sentences and clauses (commas, "and", "but", "because", ...). A
   multi-clause sentence is also embedded whole.
2. Negation: strong cues from the matcher ("denies", "negative for", "no history of", ...) drop the clause and the
   list after it until "but" or a new statement. A bare negator ("no", "not", "never", "can't") lets a clause match
   only lexicon phrases that are negative themselves ("no interest", "can't sleep") and only when it is not much
   closer to a positive phrase ("no nightmares" is closest to "nightmares", so nothing is suggested). Idioms such as
   "for no reason", "out of nowhere", "over nothing" do not count as negation.
3. Each clause is embedded **one at a time** (the int8 model quantizes activations per tensor, so batching would make
   vectors depend on their neighbours). Cosine similarity against every lexicon phrase; a symptom's score is its best
   phrase.
4. Per clause, only symptoms within `DEFAULT_MARGIN` (0.08) of that clause's best match are kept, then everything below
   `DEFAULT_THRESHOLD` (0.60) is dropped, ids in `exclude` are removed, and the list is cut to `limit` (default 5).
   Ties break on id: the same text always gives the same list.

## Calibration

63 invented paraphrases in `src/lib/semantic/calibration.ts` (48 single-symptom, 5 multi-symptom notes, 10 negative
or negated texts). Report: `npx tsx scripts/build-lexicon-embeddings.ts --calibrate`.

| Threshold | Precision | Recall | Top-1 | Negatives clean |
| ---: | ---: | ---: | ---: | ---: |
| 0.450 | 0.610 | 0.903 | 0.906 | 0.7 |
| 0.500 | 0.663 | 0.903 | 0.906 | 0.8 |
| 0.550 | 0.738 | 0.887 | 0.906 | 0.8 |
| 0.575 | 0.787 | 0.887 | 0.906 | 1.0 |
| **0.600 (default)** | **0.808** | **0.887** | **0.906** | **1.0** |
| 0.650 | 0.841 | 0.806 | 0.849 | 1.0 |

Precision = relevant suggestions / all suggestions; recall = expected symptoms found / expected symptoms (lexicon 1.4.0
with the review-round-3 fear and paranoia phrasings, 157 symptoms, 3302 phrases, margin 0.08, limit 5). The default was 0.50 on lexicon 1.2.0 (67 symptoms: precision
0.833, recall 0.887). With the larger lexicon, 0.50 let neutral texts through ("likes walking her dogs in the park"
suggested avoidance), so the default moved to 0.60, where every negative text stays clean. Lexicon 1.4.0 added
"reliving" wording to the intrusive-memory symptoms, so "keeps reliving the crash" is found again at 0.60. Re-run the
report whenever the lexicon changes.

Known limits (also why it is only a suggestion list):
- Colloquialisms the lexicon lacks ("freaks out near dogs", "the smell of smoke sets her off") can stay below the
  threshold. Adding the phrase as a lexicon synonym fixes both matchers.
- Embeddings blur close opposites: "drives way too fast since the accident" scores higher for avoidance ("won't drive
  since the accident") than for reckless driving, and "thinking about killing himself" also surfaces homicidal ideation
  (0.72, just below suicidal ideation at 0.75). The clinician decides.
- Lexicon 1.4.0 has phobia-subtype symptoms (`fear-animals`, `fear-heights`, `fear-flying`, `fear-blood-injection`,
  `fear-enclosed-spaces`, `fear-natural-environment`); they form one associated slot of specific phobia, so a matched
  subtype counts once and is not offered as a tap-to-add feature.

## How to disable

- **Per clinician / session:** the toggle calls `disableSemanticModel()` (stops the worker, frees memory). "Remove
  downloaded model" calls `clearSemanticModelCache()`.
- **Per deployment:** do not run `scripts/copy-ort.ts` and remove `public/models/` (or block `/models/` and `/ort/`).
  The worker then reports `files-missing` and the UI hides the toggle. A build-time flag such as
  `NEXT_PUBLIC_ON_DEVICE_AI=false` read by the UI is the cleaner switch (not a secret).
- **Unsupported browsers** (no module Web Worker or no WebAssembly SIMD): `semanticSupport()` returns
  `{ supported: false, reason }`; the UI shows the reason and keeps the deterministic matcher only.

## Updating the model or lexicon

- Lexicon changed: `npm run model:embed` (`npx tsx scripts/build-lexicon-embeddings.ts`), then commit
  `public/models/lexicon-embeddings.json`. It is not part of `prebuild` (the model files may be absent on a build
  host); `npm run model:check`, `tests/unit/semantic-build.test.ts` and `tests/integrations/semantic.test.ts` fail
  while it is stale. Output is byte-for-byte deterministic.
- New model revision: change `MODEL_REVISION` and the `MODEL_FILES` hashes in `src/lib/semantic/model.ts` (the build
  script and the worker both read them), run all three scripts, re-run `--calibrate` and the tests, update this page.
- New onnxruntime-web build (an `@huggingface/transformers` upgrade): `npx tsx scripts/copy-ort.ts --check` fails with
  "PIN MISMATCH" and the browser refuses the runtime. Review the release, then update `ORT_VERSION` and `ORT_PINS`.

## Wiring (for the UI)

```tsx
import { useSemanticModel, useSemanticSuggestions } from "@/lib/semantic/use-semantic";
import { SEMANTIC_DOWNLOAD_BYTES, SEMANTIC_SUGGESTIONS_LABEL } from "@/lib/semantic/client";

const model = useSemanticModel(); // { state, support, enable, disable, clearCache }
const { suggestions, pending } = useSemanticSuggestions(scrubbedText, {
  enabled: model.state.status === "ready",
  exclude: [...selectedIds, ...matchedIds], // chips already chosen + deterministic matches
});
// Toggle (off by default, clinician mode only): model.enable() / model.disable().
// Show ~39 MB (SEMANTIC_DOWNLOAD_BYTES) before enabling; show model.state.progress.fraction while loading.
// Render suggestions under SEMANTIC_SUGGESTIONS_LABEL + "For clinician review" as tap-to-add chips:
// label = getSymptom(s.symptomId)?.label (skip ids it does not know); hint = `close to "${s.phrase}"`.
```

## Deployment checklist (owned by the integration step)

- CSP `script-src` adds `'wasm-unsafe-eval'` (WebAssembly compile). `worker-src 'self' blob:` and `connect-src 'self'`
  stay as they are. No `'unsafe-eval'`, no CDN.
- `prebuild`: `tsx scripts/gen-content-index.ts && tsx scripts/copy-ort.ts` (`predev` runs copy-ort). The model files
  (`npm run model:fetch`) and the embeddings (`npm run model:embed`) are committed, not rebuilt on the build host.
- `.gitignore`: `public/ort/`.
- Cache headers: `/models/all-MiniLM-L6-v2/*` and `/ort/*` can be `public, max-age=31536000, immutable` (pinned
  revision / pinned package); `/models/lexicon-embeddings.json` should be `no-cache` (revalidate). The current
  catch-all `no-store` makes every enable re-download unless `cacheModel` is on.
- Service worker: must not precache `/models/**` or `/ort/**`. Its `activate` step deletes every cache except its own,
  which also clears `transformers-cache` after an app update (harmless: one re-download).
