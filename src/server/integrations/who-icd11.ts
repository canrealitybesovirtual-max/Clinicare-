import "server-only";
/**
 * WHO ICD-API v2 (ICD-11 MMS). Docs: https://icd.who.int/docs/icd-api/APIDoc-Version2/  Register: https://icd.who.int/icdapi
 * - Outbound: ONLY an ICD-11 MMS code and a language (en|es) (G5, G17).
 * - Auth: OAuth2 client credentials (scope icdapi_access) at icdaccessmanagement.who.int. The client id/secret
 *   come only from server env (WHO_ICD_CLIENT_ID, WHO_ICD_CLIENT_SECRET) and are sent only to the token
 *   endpoint; the bearer token is cached in memory until shortly before it expires.
 * - Offline / self-hosted: set WHO_ICD_API_BASE to a local ICD-API container (no token needed).
 * - Content licence: ICD-11 is CC BY-ND 3.0 IGO. Text is shown unmodified (markup stripped only), with attribution.
 * - Missing credentials => NotConfigured; the UI shows icd11BrowserLink(code) instead.
 */
import { z } from "zod";
import { Icd11Code, assertNoPHI } from "@/lib/outbound";
import { NotConfigured, UpstreamError, setRateLimit, upstreamFetch } from "@/server/core";
import { clip, htmlToPlainText, safeHttpsUrl } from "./plain-text";

export const ICD11_UPSTREAM = "who-icd11";
export const ICD11_TOKEN_UPSTREAM = "who-icd11-token";
export const ICD11_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token";
export const ICD11_PUBLIC_API_BASE = "https://id.who.int";
/** Current ICD-11 MMS release (WHO 2026 release, published 16 Feb 2026). Override with WHO_ICD_RELEASE. */
export const ICD11_DEFAULT_RELEASE = "2026-01";
export const ICD11_ATTRIBUTION = "ICD-11 content: World Health Organization (WHO) ICD-API, licensed under CC BY-ND 3.0 IGO";
export const ICD11_SOURCE = "https://icd.who.int/";
export const ICD11_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function configureIcd11RateLimit() {
  // WHO publishes no per-client limit; stay gentle. Tokens last ~1 h, so the token endpoint needs very few calls.
  setRateLimit(ICD11_UPSTREAM, 2, 5);
  setRateLimit(ICD11_TOKEN_UPSTREAM, 0.1, 2);
}
configureIcd11RateLimit();

export const Icd11Lang = z.enum(["en", "es"]);
export type Icd11Lang = z.infer<typeof Icd11Lang>;
export const Icd11Input = z.strictObject({ code: Icd11Code, lang: Icd11Lang.default("en") });
export type Icd11Input = z.input<typeof Icd11Input>;

export interface Icd11Result {
  code: string;
  release: string;
  language: Icd11Lang; // language actually returned for the title (WHO falls back to English if untranslated)
  found: boolean;
  title?: string;
  definition?: string;
  classKind?: string;
  inclusions: string[];
  exclusions: string[];
  browserUrl: string; // deep link in the WHO ICD-11 browser (or the release root when unknown)
  sud: boolean; // 6C40-6C4H disorders due to substance use => show the Part 2 banner (G6)
}

/** ICD-11 MMS "Disorders due to substance use" (6C40-6C4H). Addictive behaviours (6C50/6C51) are not substances. */
export function isSudIcd11(code: string): boolean {
  return /^6C4[0-9A-H]/i.test(code);
}

/* ---------------- configuration ---------------- */
interface Icd11Config {
  base: string;
  release: string;
  local: boolean;
  clientId?: string;
  clientSecret?: string;
}

function releaseFromEnv(): string {
  const r = process.env.WHO_ICD_RELEASE?.trim();
  return r && /^\d{4}-\d{2}$/.test(r) ? r : ICD11_DEFAULT_RELEASE;
}

function readConfig(): Icd11Config {
  const release = releaseFromEnv();
  const rawBase = process.env.WHO_ICD_API_BASE?.trim();
  let base = ICD11_PUBLIC_API_BASE;
  if (rawBase) {
    try {
      const u = new URL(rawBase);
      if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) throw new Error("bad base");
      base = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
      throw new NotConfigured(ICD11_UPSTREAM);
    }
  }
  const local = base !== ICD11_PUBLIC_API_BASE;
  const clientId = process.env.WHO_ICD_CLIENT_ID?.trim() || undefined;
  const clientSecret = process.env.WHO_ICD_CLIENT_SECRET?.trim() || undefined;
  if (!local && (!clientId || !clientSecret)) throw new NotConfigured(ICD11_UPSTREAM);
  return { base, release, local, clientId, clientSecret };
}

/** True when this server can call the ICD-API (credentials present, or a local container configured). */
export function isIcd11Configured(): boolean {
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Fallback link-out when the API is not configured or unavailable: the WHO ICD-11 browser for the current
 * release. The code is validated but NOT put in the URL (the browser deep-links by entity id, which needs the API).
 */
export function icd11BrowserLink(code: string, lang: Icd11Lang = "en"): string {
  Icd11Code.parse(code);
  return `https://icd.who.int/browse/${releaseFromEnv()}/mms/${Icd11Lang.parse(lang)}`;
}

/* ---------------- OAuth2 token (memory only) ---------------- */
const TokenResponse = z.object({
  access_token: z.string().min(10).max(8192),
  expires_in: z.number().positive().optional(),
  token_type: z.string().optional(),
});
let token: { value: string; expires: number } | null = null;
let tokenInflight: Promise<string> | null = null;

/** Test helper: forget the cached token. */
export function __resetIcd11ForTests() {
  token = null;
  tokenInflight = null;
}

async function getToken(cfg: Icd11Config): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  if (!tokenInflight) {
    tokenInflight = (async () => {
      const body = new URLSearchParams({
        client_id: cfg.clientId!,
        client_secret: cfg.clientSecret!,
        scope: "icdapi_access",
        grant_type: "client_credentials",
      }).toString();
      let json: unknown;
      try {
        json = await upstreamFetch<unknown>(ICD11_TOKEN_URL, {
          upstream: ICD11_TOKEN_UPSTREAM,
          method: "POST",
          body,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          ttlMs: 0, // never cache: the request body holds the client secret
        });
      } catch (e) {
        // Rejected credentials are a configuration problem: show the link-out fallback.
        if (e instanceof UpstreamError && (e.status === 400 || e.status === 401)) throw new NotConfigured(ICD11_UPSTREAM);
        throw e;
      }
      const parsed = TokenResponse.safeParse(json);
      if (!parsed.success) throw new UpstreamError(ICD11_TOKEN_UPSTREAM, 502, "Unexpected response from upstream service");
      const lifetimeS = parsed.data.expires_in ?? 3600;
      token = { value: parsed.data.access_token, expires: Date.now() + Math.max(0, lifetimeS - 60) * 1000 };
      return token.value;
    })().finally(() => {
      tokenInflight = null;
    });
  }
  return tokenInflight;
}

async function apiGet(cfg: Icd11Config, url: string, lang: Icd11Lang): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json", "API-Version": "v2", "Accept-Language": lang };
  const call = async () => {
    if (!cfg.local) headers.Authorization = `Bearer ${await getToken(cfg)}`;
    // Cache key never includes the token; language is part of it because titles/definitions depend on it.
    return upstreamFetch<unknown>(url, { upstream: ICD11_UPSTREAM, headers, ttlMs: ICD11_TTL_MS, cacheKey: `${lang}|${url}` });
  };
  try {
    return await call();
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 401 && !cfg.local) {
      token = null; // expired or revoked: refresh once
      return call();
    }
    throw e;
  }
}

/* ---------------- response handling ---------------- */
const LangString = z.object({ "@language": z.string().optional(), "@value": z.string() });
const Labelled = z.array(z.object({ label: LangString.optional() }).loose());
const CodeInfo = z.object({ code: z.string().optional(), stemId: z.string() });
const Entity = z.object({
  code: z.string().optional(),
  title: LangString.optional(),
  definition: LangString.optional(),
  classKind: z.string().optional(),
  browserUrl: z.string().optional(),
  inclusion: Labelled.optional(),
  exclusion: Labelled.optional(),
});
const STEM_RE = /\/icd\/release\/11\/(\d{4}-\d{2})\/mms\/(\d{1,12})(\/(?:unspecified|other))?$/;

const text = (s: string | undefined, max: number) => (s ? clip(htmlToPlainText(s), max) : undefined);
const labels = (list: z.infer<typeof Labelled> | undefined) =>
  [...new Set((list ?? []).map((x) => text(x.label?.["@value"], 200)).filter((s): s is string => !!s))].slice(0, 12);

export function icd11CodeInfoUrl(base: string, release: string, code: string): string {
  const params = new URLSearchParams({ flexiblemode: "false", convertToTerminalCodes: "false" });
  return `${base}/icd/release/11/${release}/mms/codeinfo/${encodeURIComponent(code)}?${params}`;
}

/** ICD-11 MMS title, definition and inclusions/exclusions for one code. Throws ZodError/OutboundRejected before any fetch. */
export async function icd11Lookup(raw: Icd11Input): Promise<Icd11Result> {
  const input = Icd11Input.parse(raw);
  assertNoPHI(input.code, input.lang);
  const cfg = readConfig();
  const fallback = `https://icd.who.int/browse/${cfg.release}/mms/${input.lang}`;
  const base: Icd11Result = {
    code: input.code,
    release: cfg.release,
    language: input.lang,
    found: false,
    inclusions: [],
    exclusions: [],
    browserUrl: fallback,
    sud: isSudIcd11(input.code),
  };

  let info: unknown;
  try {
    info = await apiGet(cfg, icd11CodeInfoUrl(cfg.base, cfg.release, input.code), input.lang);
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) return base; // no such code in this release
    throw e;
  }
  const ci = CodeInfo.safeParse(info);
  const stem = ci.success ? STEM_RE.exec(ci.data.stemId) : null;
  if (!stem) throw new UpstreamError(ICD11_UPSTREAM, 502, "Unexpected response from upstream service");

  // Rebuild the entity URL on OUR configured base: never follow a host taken from the response.
  const entityId = stem[2]!;
  const entityUrl = `${cfg.base}/icd/release/11/${cfg.release}/mms/${entityId}${stem[3] ?? ""}`;
  const entity = Entity.safeParse(await apiGet(cfg, entityUrl, input.lang));
  if (!entity.success) throw new UpstreamError(ICD11_UPSTREAM, 502, "Unexpected response from upstream service");
  const e = entity.data;
  const lang = e.title?.["@language"]?.slice(0, 2).toLowerCase();

  return {
    ...base,
    found: true,
    language: lang === "es" || lang === "en" ? lang : input.lang,
    title: text(e.title?.["@value"], 300),
    definition: text(e.definition?.["@value"], 3000),
    classKind: e.classKind ? clip(e.classKind, 40) : undefined,
    inclusions: labels(e.inclusion),
    exclusions: labels(e.exclusion),
    browserUrl:
      safeHttpsUrl(e.browserUrl, ["icd.who.int"]) ?? `https://icd.who.int/browse/${cfg.release}/mms/${input.lang}#${entityId}`,
  };
}
