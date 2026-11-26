import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import { OutboundRejected } from "@/lib/outbound";
import { NotConfigured, UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  ICD11_ATTRIBUTION,
  __resetIcd11ForTests,
  configureIcd11RateLimit,
  icd11BrowserLink,
  icd11Lookup,
  isIcd11Configured,
  isSudIcd11,
} from "@/server/integrations/who-icd11";
import { POST } from "@/server/routes/icd11";

const CLIENT_ID = "test-client-id-0001";
const CLIENT_SECRET = "test-client-secret-do-not-leak";
const TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token";
const API = "https://id.who.int/icd/release/11/2026-01/mms";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Placeholder text only (no WHO wording is copied into tests).
const entity = (id: string, code: string, lang = "en", extra: Record<string, unknown> = {}) => ({
  "@context": "http://id.who.int/icd/contexts/contextForLinearizationEntity.json",
  "@id": `http://id.who.int/icd/release/11/2026-01/mms/${id}`,
  browserUrl: `https://icd.who.int/browse/2026-01/mms/${lang}#${id}`,
  code,
  classKind: "category",
  title: { "@language": lang, "@value": `Title for <em>${code}</em>` },
  definition: { "@language": lang, "@value": "Placeholder definition &amp; test text." },
  inclusion: [{ label: { "@language": lang, "@value": "Included term" } }],
  exclusion: [{ label: { "@language": lang, "@value": "Excluded term A" } }, { label: { "@language": lang, "@value": "Excluded term B" } }],
  ...extra,
});

/** Distinct numeric entity id per code (6B00 uses its real WHO entity id). */
const idFor = (code: string) => (code === "6B00" ? "1712535455" : `2${[...code].map((c) => c.charCodeAt(0)).join("").slice(0, 10)}`);
const codeForId = new Map<string, string>();

let tokenCounter = 0;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
function router(overrides: Partial<Record<"token" | "codeinfo" | "entity", (url: string, init?: RequestInit) => Response>> = {}) {
  return async (url: string, init?: RequestInit) => {
    if (url === TOKEN_URL) return overrides.token?.(url, init) ?? json({ access_token: `tok-${++tokenCounter}-abcdefghij`, expires_in: 3600, token_type: "Bearer" });
    const ci = /\/codeinfo\/([^?]+)/.exec(url);
    if (ci) {
      if (overrides.codeinfo) return overrides.codeinfo(url, init);
      const code = decodeURIComponent(ci[1]!);
      codeForId.set(idFor(code), code);
      return json({ code, stemId: `http://id.who.int/icd/release/11/2026-01/mms/${idFor(code)}` });
    }
    const ent = /\/mms\/(\d+)/.exec(url);
    if (ent) {
      if (overrides.entity) return overrides.entity(url, init);
      const lang = new Headers(init?.headers).get("accept-language") ?? "en";
      return json(entity(ent[1]!, codeForId.get(ent[1]!) ?? "6B00", lang));
    }
    return json({ error: "unexpected" }, 500);
  };
}

beforeEach(() => {
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true"); // 42 CFR Part 2 owner switch; default (off) is tested in hardening.test.ts
  __resetCoreForTests();
  __resetIcd11ForTests();
  configureIcd11RateLimit();
  phi.force = false;
  tokenCounter = 0;
  vi.stubEnv("WHO_ICD_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("WHO_ICD_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("WHO_ICD_API_BASE", "");
  vi.stubEnv("WHO_ICD_RELEASE", "");
  fetchMock = vi.fn(router());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: init ?? {}, headers: new Headers(init?.headers) }));
const apiCalls = () => calls().filter((c) => c.url !== TOKEN_URL);
const tokenCalls = () => calls().filter((c) => c.url === TOKEN_URL);
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/icd11", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("icd11: OAuth2 client credentials and outbound requests", () => {
  it("requests a token with exactly the client-credentials form fields", async () => {
    await icd11Lookup({ code: "6B00" });
    const [t] = tokenCalls();
    expect(t!.init.method).toBe("POST");
    expect(t!.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(String(t!.init.body)))).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "icdapi_access",
      grant_type: "client_credentials",
    });
  });

  it("calls codeinfo then the entity with only the code, the language and the bearer token", async () => {
    const r = await icd11Lookup({ code: " 6b00 " });
    const [codeinfo, ent] = apiCalls();
    const u = new URL(codeinfo!.url);
    expect(`${u.origin}${u.pathname}`).toBe(`${API}/codeinfo/6B00`);
    expect(Object.fromEntries(u.searchParams)).toEqual({ flexiblemode: "false", convertToTerminalCodes: "false" });
    expect(ent!.url).toBe(`${API}/1712535455`);
    for (const c of [codeinfo!, ent!]) {
      expect(c.init.method).toBe("GET");
      expect(c.init.body).toBeUndefined();
      expect(c.headers.get("authorization")).toBe("Bearer tok-1-abcdefghij");
      expect(c.headers.get("api-version")).toBe("v2");
      expect(c.headers.get("accept-language")).toBe("en");
    }
    expect(r).toEqual({
      code: "6B00",
      release: "2026-01",
      language: "en",
      found: true,
      title: "Title for 6B00",
      definition: "Placeholder definition & test text.",
      classKind: "category",
      inclusions: ["Included term"],
      exclusions: ["Excluded term A", "Excluded term B"],
      browserUrl: "https://icd.who.int/browse/2026-01/mms/en#1712535455",
      sud: false,
    });
  });

  it("the client secret and id are sent only to the token endpoint", async () => {
    await icd11Lookup({ code: "6B00", lang: "es" });
    for (const c of apiCalls()) {
      const everything = JSON.stringify({ url: c.url, headers: [...c.headers.entries()], body: c.init.body ?? null });
      expect(everything).not.toContain(CLIENT_SECRET);
      expect(everything).not.toContain(CLIENT_ID);
    }
    expect(tokenCalls()).toHaveLength(1);
  });

  it("Spanish sets Accept-Language: es and reports the returned language", async () => {
    const r = await icd11Lookup({ code: "6B00", lang: "es" });
    expect(apiCalls().every((c) => c.headers.get("accept-language") === "es")).toBe(true);
    expect(r.language).toBe("es");
    expect(r.browserUrl).toBe("https://icd.who.int/browse/2026-01/mms/es#1712535455");
  });

  it("caches the token until shortly before expiry", async () => {
    await icd11Lookup({ code: "6B00" });
    await icd11Lookup({ code: "6B01" });
    expect(tokenCalls()).toHaveLength(1);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 3600 * 1000); // past expires_in - 60 s
    await icd11Lookup({ code: "6B02" });
    expect(tokenCalls()).toHaveLength(2);
  });

  it("refreshes the token once on 401", async () => {
    let first = true;
    fetchMock.mockImplementation(
      router({
        codeinfo: (url) => {
          if (first) {
            first = false;
            return json({ message: "expired" }, 401);
          }
          return json({ code: "6B00", stemId: `http://id.who.int/icd/release/11/2026-01/mms/1712535455` });
        },
      }),
    );
    const r = await icd11Lookup({ code: "6B00" });
    expect(r.found).toBe(true);
    expect(tokenCalls()).toHaveLength(2);
    expect(apiCalls()[1]!.headers.get("authorization")).toBe("Bearer tok-2-abcdefghij");
  });
});

describe("icd11: free text, identifiers and long strings never leave the server", () => {
  const bad: unknown[] = [
    { code: "F41.1" }, // ICD-10-CM, not ICD-11
    { code: "generalised anxiety" },
    { code: "123-45-6789" },
    { code: "6B00", lang: "fr" },
    { code: "6B00", note: "John Smith" },
    { code: "6B00".repeat(50) },
    { term: "anxiety" },
    {},
  ];
  it.each(bad.map((b) => [JSON.stringify(b).slice(0, 60), b]))("rejects %s before any fetch (including the token)", async (_l, body) => {
    await expect(icd11Lookup(body as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assertNoPHI runs before fetch", async () => {
    phi.force = true;
    await expect(icd11Lookup({ code: "6B00" })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route 400 does not echo the input", async () => {
    const res = await post({ code: "Jane Doe" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("Jane");
    expect(body.fallbackUrl).toBeUndefined();
  });
});

describe("icd11: not configured -> NotConfigured + link-out fallback", () => {
  it("missing credentials throw NotConfigured before any fetch", async () => {
    vi.stubEnv("WHO_ICD_CLIENT_SECRET", "");
    expect(isIcd11Configured()).toBe(false);
    await expect(icd11Lookup({ code: "6B00" })).rejects.toBeInstanceOf(NotConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route answers 503 not-configured with the WHO browser fallback link", async () => {
    vi.stubEnv("WHO_ICD_CLIENT_ID", "");
    const res = await post({ code: "6B00", lang: "es" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "not-configured", fallbackUrl: "https://icd.who.int/browse/2026-01/mms/es" });
    expect(JSON.stringify(body)).not.toContain(CLIENT_SECRET);
  });

  it("rejected credentials (token 400 invalid_client) are treated as not configured", async () => {
    fetchMock.mockImplementation(router({ token: () => json({ error: "invalid_client" }, 400) }));
    await expect(icd11Lookup({ code: "6B00" })).rejects.toBeInstanceOf(NotConfigured);
    expect(apiCalls()).toHaveLength(0);
  });

  it("icd11BrowserLink validates the code and uses the current (or configured) release", () => {
    expect(icd11BrowserLink("6B00")).toBe("https://icd.who.int/browse/2026-01/mms/en");
    expect(() => icd11BrowserLink("John Smith")).toThrow(ZodError);
    vi.stubEnv("WHO_ICD_RELEASE", "2027-01");
    expect(icd11BrowserLink("6B00", "es")).toBe("https://icd.who.int/browse/2027-01/mms/es");
    vi.stubEnv("WHO_ICD_RELEASE", "../../evil");
    expect(icd11BrowserLink("6B00")).toBe("https://icd.who.int/browse/2026-01/mms/en");
  });

  it("local ICD-API container mode needs no token and never calls the token endpoint", async () => {
    vi.stubEnv("WHO_ICD_CLIENT_ID", "");
    vi.stubEnv("WHO_ICD_CLIENT_SECRET", "");
    vi.stubEnv("WHO_ICD_API_BASE", "http://localhost:8382/");
    expect(isIcd11Configured()).toBe(true);
    const r = await icd11Lookup({ code: "6B00" });
    expect(r.found).toBe(true);
    expect(tokenCalls()).toHaveLength(0);
    expect(apiCalls().map((c) => c.url)).toEqual([
      "http://localhost:8382/icd/release/11/2026-01/mms/codeinfo/6B00?flexiblemode=false&convertToTerminalCodes=false",
      "http://localhost:8382/icd/release/11/2026-01/mms/1712535455",
    ]);
    expect(apiCalls().every((c) => !c.headers.has("authorization"))).toBe(true);
  });
});

describe("icd11: response safety and normalisation", () => {
  it("never follows a host taken from stemId", async () => {
    fetchMock.mockImplementation(router({ codeinfo: () => json({ code: "6B00", stemId: "http://evil.example/icd/release/11/2026-01/mms/1712535455" }) }));
    await icd11Lookup({ code: "6B00" });
    expect(apiCalls().map((c) => new URL(c.url).host)).toEqual(["id.who.int", "id.who.int"]);
  });

  it("malformed stemId -> UpstreamError 502", async () => {
    fetchMock.mockImplementation(router({ codeinfo: () => json({ code: "6B00", stemId: "http://id.who.int/../../etc/passwd" }) }));
    await expect(icd11Lookup({ code: "6B00" })).rejects.toMatchObject({ name: "UpstreamError", status: 502 });
  });

  it("unknown code (codeinfo 404) -> found: false with the browser fallback, no entity call", async () => {
    fetchMock.mockImplementation(router({ codeinfo: () => json({}, 404) }));
    const r = await icd11Lookup({ code: "6Z99" });
    expect(r).toMatchObject({ found: false, browserUrl: "https://icd.who.int/browse/2026-01/mms/en", inclusions: [], exclusions: [] });
    expect(apiCalls()).toHaveLength(1);
  });

  it("an off-site browserUrl is replaced by the WHO browser deep link", async () => {
    fetchMock.mockImplementation(router({ entity: () => json(entity("1712535455", "6B00", "en", { browserUrl: "https://evil.example/x" })) }));
    expect((await icd11Lookup({ code: "6B00" })).browserUrl).toBe("https://icd.who.int/browse/2026-01/mms/en#1712535455");
  });

  it("flags ICD-11 substance-use codes (6C40-6C4H) for the Part 2 banner", async () => {
    expect(isSudIcd11("6C40.2")).toBe(true);
    expect(isSudIcd11("6C4H")).toBe(true);
    expect(isSudIcd11("6C50")).toBe(false); // gambling: addictive behaviour, not a substance
    expect((await icd11Lookup({ code: "6C40.2" })).sud).toBe(true);
  });
});

describe("icd11: upstream errors, caching, rate limiting, attribution", () => {
  it("API 500 -> UpstreamError -> route 502 with fallback link", async () => {
    fetchMock.mockImplementation(router({ codeinfo: () => json({}, 500) }));
    await expect(icd11Lookup({ code: "6B00" })).rejects.toBeInstanceOf(UpstreamError);
    const res = await post({ code: "6B01" });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, code: "upstream", fallbackUrl: "https://icd.who.int/browse/2026-01/mms/en" });
  });

  it("caches per code and language", async () => {
    await icd11Lookup({ code: "6B00" });
    await icd11Lookup({ code: "6B00", lang: "en" });
    expect(apiCalls()).toHaveLength(2);
    await icd11Lookup({ code: "6B00", lang: "es" });
    expect(apiCalls()).toHaveLength(4);
  });

  it("enforces the burst limit and answers 429 without calling upstream", async () => {
    await icd11Lookup({ code: "6B00" }); // 2 API calls
    await icd11Lookup({ code: "6B01" }); // 4
    await expect(icd11Lookup({ code: "6B02" })).rejects.toMatchObject({ status: 429 }); // codeinfo ok (5), entity refused
    expect(apiCalls()).toHaveLength(5);
    const res = await post({ code: "6B03" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "rate-limited" });
  });

  it("route returns data with WHO attribution and the CC BY-ND licence", async () => {
    const res = await post({ code: "6B00" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attribution).toBe(ICD11_ATTRIBUTION);
    expect(body.attribution).toMatch(/World Health Organization/);
    expect(body.attribution).toMatch(/CC BY-ND 3\.0 IGO/);
    expect(body.data.title).toBe("Title for 6B00");
  });
});
