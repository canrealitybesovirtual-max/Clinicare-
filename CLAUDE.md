# Clinician Resource Companion - project rules
Resource tool for LICENSED clinicians. Not a diagnostic device. Not a substitute for judgment.
If any task conflicts with these rules: STOP and ask the owner.

NEVER
- Reproduce, closely paraphrase, or AI-generate DSM-5-TR criteria text (APA copyright).
- Copy Wiley PracticePlanners wording.
- Show diagnosis names/codes/scores in client mode, or state a final diagnosis anywhere.
- List homeopathy.
- Add fields for client identifiers; persist clinical text (no localStorage/cookies/logs/analytics).
- Store or transmit substance-use information (42 CFR Part 2).
- Build in a measure whose license is not confirmed in /content/licenses.json.
- Scrape or re-host third-party worksheets (TherapistAid, CCI, etc.) - link out only.
- Hide crisis info or auto-decide risk.
- Ship content missing sources[], license, lastVerified.
- Call any AI/LLM API (Phases 1-3).
- Send typed clinical text to ANY external API, or put API secrets in browser code.
- Write "HIPAA certified".

ALWAYS
- Original clinical wording + ICD-10-CM/ICD-11 codes + "See DSM-5-TR" pointer.
- "For clinician review" label + matched/missing features on every suggestion.
- PHI scrubber (18 Safe Harbor identifiers) before any processing; memory-only state.
- Crisis button (988, local emergency, findahelpline.com) on every screen.
- Part 2 notice on SUD exports. Disclaimer footer on every screen and PDF.
- Adult-only scope in Phase 1. Stats show source + year.
- External calls carry only codes, curated keywords, drug names, or ZIP/city (docs/RESOURCES.md).
- Respect API terms: attribution, rate limits, caching. Secrets in server-side route handlers only.
- Tests: scoring, measures, PHI-leak, accessibility (axe). Run them before saying done.

OWNER AMENDMENT (2026-11-27) to "Call any AI/LLM API" and G16/G17 — approved by the owner in session:
- Allowed: ONE optional server-side Claude assistant (src/server/ai/**) for follow-up questions and navigation help.
- OFF by default. Runs only when ALL are set server-side: ANTHROPIC_API_KEY, AI_ASSISTANT_ENABLED=true,
  AI_BAA_CONFIRMED=true (set only after a signed BAA with Anthropic). Clinician must opt in per session.
- Input = PHI-scrubbed text re-checked server-side + curated ids only. Never DSM-5-TR or Wiley text. No logging/storage.
- Output = structured, labeled "For clinician review", limited to curated ids (symptoms, measures, interventions,
  referrals) + follow-up questions. Never a diagnosis, never a risk decision. Never in client mode.
- Everything else in NEVER/ALWAYS still applies. Scanner exceptions for this need `guardrail-ok: G16 owner amendment`.

OWNER DECISION (2026-11-27) on substance-use reference lookups — approved by the owner in session:
- ALLOW_SUD_REFERENCE_LOOKUPS=true lets curated SUD codes, curated keywords and drug names (never typed text,
  never anything about a specific client) reach the allowlisted reference APIs. No client substance-use info is
  stored or transmitted. Part 2 notice wording: "42 CFR Part 2 prohibits unauthorized use or disclosure of these records."

KEY FILES
- docs/SPEC.md (full spec)  docs/RESOURCES.md (APIs)  docs/ROADMAP.md (phases)
- content/licenses.json (measure licenses)  scripts/guardrail-scan.sh (runs after every edit)
