---
description: Add a new condition to the knowledge base (original wording, sources, measures, interventions, handouts)
argument-hint: <condition name>
---
Add the condition "$ARGUMENTS" to the content library.

1. Use the clinical-content-writer subagent to draft content/conditions/<slug>.json with original clinical features, synonyms, weights, duration and exclusion gates, specifiers, differentials, ICD-10-CM codes (check them with the NLM Clinical Tables API) and ICD-11 codes, cultural notes, linked measures (confirmed licenses only), interventions, handouts and dated stats.
2. Validate against the zod schema.
3. Add scoring unit tests: one clear case, one comorbid case, one "rule-out" case (substance or medical), and one "not enough information" case.
4. Run /guardrail-check.
5. Set reviewedBy to "PENDING" and list what a licensed clinician must review.
