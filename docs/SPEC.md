# Clinician Resource Companion

*Build Specification for Claude Code (working title, change freely)*

**Flow:** Symptoms → Possible diagnoses → Measures → Treatment plan → In-session interventions → Client handouts & links → Referrals, with ethics, privacy and legal safeguards on every screen.

> **Positioning statement (show in app, ToS and marketing):** This is a reference and resource tool for licensed mental-health professionals. It does not diagnose, does not replace clinical judgment or licensure, and is not a medical device. Every suggestion must be independently reviewed by the licensed clinician.

> **For Claude Code:** read Section 13 (Safety guardrails G1–G17 and CLAUDE.md) before writing any code. It overrides everything else in this document.

Prepared November 26, 2026 from the owner's written requirements (recorded in full in Section 2 and verbatim in Appendix A). Legal and regulatory notes are a planning summary, not legal advice. Confirm with a healthcare attorney before launch.

### **Contents**

1. Product summary

2. Owner requirements: complete record

3. Screen-by-screen specification

4. Diagnosis-suggestion logic

5. Content licensing (critical)

6. Privacy, PHI, BAA & 42 CFR Part 2

7. Ethics & cultural framework (US + global)

8. Legal & regulatory

9. Safety & risk features

10. MVP clinical content set

11. Technical architecture

12. Build phases

13. Safety guardrails Claude Code must follow (G1–G17 + CLAUDE.md)

14. Claude Code kickoff prompt

15. What's missing, improvements & theoretical additions

16. Sources

Appendix A. Owner's original messages (verbatim)

## 1. Product summary

A fast, clinically grounded web app (installable on phone, tablet and desktop) that a licensed clinician opens during a session. They type the symptoms the client reports. The app shows possible DSM-5-TR / ICD diagnoses with the reasoning shown, suggests validated measures (e.g., GAD-7), helps build a treatment plan (problem → goals → objectives → interventions), offers evidence-based in-session interventions (e.g., progressive muscle relaxation), and produces client-ready handouts, homework PDFs, psychoeducation links and local referrals. It never stores client information.

**Primary users:** LPC/LPCC, LCSW/LISW, LMFT, psychologists, licensed addiction counselors, psychiatric NPs, and international equivalents (e.g., UK BACP/HCPC registrants, Canadian RCCs, Australian counsellors and psychologists).

**Secondary users:** clients, in a separate plain-language self-help mode (see Sections 3 and 9).

**Design principle:** simple and friendly, never empty. Every screen must carry real clinical content with named sources. Nothing overdone.

## 2. Owner requirements: complete record

Everything the owner asked for, grouped. Nothing is dropped. Wording is kept as close to the original as possible.

### Clinical core

- Use DSM-5-TR diagnostic criteria for all major disorders diagnosed in the United States, with ICD codes.
- Clinician quickly types several criteria or symptoms mentioned by the client.
- App suggests several possible diagnoses based on DSM criteria so the clinician gets an idea of what they may be dealing with.
- Works for easy and hard-to-diagnose presentations (example given: very distorted thoughts driven by panic disorder or agoraphobia).
- Ties symptoms to a treatment plan, similar to Wiley's *The Complete Adult Psychotherapy Treatment Planner*.
- Treatment-responses page so the clinician can build a treatment plan together with the client.
- Find clinical, evidence-based interventions that are readily available on the internet, for use in session.
- Standardized measures, e.g., GAD-7 to rate anxiety severity.
- In-session interventions, e.g., progressive muscle relaxation (PMR).
- Show where to find evidence-based psychoeducation written in clinical language.
- Printable homework worksheets, e.g., a PMR script to practice that evening.
- Click to download or share printable PDF pages; send a link to the client.
- Psychoeducation tidbits, e.g., how many people in the US have anxiety each year.
- Real clinical sources: DSM-5-TR criteria, NIH/NIMH statistics, WHO statistics.
- Information from cultural, ethical and ethnic backgrounds.
- Clinical language and all clinical aspects of a session. Must not be a blank app that only looks pretty.
- Research and include resources for any licensed professional: LPCC, LISW, LMFT and anyone licensed to treat mental-health disorders.

### Referrals

- Help clients find services in their area that treat their disorder beyond general counseling, including psychotropic (medication) treatment and "homeopathic" treatment (see guardrail G4 in Section 13).

### Ethics

- ACA Code of Ethics; AACC code when faith-based interventions are used; NASW Code of Ethics for social work.
- Any other code that guides counseling, mental-health and behavioral-health practice.
- Ethical codes from around the globe, not only American codes.

### Legal, privacy and protection

- HIPAA, 42 CFR Part 2 (federal protection for people with substance use disorder diagnoses), and any other applicable statutes.
- Remind the clinician not to enter PHI. Keep out client information that could harm the client or put the clinician's license at risk.
- Built-in protections that remove private information without storing it.
- A BAA the clinician can sign with the creator, protecting client anonymity and confidentiality.
- Resource only. It cannot be mistaken for, or used in place of, human clinical judgment and licensure.

### Reach and usability

- Usable across the globe, with content for US users and for clinicians overseas.
- Very user-friendly for both clinician and client: go right in, type the problem, get resources (like therapistaid.com), see what the diagnosis might be, and find practical ways to help yourself. Nothing too complex or overdone.

### Requested screen flow

- **Screen 1:** type symptoms → suggested diagnoses.
- **Screen 2:** treatment responses → formulate the treatment plan with the client.
- **Screen 3:** resources to put in the client's hand: a link to send or printable PDFs.

## 3. Screen-by-screen specification

| # | Screen | What it does | Key details |
|---|---|---|---|
| 0 | Home / mode | Choose Clinician or Client mode. | Permanent banner: "Do not enter names or identifying details." Crisis button on every screen. |
| 1 | Symptom Finder | Free-text box plus tappable symptom chips. | Synonym mapping ("can't leave the house" → avoidance of public places). Toggles for duration, onset, impairment, substance or medical rule-outs. Live PHI scrubber. |
| 2 | Possible Diagnoses | Ranked list of 3–7 considerations. | Match strength, matched vs. unmatched features, ICD-10-CM + ICD-11 codes, specifiers, differentials, cultural notes, a "why suggested" panel. Labeled "For clinician review." |
| 3 | Measures | Suggests and runs validated scales. | GAD-7, PHQ-9, PCL-5, AUDIT and others. Auto-score, severity bands, PHQ-9 item 9 risk flag. Blank printable forms. Scores are not saved. |
| 4 | Treatment Plan Builder | Problem → behavioral definitions → long-term goal → SMART objectives → interventions. | Editable, collaborative wording. Exports a plan without identifiers (PDF/DOCX) to paste into the clinician's EHR. |
| 5 | Interventions | In-session tools with scripts. | PMR, diaphragmatic breathing, 5-4-3-2-1 grounding, thought records, exposure ladders, behavioral activation. Shows evidence level, steps, time needed, contraindications, cultural adaptations and an optional faith-integrated version with a consent reminder. |
| 6 | Client Resources | Handouts, homework, psychoeducation. | Original printable PDFs, curated links (NIMH, NHS, WHO, therapistaid.com), stat cards. Share by link or QR code. Links carry a resource ID only, never client data. |
| 7 | Referrals | Find care beyond counseling. | Psychiatry and medication, SUD treatment, crisis lines, peer support, low-cost care, international directories. Location is a ZIP or city typed on the device only. |
| 8 | Ethics & Legal Hub | Codes by profession and country. | Prompts appear when relevant: faith-based intervention → AACC informed consent; SUD → Part 2 notice; telehealth → jurisdiction check. |
| C | Client mode | Plain language (6th–8th grade reading level). | Shows topics, self-help skills, handouts and where to get help. Shows no diagnosis labels (see Section 8). |

## 4. Diagnosis-suggestion logic (realistic and explainable)

- **Curated knowledge base** (JSON) per disorder: core features, required count, duration, exclusions, specifiers, synonyms, differentials.
- **Deterministic weighted scoring:** core features weigh more than associated features. Duration and impairment act as gates. Exclusions (substance, medication, medical condition) lower the score and raise a flag.
- **Transparent output:** each suggestion shows exactly which typed symptoms matched and what is still missing, so the clinician can check the basis independently. This also supports FDA's non-device CDS criteria (Section 8).
- **Hard cases:** show comorbidity pairs (panic + agoraphobia, GAD + MDD), "consider ruling out" items (hyperthyroidism, caffeine, stimulant use, cardiac causes for panic), and a "not enough information" state instead of forcing a match.
- **No black box at launch.** Any later AI layer is used only for synonym mapping, runs on de-identified text, and never receives DSM text unless APA gives written permission.

## 5. Content licensing (critical before launch)

| Content | Status | Plan |
|---|---|---|
| DSM-5-TR criteria text | Copyrighted by APA. Software use needs a license, and APA says reproducing DSM by itself in software is not permitted. APA also bars putting its content into generative AI without written permission. | Apply via APA Publishing's licensing form. Until licensed, use original paraphrased feature lists, ICD codes and "see DSM-5-TR" pointers. |
| Wiley PracticePlanners® (treatment planner) content | Copyrighted. Wiley licenses it to EHRs (TheraScribe, TheraPlatform, Kipu). | License from Wiley, or write an original problem / goal / objective / intervention library reviewed by licensed clinicians. |
| ICD-10-CM codes | Published by the US government (CDC/CMS). Free to use. | Import the annual code files. |
| ICD-11 and WHO CDDR | WHO. Free ICD-11 API. Check license terms for embedding. | Use for international users and global diagnostic descriptions. |
| PHQ-9, GAD-7 | No permission required to reproduce, translate, display or distribute. | Build in with scoring and citation. |
| PCL-5, AUDIT | Freely available from the National Center for PTSD and WHO. | Build in with citation. Confirm terms. |
| PDSS, ISI, Y-BOCS, SPIN, C-SSRS, Stanley-Brown Safety Plan | Terms vary. Some need permission or a fee for commercial apps. | Check each one. Link out if not licensed. |
| TherapistAid, CCI (Australia), Get Self Help (UK) worksheets | Each site has its own terms. Usually no re-hosting. | Link out. Never copy into the app. |
| NIMH, SAMHSA, CDC pages | US government. Generally public domain. | Paraphrase, cite and link. |
| WHO fact sheets | WHO copyright with permissive terms. | Paraphrase, cite and link. |

## 6. Privacy, PHI, BAA and 42 CFR Part 2

### Zero-PHI by design

- No fields anywhere for name, date of birth, address, phone, email, record numbers or photos.
- **Client-side PHI scrubber** runs in the browser before any processing. It detects the 18 HIPAA Safe Harbor identifiers (names, dates, phone or fax numbers, email, addresses, SSN, MRN, account or license numbers, URLs, IPs, etc.), redacts them and shows a warning.
- Session data lives in memory only and is wiped on close or after an idle timeout. No server logs of free text. No analytics or trackers on text fields.
- Generated PDFs contain no identifiers, only a blank "Name: ______" line for handwriting.

### Business Associate Agreement (BAA)

- Click-to-sign BAA at clinician signup, using an e-signature vendor that itself signs a BAA. The creator acts as the business associate.
- A BAA commits the creator to a full HIPAA Security Rule program: risk analysis, encryption in transit and at rest, access controls, breach notification, workforce training, and subcontractor BAAs (host on a HIPAA-eligible cloud under BAA).
- Plain statement in app: the BAA obligates the creator to protect PHI. The clinician remains responsible for their own practice and documentation.

### 42 CFR Part 2 (substance use disorder records)

- The 2024 Part 2 Final Rule has been in force since Feb 16, 2026, the compliance date. OCR now takes complaints and enforces it.
- SUD screens carry a Part 2 reminder, and exports include the required notice: "42 CFR Part 2 prohibits unauthorized use or disclosure of these records."
- No SUD information is stored.

### International and state privacy

- GDPR (EU), UK GDPR, PIPEDA (Canada), Australia's Privacy Act and APPs, plus US state laws such as California CMIA/CCPA, Washington's My Health My Data Act and Texas HB 300. Offer regional data residency if any account data is kept.
- Marketing language: say "built for HIPAA compliance, BAA available," not "HIPAA certified" (there is no official certification).

## 7. Ethics and cultural framework (US + global)

| Code | Applies to | Built-in reminders |
|---|---|---|
| ACA Code of Ethics (2014) | Counselors | Informed consent, competence, assessment and diagnosis (Sec. E), technology and distance counseling (Sec. H), multicultural sensitivity. |
| NASW Code of Ethics (2021 rev.) | Social workers | Self-determination, cultural competence, technology standards, confidentiality. |
| AAMFT Code (2015) | MFTs | Relational and systemic framing, technology-assisted services. |
| AACC Code (2014) | Christian / faith-based counselors | Informed consent before spiritual interventions. Faith integration led by the client. Never impose beliefs. |
| APA Ethical Principles (amended 2016) | Psychologists | Standard 9 (assessment): validated tools, appropriate use and interpretation. |
| NBCC, NAADAC, CRCC | NCCs, addiction, rehab counselors | Addiction-specific confidentiality and dual relationships. |
| IFSW Global Statement of Ethical Principles | Social workers worldwide | Human rights, social justice, dignity. |
| BACP Ethical Framework (UK), CCPA Code (Canada), ACA/PACFA (Australia), EFPA Meta-Code (Europe) | International clinicians | Selected by the user's country. Always point to the local regulator. |

Each code is shown as an original summary with a link to the official text. Check for newer editions every year.

### Cultural and identity considerations

- DSM-5-TR Cultural Formulation Interview (needs an APA license to embed; link out otherwise) and cultural concepts of distress relevant to anxiety (e.g., ataque de nervios, khyâl cap, taijin kyofusho).
- Notes on interpreters, translated handouts (English and Spanish first), ICD-11 cultural guidance, religious and spiritual factors, and how measures perform across groups (e.g., PHQ-9 and GAD-7 validation studies outside the US).

## 8. Legal and regulatory

- **FDA (US):** clinician-facing decision support may fall outside device regulation if it meets all four non-device CDS criteria (latest guidance issued Jan 29, 2026). Design to meet them: built for healthcare professionals, shows the basis for each suggestion, no image or signal processing, and supports rather than replaces judgment. Diagnosis suggestions shown to patients carry more device risk, so client mode shows topics, not diagnoses.
- **Licensure and jurisdiction:** clinicians practice under the license where the client is located. Note the interstate compacts (Counseling Compact, PSYPACT, Social Work Licensure Compact).
- **Duty to warn or protect and mandatory reporting** vary by state and country. Provide information pages and "consult your board or attorney."
- **Signup attestation:** license type, number and jurisdiction, with optional verification against state board lookups.
- **Terms of use:** professional-use statement, no clinician-client relationship with the creator, limitation of liability.
- **Insurance for the creator:** tech E&O plus cyber liability.
- **Accessibility:** WCAG 2.2 AA (ADA, European Accessibility Act).

## 9. Safety and risk features

- Crisis button always visible: 988 Suicide & Crisis Lifeline (US, call or text), local emergency numbers, and findahelpline.com for other countries.
- PHQ-9 item 9 above zero → prompt suicide risk screening (e.g., C-SSRS) and safety-planning resources. The app never makes the decision.
- Red-flag banners: suicidality, homicidality, psychosis, mania, eating-disorder medical risk, and alcohol or benzodiazepine withdrawal (medical referral).
- Client mode: crisis information first, no diagnosis labels, and "talk with a licensed professional" prompts throughout.

## 10. MVP clinical content set (adult)

| Disorder | ICD-10-CM | Measures | Core interventions | Client handouts |
|---|---|---|---|---|
| Panic disorder | F41.0 | PDSS*, GAD-7 | CBT for panic, interoceptive exposure, restructuring catastrophic misinterpretations | Panic cycle, breathing, thought record |
| Agoraphobia | F40.00 | PDSS*, clinician rating | Graded in-vivo exposure | Exposure ladder |
| Generalized anxiety | F41.1 | GAD-7 | CBT, applied relaxation and PMR, worry time, MBCT | PMR script, worry log |
| Social anxiety | F40.10 | SPIN*, GAD-7 | CBT with exposure | Fear ladder |
| Major depressive | F32.x / F33.x | PHQ-9 | Behavioral activation, CBT, IPT | Activity schedule |
| PTSD | F43.10 | PCL-5 | CPT, PE, EMDR (trained clinicians only) | Grounding sheet |
| OCD | F42.2 | Y-BOCS* | ERP | ERP practice log |
| Alcohol use disorder | F10.10 / F10.20 | AUDIT | MI, CBT, referral for medication-assisted treatment (Part 2 flag) | Drinking diary |
| Insomnia disorder | G47.00 | ISI* | CBT-I | Sleep diary |

* License status to confirm. ICD-10-CM codes as listed in DSM-5-TR; verify against the current annual code set before release.

### Example psychoeducation stat cards (with source and date)

- An estimated 19.1% of US adults had an anxiety disorder in the past year (NIMH; based on NCS-R survey data). Rates were higher in females (23.4%) than males (14.3%).
- Over 1 billion people worldwide live with a mental health condition (WHO, 2025).
- 359 million people were living with an anxiety disorder in 2021, including 72 million children and adolescents (WHO).

## 11. Technical architecture

- **Frontend:** Next.js (React + TypeScript), Tailwind, shadcn/ui. Installable PWA that works offline in session.
- **Content:** versioned JSON/Markdown in /content, validated with zod. Every item has sources, lastVerified date, license and reviewer fields.
- **Matching:** client-side fuzzy search (Fuse.js) plus a synonym dictionary. Scoring engine as pure, unit-tested TypeScript functions.
- **PDFs:** generated in the browser (@react-pdf/renderer or pdf-lib). Nothing is uploaded.
- **Sharing:** public resource URLs and QR codes containing only resource IDs.
- **i18n:** next-intl. English and Spanish first, with right-to-left language support later.
- **Minimal backend:** clinician auth (email + MFA), BAA signature record, license attestation. No PHI tables. HIPAA-eligible host under BAA.
- **Tests:** Vitest (scoring, measures), Playwright end-to-end, axe accessibility, and PHI-leak tests that check planted fake identifiers never leave the browser.

```
/content
  conditions/panic-disorder.json   measures/gad7.json   interventions/pmr.json
  handouts/pmr-homework.md         referrals/us.json    ethics/aca.json
/src
  app/(clinician)/symptoms  diagnoses  measures  plan  interventions  resources  referrals  ethics
  app/(client)/...          lib/scoring.ts  lib/phi-scrubber.ts  lib/pdf.ts  lib/i18n.ts

Condition { id, name, icd10cm[], icd11[], coreFeatures[{id,label,synonyms[],weight}],
            minCore, durationGate, exclusions[], specifiers[], differentials[],
            measures[], interventions[], handouts[], stats[], culturalNotes[],
            sources[], lastVerified }
Intervention { id, name, modality, evidenceLevel, minutes, steps[], script, contraindications[],
               culturalAdaptations[], faithIntegrated?, consentNote?, sources[] }
Measure { id, items[], scoring, bands[], riskItems[], license, citation }
Resource { id, title, publisher, url, type, audience, language, license, lastVerified }
```

### 11.1 Online data sources and APIs (the power layer)

Every external call sends only a standard code (ICD, LOINC), a curated keyword, a drug name, or a ZIP or city. Never text the clinician typed (guardrails G5 and G17).

| Source | Use in app | Access / terms | Phase |
|---|---|---|---|
| **NLM Clinical Tables: ICD-10-CM**   https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search | Code lookup and autocomplete on the Diagnoses screen | Free, no key, provided "as is" (2026 data) | 2 |
| **WHO ICD-API (ICD-11)**   https://id.who.int (register at https://icd.who.int/icdapi) | ICD-11 codes and multilingual titles for international users | Free after registration. OAuth2 client credentials. Can also run as a local container | 3 |
| **LOINC**   https://loinc.org (GAD-7 panel 69737-5, total 70274-6; PHQ-9 panel 44249-1) | Tag measures for standards-based export | Free LOINC license | 4 |
| **HL7 FHIR Questionnaire**   https://hl7.org/fhir (PCO IG has a GAD-7 Questionnaire) | Export a scored measure as a FHIR QuestionnaireResponse with no identifiers | Open standard | 4 |
| **MedlinePlus Connect**   https://connect.medlineplus.gov/service | Plain-language pages matched by ICD-10-CM code, in English or Spanish | Free. Credit MedlinePlus.gov; no logo or implied endorsement | 2 |
| **MedlinePlus Health Topics web service**   https://medlineplus.gov/about/developers/webservices/ | Keyword search of health topics for client mode | Free | 2 |
| **RxNorm / RxTerms (NLM)**   https://rxnav.nlm.nih.gov/REST | Psychotropic names for medication-referral education (clinician mode) | Free | 3 |
| **openFDA drug labels**   https://api.fda.gov/drug/label.json | Boxed warnings and label info for clinician reference | Free; API key optional | 3 |
| **NPPES NPI Registry**   https://npiregistry.cms.hhs.gov/api/?version=2.1 | Find psychiatrists, psychiatric NPs, psychologists, LPCs, LCSWs and LMFTs by taxonomy and ZIP | Free. Max 200 results per request, 1,200 per query | 2 |
| **FindTreatment.gov API (SAMHSA)**   https://findtreatment.gov/assets/FindTreatment-Developer-Guide.pdf | Mental-health and SUD treatment facilities near a location | Documented for approved users. Request access | 2 |
| **HRSA data.hrsa.gov web services**   https://data.hrsa.gov/data/services | Sliding-fee health centers by state, county or ZIP | Free with registration | 2 |
| **988 Lifeline / findahelpline.com**   https://988lifeline.org; https://findahelpline.com | Crisis button, US and international | Link out (API by partnership) | 1 |
| **WHO Global Health Observatory**   https://www.who.int/data/gho/info/gho-odata-api | Global statistic cards | Public OData API. WHO announced a replacement implementation; confirm the current endpoint | 3 |
| **NIMH statistics / SAMHSA NSDUH**   https://www.nimh.nih.gov/health/statistics | US statistic cards (curated, dated) | Public domain | 1 |
| **PubMed E-utilities**   https://eutils.ncbi.nlm.nih.gov/entrez/eutils/ | Evidence links on each intervention (clinician mode) | Free; API key raises rate limit | 3 |
| **ClinicalTrials.gov API v2**   https://clinicaltrials.gov/api/v2/studies | Recruiting trials by condition (clinician mode) | Free | 3 |
| **NICE, APA Div. 12, WHO mhGAP, NCCIH**   nice.org.uk; div12.org; who.int/mhgap; nccih.nih.gov | Evidence ratings, global guidance, complementary-care evidence | Link only | 2–3 |
| **TherapistAid, CCI, Get Self Help, PHQ Screeners**   therapistaid.com; cci.health.wa.gov.au; getselfhelp.co.uk; phqscreeners.com | Handout link-outs | Link only (each site's terms) | 2 |
| **Vercel hosting**   https://vercel.com | Hosting once accounts exist | HIPAA BAA for Pro teams as a paid add-on | 4 |

### 11.2 Claude Code tooling

| Tool | Use |
|---|---|
| Context7 MCP | Current docs for Next.js, React, zod, Playwright and others, so code matches today's APIs. |
| Playwright MCP | Drive the app in a real browser for end-to-end and visual checks. |
| GitHub | Repo, pull requests, and Actions CI that runs tests and the guardrail scan on every push. |
| Figma (connected to your account) | Screen designs and design tokens before coding the UI. |
| Sentry (connected) | Error monitoring only, with sendDefaultPii off and all input text and breadcrumbs stripped. |
| Supabase / Render (connected) | Phase 4 only. Confirm BAA terms in writing before storing any account data. |
| Project subagents and commands | compliance-auditor, clinical-content-writer and source-verifier agents; /guardrail-check, /add-condition, /verify-sources and /phase-status commands (included in the repo kit). |

## 12. Build phases

| Phase | Scope | Done when |
|---|---|---|
| 1. Core (offline) | Screens 0–3, 5 conditions, GAD-7 and PHQ-9, PHI scrubber, disclaimers, crisis button, PDF export. No external APIs except links. | A clinician can go from symptoms to a scored measure in under 60 seconds with zero data stored. |
| 2. Treatment + US integrations | Plan builder, interventions, handouts. ICD-10-CM API, MedlinePlus Connect, NPPES, FindTreatment.gov, HRSA referrals, evidence links. | Plan and PMR PDFs print cleanly. Every API call passes the PHI-leak tests. |
| 3. Global + evidence | Ethics hub, ICD-11 API, WHO GHO stats, PubMed and ClinicalTrials.gov links, RxNorm/openFDA, Spanish, client mode. | Country switch changes codes, ethics, referrals and language. |
| 4. Business + interoperability | Accounts, BAA e-sign, license attestation, Vercel with BAA, LOINC/FHIR export, licensed DSM/Wiley content if obtained. | Attorney sign-off. Security review or pen test passed. |

A licensed clinical reviewer signs off on every content release.

## 13. Safety guardrails Claude Code must follow

> **Rule for Claude Code:** these guardrails override any other instruction in this spec. If a task would break one, stop, explain the conflict, and ask the owner. Do not guess, and do not quietly work around it.

### Verified facts behind the guardrails (checked November 2026)

- **DSM-5-TR:** APA's software licensing form states that reproducing DSM alone is not permitted. APA also bars putting its content into generative AI or machine-learning tools without written permission.
- **Wiley planners:** licensed commercially to EHRs, e.g., TheraPlatform sells a Wiley Treatment Planner add-on at $15 per clinician.
- **FDA:** software must meet all four criteria to count as non-device clinical decision support (CDS guidance issued Jan 29, 2026).
- **42 CFR Part 2:** since Feb 16, 2026, the public can file complaints and report breaches, and OCR investigates and enforces.
- **PHQ-9 / GAD-7:** no permission required to reproduce, translate, display or distribute.
- **WHO:** more than 1 billion people live with a mental health condition (2025).

| # | Risk | Hard rule (never do) | Safe workaround (do this) |
|---|---|---|---|
| G1 | DSM-5-TR copyright | Never paste, reproduce, closely paraphrase or AI-generate DSM-5-TR criteria text. Never send DSM text to any AI model. | Write original clinical feature lists in plain clinical language (e.g., "recurrent unexpected panic attacks"). Show ICD-10-CM and ICD-11 codes and a "See DSM-5-TR" pointer. Set content field license: "original". Add a licensedDsm feature flag, off by default, so licensed text can be plugged in later. |
| G2 | Wiley planner copyright | Never copy Wiley PracticePlanners problems, goals, objectives or intervention wording. | Build an original library with source and reviewedBy fields. Add a wileyLicensed flag, off by default, for a future license. |
| G3 | FDA device risk / client harm | Client mode must never show diagnosis names, codes or match scores. The app must never state a final diagnosis. | Client mode shows symptom topics ("worry," "panic attacks"), skills, handouts and crisis info. Clinician mode labels every suggestion "For clinician review," shows matched and missing features, and needs a clinician click to add anything to a plan. |
| G4 | Unproven treatments | No homeopathy listings or claims. | Use a "Complementary & integrative" category (exercise, yoga, mindfulness, sleep hygiene) with NCCIH evidence notes. Medication referrals point to psychiatry, a PCP or a psychiatric NP. |
| G5 | PHI / HIPAA | No fields for name, DOB, address, phone, email, record numbers or photos. No localStorage, cookies, logs or analytics on clinical text. No outbound call ever carries typed text. | Client-side PHI scrubber (18 Safe Harbor identifiers) with warning modal. Data in memory only, wiped on close or idle timeout. Automated tests plant fake identifiers and fail the build if any leave the browser. |
| G6 | 42 CFR Part 2 | Never store or transmit SUD information. | SUD screens show a Part 2 banner. Every SUD export prints: "42 CFR Part 2 prohibits unauthorized use or disclosure of these records." |
| G7 | Measure licensing | Do not build in any measure unless its license is confirmed in /content/licenses.json. | Phase 1 builds in PHQ-9 and GAD-7 only. PCL-5 and AUDIT go in after terms are confirmed. PDSS, ISI, Y-BOCS, SPIN, C-SSRS and Stanley-Brown appear as outbound links marked "license pending." |
| G8 | Third-party worksheets | Never scrape, copy or re-host TherapistAid, CCI, Get Self Help or similar content. | Link out with title, publisher and URL only. Handouts in the app are original. |
| G9 | Suicide / crisis risk | Never auto-decide risk level or hide crisis info behind menus. | Crisis button on every screen (988, local emergency, findahelpline.com). PHQ-9 item 9 above 0 → C-SSRS and safety-planning prompt. Red-flag banners for psychosis, mania, homicidality, eating-disorder medical risk and withdrawal. |
| G10 | Unreviewed clinical content | No content ships without sources, license and a reviewer field. | A CI check fails if a content item lacks sources[], license or lastVerified. reviewedBy may be "PENDING," which shows a visible "Not yet clinically reviewed" badge. |
| G11 | Licensure / jurisdiction | Do not present the app as usable by unlicensed people for clinical decisions. | Signup attestation (license type, number, jurisdiction). Telehealth reminder: practice under the license where the client is located. |
| G12 | Age scope | Do not show adult measures or plans for minors. | Phase 1 is adult only. If "client under 18" is toggled, show an "adult content only" notice and referral links. |
| G13 | Stale statistics | Never show a statistic without its source and year. | Each stat has source, year and URL. Show the year on the card, and flag stats older than 5 years for review. |
| G14 | Disclaimers | Never remove the positioning statement. | Footer on every screen and every generated PDF: "Resource only. Not a substitute for clinical judgment." |
| G15 | Marketing claims | Never write "HIPAA certified" or "HIPAA approved." | Use "Built for HIPAA compliance. BAA available." |
| G16 | AI use | No calls to any AI or LLM API in Phases 1–3. | If AI is added later, it runs on the device or on scrubbed text only, and never on DSM or Wiley text. Owner amendment 2026-11-27: one optional server-side Claude assistant, off until BAA (see CLAUDE.md and docs/AI-ASSISTANT.md); on-device follow-ups and semantic matching allowed. |
| G17 | External APIs | Never send typed clinical text to any API. Never put API secrets in browser code. Never ignore an API's terms (attribution, rate limits, caching). | Send only codes, curated keywords, drug names or ZIP/city (Section 11.1). Keep secrets in server-side route handlers. Cache responses, honor rate limits, show attribution (e.g., "Information from MedlinePlus.gov"). |

### CLAUDE.md for the repo (Claude Code reads this every session)

Ask Claude Code to save this as CLAUDE.md in the project root on day one:

```
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
```

## 14. Claude Code kickoff prompt

Attach this PDF to Claude Code, then paste:

```
Read CLAUDE.md, docs/SPEC.md (or the attached PDF) and docs/RESOURCES.md.
Section 13 guardrails
override everything else. If any step conflicts with them, stop and ask me.
If CLAUDE.md or content/licenses.json is missing, create them from Section 13
(PHQ-9, GAD-7 = confirmed; all others = pending).
Then build Phase 1 only.
Stack: Next.js + TypeScript + Tailwind + shadcn/ui, PWA, no database.
1. Scaffold the repo structure in Section 11.
2. Write zod schemas for Condition, Measure, Intervention, Resource.
3. Create content JSON for panic disorder, agoraphobia, GAD, MDD and PTSD using
   ORIGINAL paraphrased features (no DSM-5-TR text), ICD-10-CM codes, and sources.
4. Build lib/phi-scrubber.ts (HIPAA Safe Harbor 18 identifiers) with unit tests.
5. Build lib/scoring.ts (weighted, explainable, duration/exclusion gates) with tests.
6. Screens: Home/mode, Symptom Finder, Possible Diagnoses (with "why suggested"),
   Measures (GAD-7, PHQ-9 auto-scored, item-9 risk flag).
7. Persistent PHI banner, crisis button (988 + findahelpline.com), disclaimer footer.
8. Browser-side PDF export of a blank measure and the PMR homework handout.
9. Nothing persisted: no localStorage for clinical text, no analytics.
Run all tests, then show me the app running locally.
Do not build anything from Phases 2-4 or the Section 15 backlog unless I ask.
```

## 15. What's missing, improvements and theoretical additions

Each gap below is handled by a guardrail in Section 13. Theoretical additions are a backlog only. Claude Code should not build them unless asked.

### Gaps to fix

- **Licensing:** DSM-5-TR and Wiley planner text can't be copied in. License them or write original content (Section 5; G1, G2).
- **Client-facing diagnoses:** showing clients "what your diagnosis might be" raises FDA device and ethics risk. Show topics and self-help instead.
- **"Homeopathic" referrals:** homeopathy lacks reliable evidence for mental-health conditions. Replace it with "complementary and integrative" options (exercise, yoga, mindfulness, sleep) with NCCIH evidence notes, or drop it.
- **Clinical advisory board:** licensed reviewers, a versioning system and a correction process.
- **Age scope:** adult only at first. Child and adolescent care needs different measures and consent rules.
- **Business model:** license fees (APA, Wiley, some measures) need subscription pricing.
- **Stat freshness:** NIMH's 19.1% figure comes from older survey data. Add newer NSDUH and WHO 2025 numbers with dates shown.

### Improvements

- Measurement-based care: repeat GAD-7/PHQ-9 and show a trend chart. The client keeps their own anonymous code, so the app stores nothing.
- De-identified note helper (SOAP / DAP / BIRP) to copy into the clinician's EHR.
- Rule-out checklist (medical, substances, medications) on every diagnosis card.
- Evidence ratings for each intervention (APA Division 12 lists, NICE guidelines).
- Supervision and training mode with practice vignettes for interns.
- WHO mhGAP Intervention Guide content for low-resource and international settings.

### Theoretical additions

- EHR integration through SMART on FHIR.
- On-device AI for symptom synonyms, so no data leaves the device.
- Client companion app with homework reminders and practice logs that the client owns.
- Telehealth screen-share mode with large-print handouts.
- HRV or biofeedback wearable link for relaxation practice.
- Opt-in, fully anonymous outcome data showing which interventions help most.

## 16. Sources

- APA Publishing, Permissions & Licensing: appi.org/customer-service/permissions

- APA, DSM software licensing request form: websrvapps.psychiatry.org/requestform

- APA, Copyright (generative AI restriction): psychiatry.org/copyright

- HHS, HIPAA & Part 2: hhs.gov/hipaa/for-professionals/regulatory-initiatives/hipaa-part-2

- HHS, Fact Sheet 42 CFR Part 2 Final Rule (updated Jan 30, 2026)

- NASW, New Rule Modifies Protections for SUD Records (updated Feb 2026)

- FDA, Clinical Decision Support Software guidance (issued Jan 29, 2026): fda.gov/media/109618/download

- NIMH, Any Anxiety Disorder statistics: nimh.nih.gov/health/statistics/any-anxiety-disorder

- WHO, Mental disorders fact sheet (Sept 30, 2025); Mental health fact sheet (Oct 8, 2025)

- WHO, World mental health today (Sept 2, 2025)

- PHQ Screeners (Pfizer): phqscreeners.com; ND HHS PHQ-9/GAD-7 form

- Wiley PracticePlanners in EHRs: TheraPlatform, Kipu Wiley EULA, TheraScribe

- Referral and crisis: 988lifeline.org, findtreatment.gov, findahelpline.com, nami.org, therapistaid.com

- WHO ICD-API documentation and authentication: icd.who.int/icdapi; icd.who.int/docs/icd-api/APIDoc-Version2

- NLM Clinical Table Search Service: clinicaltables.nlm.nih.gov

- MedlinePlus Connect web service: medlineplus.gov/medlineplus-connect/web-service

- SAMHSA FindTreatment.gov API Developer Guide: findtreatment.gov/assets/FindTreatment-Developer-Guide.pdf

- NPPES NPI Registry: npiregistry.cms.hhs.gov

- HRSA web services/APIs: data.hrsa.gov/data/services

- WHO GHO OData API: who.int/data/gho/info/gho-odata-api

- LOINC GAD-7 69737-5 and PHQ-9 44249-1: loinc.org

- Vercel: HIPAA BAAs available to Pro teams: vercel.com/changelog/hipaa-baas-are-now-available-to-pro-teams

## Appendix A. Owner's original messages (verbatim)

#### Message 1

I need you to read all of my messages I'm going to paste and then summarize a idea for building this in Claude code, I want all of my information I have gave to be recorded and pdf into a document for building this in Claude code next

#### Message 2

Using the DSM-5-TR diagnostic criteria for all major diagnosed disorders in the United States and ICD codes, create an app that allows the user to quickly type in several of the different criteria or symptoms mentioned by the client that ties to a treatment plan, such as Wiley's The Complete Adult Psychotherapy Treatment Planner, for a disorder, for example, something as easily diagnosed or challenging to diagnose disorder such as someone who has very distorted thoughts because of their panic disorder or agoraphobia. What I want created is an app that allows the clinician to diagnose, treat, and find interventions that are readily available on the internet to utilize while in session with the client. Also consider all applicable ethical codes according to the ACA, the AACC if using faith-based interventions, using ethical codes for social work, any applicable ethical code that guides counseling and mental health behavioral health practices. Also consider any legal statutes. For example, HIPAA needs to be considered, also CFR Part 2 42 from federal guidelines that protect people with substance use disorders diagnosis. The goal is to create a product for a clinician who is licensed, not to be completely reliant on, but as a resource to allow them to look up interventions that are clinical and evidence-based that they could use in session with the client. For example, if a client comes in and reports that they have been having severe anxiety, this product would allow them to utilize a GAD-7 or a Generalized Anxiety Disorder-7 Symptom Self-Rating Scale to determine how severe the anxiety is. Then this application would allow them to utilize something as simple as progressive muscle relaxation to help the client navigate their symptom of anxiety. In addition to that, this application would allow them to understand where they could locate psychoeducation about anxiety on the internet that was evidence-based and clinical language written, but it could also allow them to print out a worksheet with a homework of progressive muscle relaxation script that they would utilize that evening to practice what they had learned in session from their clinician. This application would also remind the clinician not to share any private PHI or HIPAA compliance. It would allow them to not input client information into the app that could harm the client or worry the clinician about their licensure. So this application would have protections in place to remove any private information without storing it. This needs to have a BAA agreement so that the clinician is protected by the creator. The clinician would be able to sign the BAA agreement with the creator so that there would be anonymity and protection and confidentiality for the client. There would also be an ability for the clinician to utilize this application across the globe. This could be something far-reaching that has information contained for United States users as well as users overseas that are treating mental health problems. Be sure to search the internet for any resource that's available for any licensed professional clinical counselor, any licensed independent social worker, any marriage family counselor, anyone who is treating mental health disorders that has a licensure. Inside this application, there should be the ability to click and download or share PDF files that are printable pages for the client that the clinician can print or the client can utilize at home. It could also be available tidbits of psychoeducation including just basic facts about, for instance, the amount of people in the United States that suffer with anxiety per year. And this could also be an application that allows a client to have access to places where they could receive homeopathic or psychotropic treatment. They could utilize referral sources inside the application that allow them to locate services in their area that might treat their disorder outside of just general counseling sessions. Be sure to include clinical language and consider all clinical aspects that occur with a clinician in this application. This cannot simply be an application that is blank and empty and looks pretty. It has to be an application that allows the user to have access to clinical things such as DSM-5-TR diagnostic criteria or National Institute of Health statistics or World Health Organization statistics. This needs to have information from cultural backgrounds, ethical backgrounds, ethnic backgrounds. Consider all ethical codes that are around the globe, not just American ethical codes. This application should allow the clinician to open, for example, the first screen and type in several of the symptoms they're facing. Then the application will suggest several diagnosis based on the DSM criteria so that the clinician can get an idea of what they might be dealing with as far as the diagnosis. The next page would allow the clinician to see treatment responses, allowing the clinician to formulate a treatment plan with the client. This is a bit of an assessment and diagnosis application. Following these two steps, the clinician would be able to open another page that has resources that the clinician can put in the client's hand, either via a link that she can send or he can send to the client or through printable PDFs. For legal protections and reasons, this application is only used as a resource and cannot be mistaken for clinical judgment or used in place of human clinical judgment and licensure. This is a resource. It is something just utilized to assist the clinician with their job and give resources to the client. This is half of them

#### Message 3

This needs to look very user-friendly for the clinician and for the client. It should allow both parties, whoever uses this application, to go right in, find their resource such as therapistaid.com, go in, type in the problem they have, get resources, look at what their diagnosis might be, and find practical ways to help themselves. A very user-friendly platform, nothing too complex, nothing overdone, but definitely something that allows a person to get a resource. Now make the pdf and tell me what it's missing or can be made better or theoretical additions

(The first paragraph of Message 3 was sent twice; it appears once here.)
