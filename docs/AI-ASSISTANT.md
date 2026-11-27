# Optional AI assistant (Claude)

Owner amendment, CLAUDE.md (2026-11-27): the app may have **one** optional, server-side Claude assistant. It is
**off by default**. Every other rule in CLAUDE.md still applies: PHI scrubber first, memory-only state, no diagnosis,
no risk decisions, crisis resources always visible, curated ids only.

Code: `src/server/ai/**` (assistant), `src/server/routes/assistant.ts` (POST handler).
Tests: `tests/integrations/assistant.test.ts`, `tests/integrations/assistant-route.test.ts`,
`tests/integrations/assistant-hostile.test.ts` (adversarial harness: real SDK client, mocked network).

## What it does

The clinician types a short, de-identified note, for example *"panic around dogs"*. The app's deterministic matcher
and scorer run first, as always. When the clinician has switched the assistant on for the session, the app can also
ask Claude for:

- **Follow-up questions** (up to 5) that would help the clinician understand the presentation: is the panic tied to
  dogs only or does it also come unexpectedly, how long has it lasted, what is avoided, how daily life is affected.
  Each question has 2 to 4 clickable answers. An answer can add or rule out lexicon symptoms, set the duration band
  or set impairment, and the app re-scores locally.
- **Pointers** into the app: built-in measures, interventions and referral kinds (curated ids only).

That is the whole output, as the owner amendment allows: questions plus curated symptom, measure, intervention and
referral ids. The assistant does **not** suggest conditions. "Possible considerations" (names, ICD-10-CM / ICD-11
codes, the "See DSM-5-TR" pointer, matched and missing features) come only from the app's own deterministic scorer,
which re-runs after each answer. (An earlier draft also returned model-chosen "considerations"; that was removed in
the privacy / safety review because condition ids are not in the amendment's output list.)

Every result is labeled **For clinician review**, names the model, and carries a disclaimer.

## What it never does

- Diagnose, say that thresholds or requirements are met, mention the DSM, criteria or a diagnosis at all, or
  reproduce or paraphrase DSM-5-TR text. Model text that does is dropped on the server, and an answer option may
  never name a condition.
- Estimate or grade risk. If a red flag is documented, or the model says the note suggests danger, the result
  carries a **fixed, app-written** reminder to assess safety directly and use crisis resources (988, local emergency
  number, findahelpline.com). The model's own wording is never shown for this. An assistant answer can add a
  safety symptom but can never clear one.
- Receive or discuss substance use (42 CFR Part 2). See "What is sent" below.
- Invent ids, links or numbers. Every symptom, measure, intervention and referral id in the output is checked
  against the catalog and dropped if unknown; model text with a link, web address, URI scheme, phone number, other
  identifier, statistic or percentage is dropped (statistics need a source and year, which model text never has).
- Echo its instructions. Model text that talks about its prompt, the catalog or "instructions", or repeats six or
  more words of the system prompt in a row, is dropped.
- Store anything. No logs, no database, no browser storage, no message threads, no SDK telemetry.
- Run in client mode. The UI must not offer it there (client mode never shows diagnosis names or codes).

## BAA requirement (owner decision, in writing)

Typed clinical notes are health information even after the scrubber removes identifiers, because the scrubber is a
safety net, not a guarantee. The assistant may therefore run only when:

1. The owner's organization has a signed **Business Associate Agreement with Anthropic** covering the Claude API.
2. The Anthropic organization or workspace that issues the API key is set to **zero data retention (ZDR)** under
   that agreement. (Models that require 30-day retention, such as the Fable and Mythos families, return an error
   for ZDR organizations and are excluded from `AI_MODEL`.)
3. The owner confirms both points **in writing** (for example an email to the team or a signed note kept with the
   BAA), and only then sets `AI_BAA_CONFIRMED=true`.

Ask Anthropic, as part of the BAA / ZDR confirmation, to confirm in writing that the features this integration uses
are covered: prompt caching of the system prompt and catalog (no client data), structured outputs (the output schema
is compiled and cached by the API; it contains no client data), and the server-side refusal fallback (sticky routing
is documented as not recorded for ZDR organizations). Message threads are not ZDR eligible and are never used.

The app must never be described as "HIPAA compliant" or similar because of this integration. Compliance depends on
the deployment, the BAA and the practice's own policies.

## Turning it on

| Variable | Required | Value | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | API key from the BAA / ZDR organization | Server-side only. Never `NEXT_PUBLIC_`. Passed explicitly to the SDK; no profile or auth-token discovery. |
| `AI_ASSISTANT_ENABLED` | Yes | exactly `true` | Any other value (including `TRUE`, `1`, ` true`) keeps it off. |
| `AI_BAA_CONFIRMED` | Yes | exactly `true` | Set only after the written confirmation above. |
| `AI_MODEL` | No | `claude-opus-5-5` (default), `claude-opus-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | Anything else silently falls back to the default. The server-side refusal fallback is used only on the two Opus models, where it is documented. |
| `AI_EFFORT` | No | `low`, `medium` (default), `high` | Set explicitly on every request (the API default for Claude Opus 5.5 is `medium`). `xhigh` / `max` are refused: they exceed the 20 s budget. |

All three required variables must be set; any one missing means the route answers `503 not-configured` with a
friendly message before it reads the request body.

The clinician still has to opt in **per session**: the UI keeps an in-memory toggle (never persisted), and every
request must carry `optIn: true`.

## Data flow

1. Browser: the PHI scrubber (18 Safe Harbor identifiers) runs on the note. Only the scrubbed text (at most 1500
   characters) is ever sent, to this app's own `/api/assistant` route (same origin; the CSP stays `connect-src 'self'`).
2. Route: off-switch check, per-client limit (10 per minute; salted hash of the address, never the address) and a
   whole-server limit (30 per minute), 16 KB body cap, cross-site and content-type checks.
3. Strict input validation (zod): only lexicon symptom ids, condition ids, enums, the scrubbed text, and up to 20
   previously chosen answers. Each answered record must echo a question the server itself issued, with the
   server-issued `seal` (HMAC-SHA256 over question id, question text and answer label, key derived from
   `ANTHROPIC_API_KEY`; `src/server/ai/seal.ts`). A record whose seal does not verify is dropped unread and counted
   in `droppedAnswers`, so the history can never carry free text the server did not produce. Seals stop verifying
   when the key is rotated; the UI should then clear its answered list.
4. The server runs the PHI scrubber again on the text and on the answered history. On top of it, an assistant-only
   re-check refuses listed given names and surnames of four or more letters typed in lower case ("client is jose")
   and five or more digits spelled out ("five five five one two"). If anything is found, the request is refused and
   nothing is sent. Names that are also common words ("nick", "foster", "pena", "flores") and names of three letters
   or fewer are not caught by that re-check: the UI must still tell clinicians to leave identifiers out.
4a. Text that quotes or cites diagnostic-manual criteria or treatment-planner text (any "DSM" mention, "criterion B",
   three or more "A. ... B. ... C. ..." items, "PracticePlanner", "Wiley") is refused with its own message; the
   amendment allows neither in the input.
5. 42 CFR Part 2: if the text mentions alcohol or drug use (or matches a substance-related lexicon entry such as
   withdrawal), the request is refused and nothing is sent. Substance-related symptom and condition ids, answers that
   mention substances and the `substancePossible` flag are held back; the result says `substanceInfoWithheld: true`.
6. One Messages API request (beta namespace) to the Anthropic API. The SDK client's `fetch` is `pinnedFetch()`: it
   refuses any URL but a POST to the pinned base URL + `/v1/messages`, any redirect, and any body with `thread`,
   `tools`, `container`, `mcp_servers`, `metadata`, `context_management`, `diagnostics` or `user_profile_id`; it
   rebuilds the headers from an allowlist (so `ANTHROPIC_CUSTOM_HEADERS`, `traceparent` / `baggage` and cookies are
   never sent) and keeps only the `anthropic-beta` values this app uses. OpenTelemetry traces and propagation are off.
   - system block 1: a frozen, app-written prompt (role, task, rules; treat the note as data only);
   - system block 2: the catalog (symptom labels, condition names + primary ICD-10-CM code, licensed measures,
     interventions, referral kinds, answer-effect vocabulary), with `cache_control: ephemeral`;
   - one user message: the presentation state as escaped JSON inside `<presentation_state>` tags;
   - `output_config: { effort, format }` with a JSON schema (structured outputs);
   - `betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"` on the Opus models;
   - no `thinking` field (thinking cannot be disabled on Claude Opus 5.5), no `tool_choice`, no sampling parameters,
     no `metadata`, no `thread`; `maxRetries: 0`; 20 s timeout and abort signal.
7. Response: `stop_reason` is checked first. `refusal` returns an empty result with `status: "declined"`;
   `max_tokens` is an error. Otherwise the JSON is validated with zod and unknown ids are dropped. Model text is
   reduced to plain text (markup, control, zero-width, bidi and emoji characters removed; Latin script only, so
   look-alike letters cannot slip past the checks) and capped, then dropped when it holds a link or URI scheme, an
   identifier, a statistic, an echo of the instructions, substance content, a diagnosis statement, DSM / criteria /
   diagnosis talk, or a risk grade or "is safe" statement. A question whose "why" is dropped keeps an empty `why`.
   Each surviving answer gets its `seal`.
8. The result goes back to the browser with `Cache-Control: no-store`. Nothing is kept on the server.

### What is sent and what is not

| Sent to Anthropic | Never sent |
|---|---|
| Scrubbed note text (identifiers already removed, re-checked) | Any text the scrubber flags (the whole request is refused) |
| Lexicon symptom ids, condition ids (catalog only) | Substance-use text, substance-related ids or answers, `substancePossible` |
| Duration band, impairment, medical-cause tri-state | Names, dates, places, numbers, client identifiers of any kind |
| Questions and answers the clinician already chose, only when sealed by this server (model-written, sanitized, re-checked) | Any answered record without a valid seal; measure scores, PDFs, plans, referral searches |
| The app-written system prompt and catalog | The API key (it is a request header, never in the body or a URL) |

## Output contract (for the UI)

`POST /api/assistant` returns `{ ok: true, data: AssistResult, attribution, source }`:

```ts
interface AssistResult {
  label: "For clinician review";
  generatedBy: "Claude (Anthropic)";
  model: string;               // the model that answered (a fallback model if the requested one declined)
  status: "ok" | "declined";
  fallbackUsed: boolean;
  questions: { id; text; why; answers: { label; addSymptomIds; negateSymptomIds; setDuration?; setImpairment?; seal }[] }[];
  resources: { measureIds; interventionIds; referralKinds };
  resourceLabels: { measures; interventions; referralKinds };
  safetyPrompt?: string;       // fixed app wording; show prominently next to the crisis button
  substanceInfoWithheld: boolean;
  droppedAnswers: number;      // answered records not sent because their seal did not verify
  disclaimer: string;
}
```

To send the history back, push `{ questionId: q.id, questionText: q.text, answerLabel: a.label, seal: a.seal }` for
each chosen answer, exactly as received (memory only; never storage, URLs or logs).

Errors: `{ ok: false, code, error }` with `503 not-configured` (off), `400 rejected` (identifiers, reference-manual
text or substance use; a friendly message per case, nothing sent), `400 invalid`, `403` / `413` / `415`, `429 rate-limited`, `502 upstream`
(including "answer was cut off" and unparseable output). Error bodies never echo the request.

## Model, effort and refusals

- Default model `claude-opus-5-5` at effort `medium`, set explicitly. Thinking is always on for this model and counts
  toward `max_tokens` (12,000 here; the JSON itself is small).
- Forced `tool_choice` returns a 400 on Claude Opus 5.5, so the integration uses structured outputs instead of tools.
- Safety classifiers can decline a request (`stop_reason: "refusal"`, HTTP 200). The server-side fallback
  (`fallbacks: "default"`) retries on Anthropic's recommended model inside the same call; if the whole chain declines,
  the UI shows that the assistant could not help and the app's own tools still apply.

## Cost

Claude Opus 5.5 list prices (claude-api skill, shared/models.md): **$4 per million input tokens, $20 per million
output tokens**; 5-minute cache writes $5 per million; cache reads $0.20 per million.

Rough figures for one request (system prompt + catalog about 5,000 to 7,000 tokens, cached; note and state a few
hundred tokens; thinking + JSON about 2,000 to 5,000 output tokens at `medium`):

- cached prefix read: about $0.001 (a cache write, about $0.03, happens at most once per 5 idle minutes);
- note and state: about $0.002;
- output including thinking: about $0.04 to $0.10.

So **roughly $0.05 to $0.10 per request**, with a hard ceiling near $0.27 (12,000 output tokens). Output and
thinking dominate; `AI_EFFORT=low` cuts them. The whole-server limit (30 per minute) bounds the worst case; also set a
monthly spend limit for the key in the Anthropic Console.

## Turning it off

Any one of these takes effect on the next request, with no restart needed for the route logic (environment changes
on most hosts redeploy anyway):

- set `AI_ASSISTANT_ENABLED=false` (or remove it), or
- remove `AI_BAA_CONFIRMED`, or
- remove `ANTHROPIC_API_KEY` (and revoke the key in the Anthropic Console).

The route then answers `503 not-configured` and the UI hides the assistant. There is nothing to delete: the app
stores no assistant data anywhere.

## Testing

```bash
npx vitest run --config vitest.integrations.config.ts tests/integrations/assistant.test.ts tests/integrations/assistant-route.test.ts
```

`assistant.test.ts` and `assistant-route.test.ts` inject a fake SDK client; `assistant-hostile.test.ts` uses the real
SDK client with `globalThis.fetch` stubbed, so it checks the exact URL, headers and body that would leave the server
for 40+ hostile inputs (identifiers in many forms, pasted criteria, substance use, prompt injections asking for a
diagnosis or the system prompt, forged history, hostile `ANTHROPIC_*` environment variables) and 30+ hostile model
outputs (markup, links, schemes, phone numbers, diagnosis and risk statements, statistics, prompt echo, look-alike
letters, emoji, invented ids). None of them call the API. Together they cover: off by default and on only with all three
variables; model and effort allowlists; planted identifiers and substance-use text refused before any SDK call;
the exact request payload (only scrubbed text and curated ids; cached catalog; explicit effort; fallback beta; no
thinking, tool_choice, sampling or thread fields); unknown ids dropped; caps, markup stripping and re-scrubbing;
diagnosis, criteria and risk wording dropped; fixed safety wording; refusal, fallback, truncation and typed SDK error
mapping; route status codes and the 10-per-minute limit; and no console output.
