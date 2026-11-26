# Roadmap

Guardrails in CLAUDE.md apply to every phase. Run `/guardrail-check` before closing any phase. Do not start a phase until the previous one passes and the owner approves.

## Phase 1: Core (offline, no external APIs)
- [ ] Next.js + TypeScript + Tailwind + shadcn/ui scaffold, installable PWA
- [ ] zod schemas: Condition, Measure, Intervention, Resource, Stat
- [ ] CI check: content needs sources[], license, lastVerified (G10)
- [ ] lib/phi-scrubber.ts (18 HIPAA Safe Harbor identifiers) + unit tests
- [ ] PHI-leak tests: planted fake identifiers never leave the browser
- [ ] lib/scoring.ts (weighted, explainable, duration/exclusion gates) + unit tests
- [ ] Content (original wording): panic disorder, agoraphobia, GAD, MDD, PTSD
- [ ] Screens: Home/mode, Symptom Finder, Possible Diagnoses ("why suggested"), Measures (GAD-7, PHQ-9, item-9 flag)
- [ ] PHI banner, crisis button (content/crisis-lines.json), disclaimer footer
- [ ] Browser-side PDF: blank GAD-7/PHQ-9 and PMR homework handout
- [ ] GitHub Actions: tests + scripts/guardrail-scan.sh on every push
- [ ] Accessibility: axe checks, WCAG 2.2 AA

## Phase 2: Treatment + US integrations
- [ ] Treatment Plan Builder (problem → definitions → goals → objectives → interventions), plan PDF without identifiers
- [ ] Interventions library (PMR, breathing, grounding, thought record, exposure ladder, behavioral activation) with evidence levels
- [ ] Client handouts (original, 6th–8th grade reading level)
- [ ] ICD-10-CM lookup via NLM Clinical Tables (codes only)
- [ ] MedlinePlus Connect psychoeducation by ICD-10-CM code (with attribution)
- [ ] Referrals: NPPES (taxonomy + ZIP), FindTreatment.gov (after access is approved), HRSA health centers
- [ ] Evidence links: NICE, APA Div. 12, NCCIH (complementary care)
- [ ] Share by link/QR with resource IDs only

## Phase 3: Global + evidence
- [ ] ICD-11 via WHO ICD-API (server-side secret or local container)
- [ ] WHO GHO statistics (confirm the current OData endpoint)
- [ ] PubMed and ClinicalTrials.gov links on interventions (clinician mode)
- [ ] RxNorm / openFDA medication education (clinician mode)
- [ ] Ethics & Legal Hub by profession and country
- [ ] Spanish (next-intl), then more languages; RTL support
- [ ] Client mode (topics, skills, handouts, crisis, no diagnoses)

## Phase 4: Business + interoperability
- [ ] Clinician accounts (email + MFA), license attestation
- [ ] BAA click-to-sign flow; hosting on Vercel Pro with HIPAA BAA add-on
- [ ] LOINC-coded measures + FHIR QuestionnaireResponse export (no identifiers)
- [ ] Licensed DSM-5-TR / Wiley content behind feature flags (only if licenses are signed)
- [ ] Security review / pen test, attorney sign-off

## Owner actions (Claude Code cannot do these)
- [ ] Healthcare attorney review (ToS, BAA template, FDA CDS position, state laws)
- [ ] Licensed clinical reviewer(s) for all content
- [ ] Apply for an APA DSM-5-TR software license (optional) and/or a Wiley license (optional)
- [ ] Register for the WHO ICD-API (client id/secret)
- [ ] Request FindTreatment.gov API access; register for HRSA web services
- [ ] Confirm measure licenses (PCL-5, AUDIT, PDSS, ISI, Y-BOCS, SPIN, C-SSRS, Stanley-Brown)
- [ ] Tech E&O + cyber insurance
