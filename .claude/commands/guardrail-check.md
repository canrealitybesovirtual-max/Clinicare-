---
description: Run the full guardrail audit (scanner + compliance-auditor agent + tests)
---
1. Run `bash scripts/guardrail-scan.sh`.
2. Run the test suite (unit, PHI-leak, accessibility) if it exists.
3. Use the compliance-auditor subagent to review all changes since main.
4. Report: PASS, or a table of BLOCKERS and WARNINGS with exact fixes. Do not fix anything until I approve.
