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
