#!/usr/bin/env bash
# Guardrail scan: runs after every Claude Code edit (see .claude/settings.json) and in CI.
# Exit 2 = violation (Claude Code shows the message and must fix it).
# To allow a reviewed exception on one line, add the comment: guardrail-ok: <reason>
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0
DIRS=""; for d in src app lib components content public; do [ -d "$d" ] && DIRS="$DIRS $d"; done
[ -z "$DIRS" ] && exit 0
fail=0
check() { # $1 = label, $2 = extended regex
  hits=$(grep -rnIE --exclude-dir=node_modules --exclude=licenses.json "$2" $DIRS 2>/dev/null | grep -v "guardrail-ok")
  if [ -n "$hits" ]; then echo "GUARDRAIL $1:" >&2; echo "$hits" | head -20 >&2; fail=1; fi
}
check "G5 browser storage of clinical data (localStorage/sessionStorage/cookies/IndexedDB)" 'localStorage|sessionStorage|document\.cookie|indexedDB'
check "G5 client identifier fields" '\b(firstName|lastName|clientName|patientName|dateOfBirth|dob|ssn|socialSecurity|mrn|medicalRecordNumber|insuranceId)\b'
check "G16 AI/LLM API call" 'api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis|@anthropic-ai/sdk|from "openai"|api\.mistral\.ai|api\.cohere'
check "G17 secret exposed to browser" 'NEXT_PUBLIC_[A-Z_]*(SECRET|CLIENT_SECRET|PRIVATE|TOKEN)'
check "G15 forbidden marketing claim" 'HIPAA[ -](certified|approved|certification)'
check "G4 homeopathy" '[Hh]omeopath'
check "G1 possible DSM criteria structure (use original wording)" 'Criterion [A-H]\b|DSM-5-TR [Cc]riteria [A-H]\b'
check "G3/G14 analytics or trackers" 'google-analytics|gtag\(|googletagmanager|mixpanel|segment\.com|hotjar|posthog'
[ $fail -eq 1 ] && { echo "Fix the lines above or add 'guardrail-ok: <reason>' after owner approval. See CLAUDE.md." >&2; exit 2; }
exit 0
