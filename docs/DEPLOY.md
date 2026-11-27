# Deploying on Render

Phase 1 is a stateless Next.js app: no database, no secrets, no client data on the server.
All clinical text lives in browser memory only; the production Content-Security-Policy
(`connect-src 'self'`) blocks the browser from contacting any third-party host.

## One-time setup
1. Push this repo to GitHub (branch `main`, or the working branch for previews).
2. In Render: **New > Blueprint**, pick the repo. Render reads `render.yaml` and creates the
   `clinician-resource-companion` web service (Node 22, `npm ci && npm run build`, `npm start`).
3. Free plan sleeps after inactivity (first load can take ~1 minute). Use Starter or higher for clinical use.

## Before Phase 2+ (server-side API calls)
- API secrets (WHO ICD-API, HRSA, FindTreatment.gov) go in Render **Environment** settings and are
  read only in server route handlers. Never prefix them with `NEXT_PUBLIC_` (G17).
- Route handlers forward only codes, curated keywords, drug names or ZIP/city (docs/RESOURCES.md).

## Before Phase 4 (accounts / any stored account data)
- Use a Render workspace that supports HIPAA workloads and sign Render's BAA. Confirm current
  plan requirements and BAA terms with Render in writing before storing any account data.
- Attorney sign-off and security review per docs/ROADMAP.md.

## Checks that run on every push (GitHub Actions)
Guardrail scan, content validation, typecheck, unit tests, build, Playwright PHI-leak + axe + flow tests.

### E2E upstream fixtures (tests only, never in a deployment)
The Playwright suite must not depend on, or spend quota at, any real API. `playwright.config.ts` therefore starts
its own `next start` with `E2E_UPSTREAM_FIXTURES=1` (plus placeholder credentials that only switch the adapters to
"configured"). In that mode `upstreamFetch` in `src/server/core.ts` answers from `tests/fixtures/upstream/<upstream>.json`
instead of the network:
- **Cannot be turned on in a deployment.** Fixture mode is compiled in only when the build itself ran with
  `E2E_UPSTREAM_FIXTURES=1` (`next.config.ts` inlines `CRC_FIXTURE_BUILD`), so a normal production build ignores a
  stray runtime variable. It is also ignored whenever a hosting-platform marker is present (`RENDER`, `VERCEL`,
  `NETLIFY`, Cloud Run's `K_SERVICE` and others in `HOSTING_PLATFORM_MARKERS`). Do not set `E2E_UPSTREAM_FIXTURES`
  in Render anyway.
- With fixtures on, no request reaches the network: a request no fixture matches fails with 502. The upstream token
  bucket is skipped; every route-level check (body size, PHI scrub, Part 2 switch, per-client limit) still runs.
- Fixture files are fictional data in each upstream's real response shape (placeholder NPIs, PMIDs and trial ids;
  no WHO, FDA or NLM text). Entries can match on path, query parameters or body and answer with an error status
  (for example ZIP `99950` gives NPPES 429, to test the retry button) or `"notConfigured": true`.
- Rebuild them after adding conditions or medications: `node tests/fixtures/upstream/build-fixtures.mjs`.
  `tests/integrations/upstream-fixtures.test.ts` checks the switch, the hosting guard and that every curated
  code and medication gets an answer through the real adapters.
- `E2E_NO_BUILD=1 npx playwright test` reuses an existing `next build` instead of building again.

## Environment variables

All of these are read only in server code (`src/server/**`) and are set in Render **Environment** settings
(or `.env.local` for local development). None may ever carry a `NEXT_PUBLIC_` prefix: that ships the value to the
browser (G17). Leaving a value empty keeps that integration off. The route then answers
`503 {"code":"not-configured"}` and the UI shows the official link-out instead (most routes also return a `fallbackUrl`).

Template for `.env.example` / `.env.local` (no values):

```bash
# 42 CFR Part 2 owner switch. "true" only after the owner confirms in writing (see "Owner decisions" below).
ALLOW_SUD_REFERENCE_LOOKUPS=
# WHO ICD-API (ICD-11): required for id.who.int
WHO_ICD_CLIENT_ID=
WHO_ICD_CLIENT_SECRET=
WHO_ICD_RELEASE=            # optional, YYYY-MM, default 2026-01
WHO_ICD_API_BASE=           # optional, self-hosted ICD-API container, e.g. http://localhost:8382 (http only for local/private hosts)
# HRSA data.HRSA.gov web token (health centers)
HRSA_API_KEY=
# SAMHSA FindTreatment.gov
FINDTREATMENT_ACCESS_APPROVED=   # "true" only after SAMHSA approves this deployment
FINDTREATMENT_API_HOST=          # optional, only findtreatment.gov or a samhsa.gov host
# NCBI E-utilities (PubMed), optional
NCBI_API_KEY=
NCBI_EMAIL=                 # operator contact only, never a clinician or client address
# openFDA, optional
OPENFDA_API_KEY=
# WHO GHO mirror, optional (https on ghoapi.azureedge.net or *.who.int only)
WHO_GHO_API_BASE=
```

| Variable | Needed for | Required? | Where it goes | If missing or invalid |
|---|---|---|---|---|
| `ALLOW_SUD_REFERENCE_LOOKUPS` | Substance-use reference lookups (see below) | Owner decision | Not sent anywhere | SUD lookups are refused before any request; link-outs shown |
| `WHO_ICD_CLIENT_ID`, `WHO_ICD_CLIENT_SECRET` | `/api/icd11` | Yes, for id.who.int | Token endpoint only (`icdaccessmanagement.who.int`), in the POST body | 503 + WHO browser `fallbackUrl`. Rejected credentials count as not configured |
| `WHO_ICD_RELEASE` | `/api/icd11` | No | URL path | Default `2026-01` |
| `WHO_ICD_API_BASE` | `/api/icd11` (offline container) | No | Base URL | Must be https, or http on localhost / a private network; else not configured |
| `HRSA_API_KEY` | `/api/health-centers` | Yes | `Token` field of the POST body to data.hrsa.gov. Never in a URL or cache key | 503; UI shows Find a Health Center |
| `FINDTREATMENT_ACCESS_APPROVED` | `/api/treatment-facilities` | Yes (`true`) | Not sent | 503; UI shows findtreatment.gov + SAMHSA helpline |
| `FINDTREATMENT_API_HOST` | `/api/treatment-facilities` | No | Host name | Anything but findtreatment.gov / samhsa.gov (or a subdomain) is not configured |
| `NCBI_API_KEY` | `/api/pubmed` | No | `api_key` query parameter (NCBI accepts no header). Kept out of cache keys | Keyless: 3 requests/second |
| `NCBI_EMAIL` | `/api/pubmed` | No | `email` query parameter | Not sent |
| `OPENFDA_API_KEY` | `/api/drug-label` | No | `X-Api-Key` header only | Keyless: 950/day. A key openFDA rejects turns the lookup off (DailyMed link-out) |
| `WHO_GHO_API_BASE` | `/api/gho` | No | Base URL | Default `https://ghoapi.azureedge.net/api` |

No variables are needed for NLM Clinical Tables (ICD-10-CM), MedlinePlus Connect, MedlinePlus Health Topics,
RxNav, the CMS NPI Registry or ClinicalTrials.gov. ZIP and city lookups use bundled tables
(`content/referrals/zcta-centroids.json`, `content/referrals/us-places.json`), so no geocoding service is called.

### Registration the owner must do
1. **WHO ICD-API (ICD-11).** Register free at https://icd.who.int/icdapi, sign in, accept the terms, open
   "View API access key(s)" and copy the client id and secret into `WHO_ICD_CLIENT_ID` / `WHO_ICD_CLIENT_SECRET`.
   Offline alternative: run WHO's ICD-API container and set `WHO_ICD_API_BASE`. Then run the smoke check for
   ICD-11 (the success path has not been run live yet). ICD-11 content is CC BY-ND 3.0 IGO: confirm that showing
   unmodified excerpts (markup stripped, definitions clipped at 3,000 characters) with WHO attribution is acceptable.
2. **HRSA.** Register at https://data.hrsa.gov/tools/web-services/registration with the **production domain**
   (one domain per registration). Put the emailed web token in `HRSA_API_KEY`.
3. **FindTreatment.gov (SAMHSA).** The developer guide (https://findtreatment.gov/assets/FindTreatment-Developer-Guide.pdf)
   is written for approved users and names no key. Email FindTreatment@samhsa.hhs.gov describing the app and its
   traffic, ask for approval and any caching or rate terms, then set `FINDTREATMENT_ACCESS_APPROVED=true`
   (and `FINDTREATMENT_API_HOST` if SAMHSA assigns a host).
4. **NCBI (optional).** Create an API key in an NCBI account (Account settings > API Key Management). NCBI also
   asks heavy users to register the `tool` name (`clinician-resource-companion`) and a contact email.
5. **openFDA (optional).** Request a key at https://open.fda.gov/apis/authentication/.
6. **42 CFR Part 2 decision.** See "Owner decisions" below before setting `ALLOW_SUD_REFERENCE_LOOKUPS`.

## API terms

Every outbound request carries only a code, a curated keyword, a curated drug name, a ZIP, a canonical city name from
the bundled gazetteer, or a coarse point (0.01 degree) derived from them (docs/RESOURCES.md). Limits below are
enforced in `src/server/core.ts` before any request leaves. A token bucket smooths traffic. Where an API publishes a
hard "N per second/minute" limit, a sliding window also caps it, because a bucket alone allows its burst plus one
second of refill inside a single second. `tests/integrations/hardening.test.ts` checks every window.

| Upstream (route) | Published terms (as cited) | Our limit | Cache | Attribution shown |
|---|---|---|---|---|
| NLM Clinical Tables ICD-10-CM (`icd10cm`) | Free, "as is"; FAQ: at most 25 requests/second | 5/s, burst 10, hard cap 20 in any second | 7 days | "ICD-10-CM codes: NLM Clinical Table Search Service (provided as is)" |
| WHO ICD-API (`icd11`) | Free after registration; no published numeric limit; CC BY-ND 3.0 IGO | 2/s, burst 5; token endpoint 0.1/s | 7 days (keyed by language, never by token); token held in memory until 60 s before expiry; no token is requested for a cache hit | "ICD-11 content: World Health Organization (WHO) ICD-API, licensed under CC BY-ND 3.0 IGO" |
| MedlinePlus Connect (`medlineplus`) | 100 requests/minute per IP; NLM advises caching 12-24 h; no logo or implied endorsement | 1/s, burst 5, hard cap 90 per minute | 12 h | "Information from MedlinePlus.gov" |
| MedlinePlus Health Topics (`health-topics`) | 85 requests/minute per IP | 1/s, burst 5, hard cap 80 per minute | 12 h | "Information from MedlinePlus.gov" |
| RxNav RxNorm/RxClass (`rxnorm`) | Free; at most 20 requests/second per IP | 8/s, burst 8, hard cap 18 in any second (one lookup = 4 requests) | 7 days | NLM's required statement (courtesy of NLM; no endorsement) |
| openFDA drug label (`drug-label`) | 240 requests/minute; 1,000/day per IP keyless, 120,000/day per key | 3/s, burst 6, hard cap 230 per minute; daily counter stops at 950 (keyless) / 119,000 (key) | Normalised result 24 h; raw labels not cached | "Data from openFDA (U.S. FDA). Not for prescribing decisions..." |
| CMS NPPES NPI Registry (`providers`) | 200 results per request, skip at most 1,000; no published rate | Exactly 2 in any 1.1 s (project brief) | 24 h | "Data: CMS NPPES NPI Registry. Listing is not an endorsement..." |
| HRSA HDW (`health-centers`) | Free with registration (token, one domain); no published rate | 1/s, burst 2 | 24 h (keyed by query, never by token) | "Data: HRSA Data Warehouse (data.HRSA.gov)..." |
| SAMHSA FindTreatment.gov (`treatment-facilities`) | Approved users; no published rate; the service sends Cache-Control max-age=600 | 1/s, burst 2 | 6 h (lower it if SAMHSA asks) | "Data: SAMHSA FindTreatment.gov. Call to confirm..." |
| NCBI E-utilities (`pubmed`) | 3 requests/second per IP without a key, 10 with one; send `tool` and `email` | Exactly 3 (or 10) in any 1.1 s (one search = 2 requests) | 24 h (cache key never includes the key or email) | "Citations from PubMed, courtesy of the U.S. National Library of Medicine..." |
| ClinicalTrials.gov API v2 (`trials`) | Free; no official limit published (about 50/minute per IP is widely cited) | 0.75/s, burst 3, hard cap 45 per minute | 6 h | "Source: ClinicalTrials.gov (U.S. NLM). Listing does not imply endorsement." |
| WHO GHO OData (`gho`) | Public; no published limit; WHO announced a replacement API (no public URL yet) | 1/s, burst 3 | 12 h | "Source: WHO Global Health Observatory, <data year> data" |
| Bundled: Census ZCTA centre points | U.S. Government work (public domain) | No network | n/a | Credited in the file |
| Bundled: US place gazetteer (`us-places.json`) | GeoNames place data, CC BY 4.0 (via @bluehive/zipcodes, BSD-3-Clause) | No network | n/a | "Place data from GeoNames (geonames.org), CC BY 4.0", appended to the three referral attributions |

The Census TIGERweb geocoder is no longer called: cities are matched to the bundled gazetteer. That also stops
letters-only clinical text ("Opioid Withdrawal") from ever being sent as a "city".

**What the server also enforces (G5, G17):**
- Only `POST` with `Content-Type: application/json`, at most 2 KB (enforced while streaming). Cross-site browser
  requests (`Sec-Fetch-Site` other than same-origin) get 403.
- A per-client limit of 2 requests/second with a burst of 30. It is keyed by a salted, in-memory hash of the address
  the platform proxy saw, which is the last `X-Forwarded-For` entry. The address itself is never stored.
  If another proxy (for example a CDN) is put in front of Render, revisit this, or every user will share one key.
- Upstream redirects are never followed to another origin, and POSTs are never re-sent, so API keys, the HRSA
  token and the WHO client secret cannot leak through a `Location` header. Upstream bodies are capped while they
  stream (default 2 MB, after decompression), and timeouts cover the body as well as the headers.
- Upstream text is reduced to plain text, and anything tag-shaped is neutralised. The UI must still render it as
  text, never as HTML.

**Single-instance assumption.** Rate limits, the openFDA daily counter, the per-client limit and the cache live in
process memory. `render.yaml` runs one instance. If you scale out, the limits multiply by the instance count.
Before scaling, either divide the limits per instance or move them to a shared store (any shared store must hold
only upstream ids and counters, never request values).

**Monitoring and tracing (Sentry / OpenTelemetry, SPEC 11.2).** Next.js's patched `fetch` records the full
upstream URL as a span attribute (`http.url` / `url.full`). That URL can include the NCBI `api_key`, a ZIP or a
canonical city. Before adding any instrumentation, strip query strings from those attributes in `beforeSendSpan` /
`beforeSend` (or turn off fetch spans), keep `sendDefaultPii` off, and do not enable `logging.fetches` in
`next.config.ts`. The server code itself logs nothing.

### Owner decisions
- **42 CFR Part 2 and reference lookups: decided 2026-11-26 (allowed).** Curated SUD-related reference values with
  no client data may be sent: SUD ICD-10-CM codes (F10-F19, Z71.4x/5x) and ICD-11 codes (6C40-6C4H), the "alcohol"
  health topic and SUD ICD-10-CM terms, the alcohol-use-disorder PubMed strategy and trial condition,
  alcohol-use-disorder medications (naltrexone, acamprosate, disulfiram, topiramate, gabapentin), addiction-counselor
  NPPES searches, and FindTreatment.gov "substance-use" or "both" searches. Recorded in docs/RESOURCES.md;
  `ALLOW_SUD_REFERENCE_LOOKUPS=true` is set in render.yaml. The Part 2 banners and export notices apply either way.
- **Part 2 notice wording: decided 2026-11-26.** The app prints the current 42 CFR 2.32(a)(2) short notice,
  "42 CFR Part 2 prohibits unauthorized use or disclosure of these records." (`src/lib/referral-links.ts`).

### Still open
- **Terms not re-read live.** The terms pages of NLM (Clinical Tables FAQ, RxNav ToS, MedlinePlus), NCBI, openFDA,
  WHO and SAMHSA were blocked from the build sandbox. The figures above come from those publishers' published terms
  as cited in each adapter. Re-check them (`/verify-sources`) before launch, and confirm WHO's terms of reuse for
  showing GHO values and ICD-11 excerpts.
