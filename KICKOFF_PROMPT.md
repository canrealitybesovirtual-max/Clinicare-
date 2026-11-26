# Paste this into Claude Code

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
