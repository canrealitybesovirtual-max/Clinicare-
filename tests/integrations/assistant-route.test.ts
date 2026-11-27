/**
 * POST /api/assistant handler (src/server/routes/assistant.ts). Fake SDK client and env are injected; the real
 * API is never called.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { __resetAssistantLimitsForTests } from "@/server/ai/limits";
import type { AssistantClient, BetaCreateParams, BetaMessage } from "@/server/ai/client";
import { ASSISTANT_MESSAGES, POST, createAssistantHandler, runtime } from "@/server/routes/assistant";

const ENABLED = { ANTHROPIC_API_KEY: "sk-test-not-a-real-key", AI_ASSISTANT_ENABLED: "true", AI_BAA_CONFIRMED: "true" } as const;

const INPUT = {
  optIn: true,
  text: "Panic around dogs; avoids the dog park on the way to work.",
  symptomIds: ["panic-attack-cued"],
  duration: "unknown",
  impairment: "yes",
  substancePossible: "unknown",
  medicalPossible: "unknown",
  candidateConditionIds: [],
  answered: [],
  lang: "en",
};

const REPLY = {
  questions: [
    {
      id: "cued",
      text: "Is the panic tied to dogs only, or does it also come unexpectedly?",
      why: "Separates a specific trigger from unexpected panic.",
      answers: [
        { label: "Dogs only", addSymptomIds: ["panic-attack-cued"], negateSymptomIds: [] },
        { label: "Also unexpectedly", addSymptomIds: ["panic-attacks-unexpected"], negateSymptomIds: [] },
      ],
    },
  ],
  resources: { measureIds: ["gad-7"], interventionIds: [], referralKinds: [] },
};

function fakeClient() {
  const calls: BetaCreateParams[] = [];
  const client: AssistantClient = {
    beta: {
      messages: {
        async create(body) {
          calls.push(body);
          return {
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: "claude-opus-5-5",
            stop_reason: "end_turn",
            stop_sequence: null,
            content: [{ type: "text", text: JSON.stringify(REPLY), citations: null }],
            usage: { input_tokens: 1, output_tokens: 1 },
          } as unknown as BetaMessage;
        },
      },
    },
  };
  return { client, calls };
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let consoleSpies: MockInstance[] = [];
beforeEach(() => {
  __resetAssistantLimitsForTests();
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k));
});
afterEach(() => {
  for (const s of consoleSpies) {
    expect(s).not.toHaveBeenCalled();
    s.mockRestore();
  }
});

describe("POST /api/assistant", () => {
  it("declares the nodejs runtime", () => {
    expect(runtime).toBe("nodejs");
  });

  it("answers 503 not-configured with a friendly message when disabled, before reading the body", async () => {
    const f = fakeClient();
    const handler = createAssistantHandler({ client: f.client, env: {} });
    const res = await handler(req("{not json"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "not-configured", error: ASSISTANT_MESSAGES.off });
    expect(f.calls).toHaveLength(0);
  });

  it("the exported POST is off in the test environment (no env vars set)", async () => {
    const saved = { ...process.env };
    for (const k of Object.keys(ENABLED)) delete process.env[k];
    try {
      const res = await POST(req(INPUT));
      expect(res.status).toBe(503);
    } finally {
      process.env = saved;
    }
  });

  it("returns the labeled result with no-store headers", async () => {
    const f = fakeClient();
    const res = await createAssistantHandler({ client: f.client, env: ENABLED })(req(INPUT));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = (await res.json()) as { ok: boolean; data: Record<string, unknown>; attribution: string; source: string };
    expect(json.ok).toBe(true);
    expect(json.data.label).toBe("For clinician review");
    expect(json.data.generatedBy).toBe("Claude (Anthropic)");
    expect(json.attribution).toMatch(/Claude \(Anthropic\)/);
    expect(json.source).toBe("Anthropic API");
    expect(f.calls).toHaveLength(1);
  });

  it("rejects planted identifiers with 400 and sends nothing", async () => {
    const f = fakeClient();
    const res = await createAssistantHandler({ client: f.client, env: ENABLED })(req({ ...INPUT, text: "Maria Garcia, DOB 04/02/1990, panic around dogs" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, code: "rejected", error: ASSISTANT_MESSAGES.identifiers });
    expect(f.calls).toHaveLength(0);
  });

  it("rejects substance-use text with the Part 2 message and sends nothing", async () => {
    const f = fakeClient();
    const res = await createAssistantHandler({ client: f.client, env: ENABLED })(req({ ...INPUT, text: "Panic around dogs, uses cocaine on weekends" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, code: "rejected", error: ASSISTANT_MESSAGES.substance });
    expect(f.calls).toHaveLength(0);
  });

  it("refuses invalid, cross-site, non-JSON and oversized requests", async () => {
    const f = fakeClient();
    const handler = createAssistantHandler({ client: f.client, env: ENABLED });
    expect((await handler(req({ ...INPUT, extra: 1 }))).status).toBe(400);
    expect((await handler(req("{oops"))).status).toBe(400);
    expect((await handler(req(INPUT, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await handler(req(INPUT, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await handler(req({ ...INPUT, text: "x".repeat(20_000) }))).status).toBe(413);
    expect(f.calls).toHaveLength(0);
  });

  it("limits each client to 10 requests per minute", async () => {
    const f = fakeClient();
    const handler = createAssistantHandler({ client: f.client, env: ENABLED });
    for (let i = 0; i < 10; i++) expect((await handler(req(INPUT))).status).toBe(200);
    const limited = await handler(req(INPUT));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("10");
    expect((await handler(req(INPUT, { "x-forwarded-for": "198.51.100.9" }))).status).toBe(200); // another client
    expect(f.calls).toHaveLength(11);
  });

  it("never echoes the request text in errors", async () => {
    const f = fakeClient();
    const secret = "Panic around dogs and a unique phrase zebra-kumquat";
    const res = await createAssistantHandler({ client: f.client, env: ENABLED })(req({ ...INPUT, text: secret, lang: "xx" }));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("zebra-kumquat");
  });
});
