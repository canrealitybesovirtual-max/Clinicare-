# Clinician Resource Companion

A resource tool for licensed mental-health clinicians that goes from symptoms to possible diagnoses (for clinician review), then measures, a treatment plan, in-session interventions, client handouts and referrals. It never stores client information.

> Resource only. Not a substitute for clinical judgment. Not a medical device.

## Start building in Claude Code
1. Open this repo in Claude Code (claude.ai/code → pick this repo, or `git clone` then run `claude` in the folder).
2. Paste the prompt from **KICKOFF_PROMPT.md**.
3. Claude Code reads **CLAUDE.md** automatically every session. Those are the hard rules.

## What's in this kit
| Path | Purpose |
|---|---|
| CLAUDE.md | Project rules (guardrails G1–G17) Claude Code follows every session |
| KICKOFF_PROMPT.md | First prompt to paste (builds Phase 1 only) |
| docs/SPEC.md, docs/spec.pdf | Full specification, including your original request word for word |
| docs/RESOURCES.md | Online APIs and data sources: what each one is for, its terms and its privacy rule |
| docs/ROADMAP.md | Phase checklists plus the owner actions Claude Code can't do |
| content/licenses.json | Which measures and content may be built in (confirmed) and which can only be linked to |
| content/integrations.json | Machine-readable API catalog |
| content/crisis-lines.json | Crisis numbers by country (verify before release) |
| scripts/guardrail-scan.sh | Blocks storage of clinical text, identifier fields, AI calls, exposed secrets, homeopathy, "HIPAA certified" claims and trackers |
| .claude/settings.json | Runs the guardrail scan after every edit; blocks reading .env files |
| .claude/agents/ | compliance-auditor, clinical-content-writer, source-verifier |
| .claude/commands/ | /guardrail-check, /add-condition, /verify-sources, /phase-status |
| .mcp.json | Context7 (current library docs) and Playwright (browser testing) |

## Daily workflow
- Build a feature, then run `/guardrail-check`.
- Add a disorder with `/add-condition Social anxiety disorder`.
- Before a release, run `/verify-sources`.
- Check progress with `/phase-status`.
