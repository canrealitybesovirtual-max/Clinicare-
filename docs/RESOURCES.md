# Online data sources, APIs and tools

Rule: every external call sends only a standard code, a curated keyword, a drug name, or a ZIP/city. Never typed clinical text (guardrails G5, G17).

## NLM Clinical Tables: ICD-10-CM
- **Category:** Codes
- **Endpoint / docs:** https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search
- **Access / terms:** Free, no key, provided "as is" (2026 data)
- **Use in app:** Code lookup and autocomplete on the Diagnoses screen
- **Phase:** 2
- **Privacy rule:** Send code or standard term only

## WHO ICD-API (ICD-11)
- **Category:** Codes
- **Endpoint / docs:** https://id.who.int (register at https://icd.who.int/icdapi)
- **Access / terms:** Free after registration. OAuth2 client credentials. Can also run as a local container
- **Use in app:** ICD-11 codes and multilingual titles for international users
- **Phase:** 3
- **Privacy rule:** Secret stays server-side. Local container option for offline use

## LOINC
- **Category:** Measures
- **Endpoint / docs:** https://loinc.org (GAD-7 panel 69737-5, total 70274-6; PHQ-9 panel 44249-1)
- **Access / terms:** Free LOINC license
- **Use in app:** Tag measures for standards-based export
- **Phase:** 4
- **Privacy rule:** Codes only

## HL7 FHIR Questionnaire
- **Category:** Interop
- **Endpoint / docs:** https://hl7.org/fhir (PCO IG has a GAD-7 Questionnaire)
- **Access / terms:** Open standard
- **Use in app:** Export a scored measure as a FHIR QuestionnaireResponse with no identifiers
- **Phase:** 4
- **Privacy rule:** No identifiers in resources

## MedlinePlus Connect
- **Category:** Psychoeducation
- **Endpoint / docs:** https://connect.medlineplus.gov/service
- **Access / terms:** Free. Credit MedlinePlus.gov; no logo or implied endorsement
- **Use in app:** Plain-language pages matched by ICD-10-CM code, in English or Spanish
- **Phase:** 2
- **Privacy rule:** Send code only

## MedlinePlus Health Topics web service
- **Category:** Psychoeducation
- **Endpoint / docs:** https://medlineplus.gov/about/developers/webservices/
- **Access / terms:** Free
- **Use in app:** Keyword search of health topics for client mode
- **Phase:** 2
- **Privacy rule:** Curated keywords only

## RxNorm / RxTerms (NLM)
- **Category:** Medications
- **Endpoint / docs:** https://rxnav.nlm.nih.gov/REST
- **Access / terms:** Free
- **Use in app:** Psychotropic names for medication-referral education (clinician mode)
- **Phase:** 3
- **Privacy rule:** Drug names only

## openFDA drug labels
- **Category:** Medications
- **Endpoint / docs:** https://api.fda.gov/drug/label.json
- **Access / terms:** Free; API key optional
- **Use in app:** Boxed warnings and label info for clinician reference
- **Phase:** 3
- **Privacy rule:** Drug names only
- **Also used by:** /medications/effects label check (round 4): the same /api/drug-label route with a curated medication id; the browser only filters the returned boxed-warning and warnings text for mood, behavior, sleep and thinking sentences. No new upstream call.

## NPPES NPI Registry
- **Category:** Referrals
- **Endpoint / docs:** https://npiregistry.cms.hhs.gov/api/?version=2.1
- **Access / terms:** Free. Max 200 results per request, 1,200 per query
- **Use in app:** Find psychiatrists, psychiatric NPs, psychologists, LPCs, LCSWs and LMFTs by taxonomy and ZIP
- **Phase:** 2
- **Privacy rule:** ZIP or city only

## FindTreatment.gov API (SAMHSA)
- **Category:** Referrals
- **Endpoint / docs:** https://findtreatment.gov/assets/FindTreatment-Developer-Guide.pdf
- **Access / terms:** Documented for approved users. Request access
- **Use in app:** Mental-health and SUD treatment facilities near a location
- **Phase:** 2
- **Privacy rule:** Location only. Show a "call to confirm" note (known data-quality issues)

## HRSA data.hrsa.gov web services
- **Category:** Referrals
- **Endpoint / docs:** https://data.hrsa.gov/data/services
- **Access / terms:** Free with registration
- **Use in app:** Sliding-fee health centers by state, county or ZIP
- **Phase:** 2
- **Privacy rule:** Location only

## 988 Lifeline / findahelpline.com
- **Category:** Crisis
- **Endpoint / docs:** https://988lifeline.org; https://findahelpline.com
- **Access / terms:** Link out (API by partnership)
- **Use in app:** Crisis button, US and international
- **Phase:** 1
- **Privacy rule:** No data sent

## WHO Global Health Observatory
- **Category:** Statistics
- **Endpoint / docs:** https://www.who.int/data/gho/info/gho-odata-api
- **Access / terms:** Public OData API. WHO announced a replacement implementation; confirm the current endpoint
- **Use in app:** Global statistic cards
- **Phase:** 3
- **Privacy rule:** No data sent

## NIMH statistics / SAMHSA NSDUH
- **Category:** Statistics
- **Endpoint / docs:** https://www.nimh.nih.gov/health/statistics
- **Access / terms:** Public domain
- **Use in app:** US statistic cards (curated, dated)
- **Phase:** 1
- **Privacy rule:** Static content

## PubMed E-utilities
- **Category:** Evidence
- **Endpoint / docs:** https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
- **Access / terms:** Free; API key raises rate limit
- **Use in app:** Evidence links on each intervention (clinician mode)
- **Phase:** 3
- **Privacy rule:** Curated search terms only

## LactMed (NCBI Bookshelf, via E-utilities)
- **Category:** Medications
- **Endpoint / docs:** https://eutils.ncbi.nlm.nih.gov/entrez/eutils/ (`db=books`, term `"<ingredient>"[title] AND lactmed[book]`); database https://www.ncbi.nlm.nih.gov/books/NBK501922/
- **Access / terms:** Free. Same NCBI E-utilities rules as PubMed (3 requests/second per IP without a key, `tool` on every request, `email` only if the operator sets NCBI_EMAIL); the adapter shares the PubMed limiter. NLM: information created by or for the US government is in the public domain, with acknowledgment requested (checked 2026-11-27). The Bookshelf web pages answer automated clients with a challenge, so only E-utilities is called.
- **Use in app:** `/api/lactmed` returns the LactMed record title and NCBI link for one curated medication (clinician mode, education only, "discuss with the prescriber"), plus a link to LactMed itself. Record text is not fetched or shown. Cached 7 days.
- **Phase:** 3
- **Privacy rule:** Curated drug (ingredient) names only. Substance-use treatment medicines follow ALLOW_SUD_REFERENCE_LOOKUPS.

## AGS Beers Criteria (American Geriatrics Society)
- **Category:** Medications
- **Endpoint / docs:** https://doi.org/10.1111/jgs.18372 (2023 update; PubMed 37139824)
- **Access / terms:** Copyrighted by AGS; recorded as "not-licensed" in content/licenses.json. Never reproduced or paraphrased
- **Use in app:** Link out only, next to the older-adult cautions already in content/medications.json (falls and confusion with benzodiazepines, anticholinergic effects, hyponatremia with SSRIs) and from the older-adults population profile
- **Phase:** 3
- **Privacy rule:** Link only

## Measures with license pending (link-out only)
- **Category:** Measures
- **Endpoint / docs:** content/licenses.json (status "pending", publisher terms and a source for each)
- **Access / terms:** Only GAD-7 and PHQ-9 are built in. EPDS, GDS-15, Mini-Cog, GAI, MoCA, PC-PTSD-5, PEG, RHS-15, AQ-10, ProQOL, DRSP, PHQ-2, GAD-2, PHQ-4, ASQ, AUDIT-C, WHO-5, K6/K10, DASS-21, CORE-10, PROMIS, WSAS, WHODAS 2.0, NEQ, ORS/SRS, WAI-SR, PGSI, FTND, MGH-HPS, Danger Assessment, HCR-20, MITI, CTS-R, the ASAM Criteria and LOCUS stay link-outs until the owner confirms terms in writing (G7)
- **Use in app:** Named in practice guides, population profiles, formulations, legal topics and condition cards with a link to the publisher
- **Phase:** 2–3
- **Privacy rule:** Link only; nothing is scored or stored

## ClinicalTrials.gov API v2
- **Category:** Evidence
- **Endpoint / docs:** https://clinicaltrials.gov/api/v2/studies
- **Access / terms:** Free
- **Use in app:** Recruiting trials by condition (clinician mode)
- **Phase:** 3
- **Privacy rule:** Condition term only

## NICE, APA Div. 12, WHO mhGAP, NCCIH
- **Category:** Evidence
- **Endpoint / docs:** nice.org.uk; div12.org; who.int/mhgap; nccih.nih.gov
- **Access / terms:** Link only
- **Use in app:** Evidence ratings, global guidance, complementary-care evidence
- **Phase:** 2–3
- **Privacy rule:** Link only

## TherapistAid, CCI, Get Self Help, PHQ Screeners
- **Category:** Worksheets
- **Endpoint / docs:** therapistaid.com; cci.health.wa.gov.au; getselfhelp.co.uk; phqscreeners.com
- **Access / terms:** Link only (each site's terms)
- **Use in app:** Handout link-outs
- **Phase:** 2
- **Privacy rule:** Link only

## Vercel hosting
- **Category:** Infrastructure
- **Endpoint / docs:** https://vercel.com
- **Access / terms:** HIPAA BAA for Pro teams as a paid add-on
- **Use in app:** Hosting once accounts exist
- **Phase:** 4
- **Privacy rule:** BAA before any account data

## Owner decisions (recorded)
- **2026-11-26 — 42 CFR Part 2 reference lookups ALLOWED.** The owner approved sending curated substance-use
  reference values (SUD ICD-10-CM/ICD-11 codes, curated terms, AUD medication names, addiction-counselor taxonomy,
  location) to the public reference APIs above. Nothing typed by the clinician and no client data is ever sent.
  Enabled with the server-only env var `ALLOW_SUD_REFERENCE_LOOKUPS=true` (set in render.yaml).
- **2026-11-26 — Part 2 notice wording updated** to the current regulatory text:
  "42 CFR Part 2 prohibits unauthorized use or disclosure of these records." (2024 Final Rule, 42 CFR 2.32).
