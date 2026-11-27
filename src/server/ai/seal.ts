import "server-only";
/**
 * Answer seals: the assistant's follow-up history can only carry text the SERVER produced.
 *
 * Each answer option the route returns carries `seal`, an HMAC over (question id, question text, answer label)
 * computed on the server. When the browser sends its answered history back, every record must carry a seal that
 * verifies for exactly that text; anything else is dropped before the request is built. So the history cannot be
 * used to send free text, identifiers or reference-manual text that did not come from an earlier, sanitized
 * assistant answer (owner amendment: input = the scrubbed note + curated ids only).
 *
 * The seal key is derived from ANTHROPIC_API_KEY (HMAC with a fixed label), so it needs no extra secret, is the same
 * on every server instance and changes when the key is rotated (older seals then simply stop verifying). Nothing
 * is stored: verification is a pure recomputation. The key never leaves the server.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const LABEL = "clinician-resource-companion/assistant/answer-seal/v1";
const PREFIX = "v1.";
/** "v1." + 43 base64url characters (HMAC-SHA256, 256 bits). */
export const SEAL_PATTERN = /^v1\.[A-Za-z0-9_-]{43}$/;

let derived: { apiKey: string; key: Buffer } | null = null;

function sealKey(apiKey: string): Buffer {
  if (derived?.apiKey !== apiKey) derived = { apiKey, key: createHmac("sha256", apiKey).update(LABEL).digest() };
  return derived.key;
}

function mac(apiKey: string, parts: readonly string[]): Buffer {
  const h = createHmac("sha256", sealKey(apiKey));
  for (const p of parts) h.update(`${p.length}:${p}\n`); // length-prefixed: no ambiguity between fields
  return h.digest();
}

export interface SealedFields {
  questionId: string;
  questionText: string;
  answerLabel: string;
}

export function sealAnswer(apiKey: string, f: SealedFields): string {
  return PREFIX + mac(apiKey, [f.questionId, f.questionText, f.answerLabel]).toString("base64url");
}

/** True only when `seal` was issued by this server (same API key) for exactly these three strings. */
export function verifySeal(apiKey: string, f: SealedFields, seal: string): boolean {
  if (!SEAL_PATTERN.test(seal)) return false;
  const given = Buffer.from(seal.slice(PREFIX.length), "base64url");
  const want = mac(apiKey, [f.questionId, f.questionText, f.answerLabel]);
  return given.length === want.length && timingSafeEqual(given, want);
}
