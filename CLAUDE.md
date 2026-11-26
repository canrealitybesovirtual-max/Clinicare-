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

KEY FILES
- docs/SPEC.md (full spec)  docs/RESOURCES.md (APIs)  docs/ROADMAP.md (phases)
- content/licenses.json (measure licenses)  scripts/guardrail-scan.sh (runs after every edit)
