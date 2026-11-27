/**
 * Cross-cutting plan modules (content/plans/modules), formulation targets on objectives, stepped-care tags and the
 * builder model that adds modules to a draft. Checks the safety rules: nothing is preselected (G3), substance-use
 * items always bring the 42 CFR Part 2 notice (G6), nothing rates risk (G9), crisis info is never hidden, exports carry
 * no identifiers (G5), and content cross-references resolve (G10).
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import { measures } from "@/lib/content";
import { FORMULATION_TARGET_IDS, formulationFactors, formulations } from "@/lib/formulations";
import { allHandouts, getPlanLibrary, interventions, planLibraries } from "@/lib/library";
import { getPlanModule, modulesFor, planContentProblems, planModules } from "@/lib/plan-modules";
import { CARE_STEPS, planTextOf } from "@/lib/schemas-phase2";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import { scrubPHI } from "@/lib/phi-scrubber";
import {
  PLAN_FOOTER,
  PLAN_FORMULATION_HEADING,
  PLAN_NAME_LINE,
  PLAN_PART2_NOTICE,
  planDocx,
  planOutlineText,
  planPdf,
  planPdfPageLines,
} from "@/lib/plan-export";
import {
  addModule,
  createDraft,
  formulationCoverage,
  moduleHasSelections,
  removeModule,
  toPlanExport,
  toggleFormulationTarget,
  toggleIntervention,
  toggleItem,
  toggleObjectiveTarget,
  toggleProblem,
  type FormulationTargetOption,
  type MeasureOption,
  type PlanDraft,
  type PlanLibraryOption,
} from "@/components/plan/plan-model";

const MODULE_DIR = path.resolve(__dirname, "../../content/plans/modules");
const MEASURES: MeasureOption[] = measures.map((m) => ({ id: m.id, shortName: m.shortName, name: m.name }));
const TARGETS: FormulationTargetOption[] = formulationFactors.map((f) => ({ id: f.id, label: f.label, plainLabel: f.plainLabel, kind: f.kind }));
const NAMES = new Map(interventions.map((i) => [i.id, { name: i.name }] as const));

/** Identifier labels that must never appear on an export (the blank "Name:" line is the only personal field). */
const IDENTIFIER_LABELS =
  /\b(?:DOB|date of birth|birth ?date|address|phone|telephone|fax|e-?mail|MRN|medical record(?: number)?|record number|SSN|social security(?: number)?|insurance(?: id)?|member id|policy number|zip(?: code)?|client id|patient id|date)\s*:/i;
/** Risk wording that would read as the tool rating or deciding risk (G9). */
const RISK_RATING = /\b(?:low|moderate|medium|high|elevated|imminent)[- ]risk\b|\brisk (?:level|score|rating|category)\b/i;
const BANNED = [/\bcriterion\b/i, /DSM-5(-TR)?\s+(diagnostic\s+)?criteria/i, /\bmeets (the )?(full )?criteria\b/i, /\bthe diagnosis is\b/i, /homeopath/i, /HIPAA[ -]certified/i];

function option(conditionId: string, label: string, sud = false): PlanLibraryOption {
  const library = getPlanLibrary(conditionId);
  if (!library) throw new Error(`missing plan library ${conditionId}`);
  return { conditionId, label, sud, library, icd10cm: [], icd11: [] };
}
const mdd = option("major-depressive-disorder", "Major depressive disorder");

const moduleOf = (id: string) => {
  const m = getPlanModule(id);
  if (!m) throw new Error(`missing module ${id}`);
  return m;
};

/** Check every item of one draft problem, and link the first suggested intervention of each objective. */
function selectAll(d: PlanDraft, problemId: string): PlanDraft {
  const p = d.problems.find((x) => x.id === problemId)!;
  let next = toggleProblem(d, p.id, true);
  for (const i of p.definitions) next = toggleItem(next, p.id, "definitions", i.id, true);
  for (const i of p.goals) next = toggleItem(next, p.id, "goals", i.id, true);
  for (const o of p.objectives) {
    next = toggleItem(next, p.id, "objectives", o.id, true);
    if (o.suggestedInterventionIds[0]) next = toggleIntervention(next, p.id, o.id, o.suggestedInterventionIds[0], true);
  }
  return next;
}

const exportOf = (d: PlanDraft, opt = mdd) => toPlanExport(d, { option: opt, interventions: NAMES, measures: MEASURES, modules: planModules, targets: TARGETS });

describe("plan module content", () => {
  it("loads every file in content/plans/modules, with ids that match the file names", () => {
    const files = readdirSync(MODULE_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .sort();
    expect(planModules.map((m) => m.id).sort()).toEqual(files);
  });

  it("has the planned modules", () => {
    for (const id of [
      "suicide-and-self-harm-safety",
      "sleep-disturbance",
      "substance-use-as-coping",
      "engagement-and-attendance",
      "maintenance-and-ending",
      "care-coordination-and-social-needs",
      "psychosocial-problems",
      "perfectionism-self-esteem-procrastination",
      "perinatal-adaptations",
      "work-stress-and-return-to-work",
      "chronic-pain-with-mood-or-anxiety",
      "progress-review-and-stepping-up",
    ])
      expect(getPlanModule(id), id).toBeDefined();
  });

  it("cross-references resolve for every library and module (targets, links, interventions, measures, Part 2, unique ids)", () => {
    const problems = planContentProblems(planLibraries, planModules, {
      interventions: new Map(interventions.map((i) => [i.id, i] as const)),
      measures: new Set(measures.map((m) => m.id)),
      conditions: new Set(planLibraries.map((l) => l.conditionId)),
      handouts: new Set(allHandouts.map((h) => h.id)),
      sudHandouts: new Set(allHandouts.filter((h) => h.sud).map((h) => h.id)),
      formulationTargets: new Set(FORMULATION_TARGET_IDS),
      formulations: new Set(formulations.map((f) => f.id)),
    });
    expect(problems).toEqual([]);
  });

  it("flags unknown targets, untagged substance wording and problem ids shared with a library", () => {
    const base = moduleOf("sleep-disturbance");
    const bad = {
      ...base,
      problems: [
        {
          ...base.problems[0]!,
          id: planLibraries[0]!.problems[0]!.id,
          shortTermObjectives: [
            { ...base.problems[0]!.shortTermObjectives[0]!, targets: ["not-a-target"] },
            { ...base.problems[0]!.shortTermObjectives[1]!, text: "Cut down drinking before bed on 5 nights a week for 4 weeks.", sud: false },
            ...base.problems[0]!.shortTermObjectives.slice(2),
          ],
        },
      ],
    };
    const problems = planContentProblems(planLibraries, [bad], {
      interventions: new Map(interventions.map((i) => [i.id, i] as const)),
      measures: new Set(measures.map((m) => m.id)),
      conditions: new Set(),
      handouts: new Set(allHandouts.map((h) => h.id)),
      sudHandouts: new Set(),
      formulationTargets: new Set(FORMULATION_TARGET_IDS),
      formulations: new Set(),
    }).join("\n");
    expect(problems).toMatch(/unknown formulation target not-a-target/);
    expect(problems).toMatch(/untagged substance-use wording/);
    expect(problems).toMatch(/is also used by plans\//);
  });

  it("uses original wording guards and never rates or decides risk (G1, G3, G9)", () => {
    for (const m of planModules) {
      const body = JSON.stringify(m);
      for (const re of BANNED) expect(body, `${m.id} ${re}`).not.toMatch(re);
      // Source titles and ids may name risk categories (a guideline on high-risk drinking, a high-risk situations
      // handout); the plan wording itself may not.
      const wording = [m.title, m.summary, m.collaborativeNote, ...m.problems.flatMap((p) => [p.label, ...[...p.definitions, ...p.longTermGoals].map(planTextOf), ...p.shortTermObjectives.map((o) => o.text)])];
      for (const text of wording) expect(text, m.id).not.toMatch(RISK_RATING);
    }
    const safety = moduleOf("suicide-and-self-harm-safety");
    expect(safety.crisisPanel).toBe(true);
    expect(safety.collaborativeNote).toMatch(/988/);
    expect(safety.collaborativeNote).toMatch(/findahelpline\.com/);
    for (const p of safety.problems)
      for (const o of p.shortTermObjectives) if (/\brisk\b/i.test(o.text)) expect(o.text, o.id).toMatch(/clinician/i);
  });

  it("passes every module problem, definition, goal and objective through the PHI scrubber unchanged (G5)", () => {
    const changed = planModules.flatMap((m) =>
      m.problems.flatMap((p) => [p.label, ...p.definitions.map(planTextOf), ...p.longTermGoals.map(planTextOf), ...p.shortTermObjectives.map((o) => o.text)]),
    ).filter((t) => scrubPHI(t).clean !== t);
    expect(changed).toEqual([]);
  });

  it("keeps substance-use wording in the substance-use module (or tagged), with the exact Part 2 notice (G6)", () => {
    const sud = moduleOf("substance-use-as-coping");
    expect(sud.sud).toBe(true);
    expect(sud.collaborativeNote).toContain(PLAN_PART2_NOTICE);
    for (const m of planModules.filter((x) => !x.sud))
      for (const p of m.problems)
        for (const o of p.shortTermObjectives) if (mentionsSubstanceUse(o.text)) expect(o.sud, `${m.id} ${o.id}`).toBe(true);
  });

  it("gives every psychosocial problem reference Z codes from the social-circumstance chapters", () => {
    const psy = moduleOf("psychosocial-problems");
    expect(psy.problems.length).toBeGreaterThanOrEqual(6);
    for (const p of psy.problems) {
      expect(p.zCodes?.length, p.id).toBeGreaterThan(0);
      for (const z of p.zCodes ?? []) expect(z.code, p.id).toMatch(/^Z(?:5[5-9]|6[0-5]|69|73|91)\.\w+$/);
    }
    expect(moduleOf("work-stress-and-return-to-work").problems[0]!.zCodes?.map((z) => z.code)).toContain("Z73.0");
  });

  it("tags objectives with care levels from the fixed list, and extended libraries use them", () => {
    const steps = new Set<string>(CARE_STEPS);
    for (const holder of [...planLibraries, ...planModules])
      for (const p of holder.problems) for (const o of p.shortTermObjectives) if (o.step) expect(steps.has(o.step)).toBe(true);
    for (const id of ["major-depressive-disorder", "ptsd", "generalized-anxiety-disorder", "alcohol-use-disorder", "borderline-personality-disorder"]) {
      const tagged = getPlanLibrary(id)!.problems.flatMap((p) => p.shortTermObjectives).filter((o) => o.step && o.targets?.length);
      expect(tagged.length, id).toBeGreaterThan(5);
    }
  });

  it("offers alternatives across orientations in the depression, PTSD and GAD libraries", () => {
    const ivs = (id: string) => new Set(getPlanLibrary(id)!.problems.flatMap((p) => p.shortTermObjectives.flatMap((o) => o.interventionIds)));
    const mddIv = ivs("major-depressive-disorder");
    for (const iv of ["interpersonal-psychotherapy", "short-term-psychodynamic-exploration", "counselling-for-depression", "mindfulness-based-cognitive-therapy", "cbasp-situational-analysis", "rumination-focused-cbt", "medication-referral", "collaborative-safety-planning"])
      expect(mddIv.has(iv), iv).toBe(true);
    const ptsdIv = ivs("ptsd");
    for (const iv of ["imagery-rehearsal-therapy", "cognitive-therapy-for-ptsd", "present-centered-therapy", "stress-inoculation-training", "integrated-ptsd-sud-treatment", "stair-skills-training"])
      expect(ptsdIv.has(iv), iv).toBe(true);
    const gadIv = ivs("generalized-anxiety-disorder");
    for (const iv of ["metacognitive-therapy", "intolerance-of-uncertainty-cbt", "act-acceptance-willingness", "guided-self-help", "unified-protocol"]) expect(gadIv.has(iv), iv).toBe(true);
    // The PTSD substance-use problem is tagged so that choosing it brings the Part 2 notice.
    const ptsdSud = getPlanLibrary("ptsd")!.problems.find((p) => p.id === "ptsd-co-occurring-substance-use")!;
    expect(ptsdSud.shortTermObjectives.every((o) => o.sud)).toBe(true);
  });
});

describe("adding modules to a draft", () => {
  it("lists general modules for every library and condition-specific ones only where they apply", () => {
    const forMdd = modulesFor("major-depressive-disorder").map((m) => m.id);
    expect(forMdd).toContain("perinatal-adaptations");
    expect(forMdd[0]).toBe("chronic-pain-with-mood-or-anxiety"); // condition-specific modules come first
    expect(modulesFor("schizophrenia").map((m) => m.id)).not.toContain("perinatal-adaptations");
    const sz = createDraft(option("schizophrenia", "Schizophrenia"), MEASURES);
    expect(addModule(sz, moduleOf("perinatal-adaptations"), MEASURES)).toBe(sz);
  });

  it("adds a module's problems unchecked, once, and removes them only while nothing is chosen", () => {
    const safety = moduleOf("suicide-and-self-harm-safety");
    let d = addModule(createDraft(mdd, MEASURES), safety, MEASURES);
    const added = d.problems.filter((p) => p.moduleId === safety.id);
    expect(added).toHaveLength(safety.problems.length);
    expect(added.every((p) => !p.label.selected && p.objectives.every((o) => !o.selected && o.interventionIds.length === 0))).toBe(true);
    expect(addModule(d, safety, MEASURES)).toBe(d);
    d = toggleProblem(d, added[0]!.id, true);
    expect(moduleHasSelections(d, safety.id)).toBe(true);
    expect(removeModule(d, safety.id)).toBe(d);
    d = toggleProblem(d, added[0]!.id, false);
    const removed = removeModule(d, safety.id);
    expect(removed.problems.some((p) => p.moduleId === safety.id)).toBe(false);
    expect(removed.moduleIds).toEqual([]);
  });

  it("tags every item of the substance-use module, so the export carries the Part 2 notice (G6)", () => {
    const sud = moduleOf("substance-use-as-coping");
    let d = addModule(createDraft(mdd, MEASURES), sud, MEASURES);
    const p = d.problems.find((x) => x.moduleId === sud.id)!;
    expect([p.label, ...p.definitions, ...p.goals, ...p.objectives].every((i) => i.sud)).toBe(true);
    expect(exportOf(d).sud).toBe(false); // added but nothing chosen
    d = toggleProblem(d, p.id, true);
    d = toggleItem(d, p.id, "goals", p.goals[0]!.id, true);
    const plan = exportOf(d);
    expect(plan.sud).toBe(true);
    expect(planOutlineText(plan)).toContain(PLAN_PART2_NOTICE);
  });

  it("carries the Part 2 notice for the tagged opioid objective of the chronic pain module only", () => {
    const pain = moduleOf("chronic-pain-with-mood-or-anxiety");
    let d = addModule(createDraft(mdd, MEASURES), pain, MEASURES);
    const p = d.problems.find((x) => x.moduleId === pain.id)!;
    d = toggleProblem(d, p.id, true);
    const untagged = p.objectives.find((o) => !o.sud)!;
    expect(exportOf(toggleItem(d, p.id, "objectives", untagged.id, true)).sud).toBe(false);
    const tagged = p.objectives.find((o) => o.sud)!;
    expect(exportOf(toggleItem(d, p.id, "objectives", tagged.id, true)).sud).toBe(true);
  });

  it("exports module problems with Z codes, care levels, module notes and module sources", () => {
    const psy = moduleOf("psychosocial-problems");
    let d = addModule(createDraft(mdd, MEASURES), psy, MEASURES);
    d = selectAll(d, "psy-housing");
    const plan = exportOf(d);
    const housing = plan.problems.find((p) => /housing/i.test(p.label))!;
    expect(housing.zCodes?.join(" ")).toMatch(/Z59\.811 \(Housing instability/);
    expect(housing.objectives.some((o) => o.careLevel === "Low intensity")).toBe(true);
    expect(plan.moduleNotes?.map((m) => m.title)).toEqual([psy.title]);
    for (const s of psy.sources) expect(plan.sources.some((x) => x.url === s.url), s.url).toBe(true);
    const text = planOutlineText(plan).join("\n");
    expect(text).toMatch(/Reference Z codes to confirm through your own assessment \(circumstances, not a diagnosis\): Z59\.811/);
    expect(text).toMatch(/Usual level of care: Low intensity/);
    expect(text).not.toMatch(IDENTIFIER_LABELS);
    // A module that was added but contributes nothing chosen adds no note and no sources.
    const other = addModule(d, moduleOf("engagement-and-attendance"), MEASURES);
    expect(exportOf(other).moduleNotes?.map((m) => m.title)).toEqual([psy.title]);
  });
});

describe("formulation step and target links", () => {
  it("ignores coverage when the optional step is skipped", () => {
    const d = selectAll(createDraft(mdd, MEASURES), "mdd-withdrawal-and-low-mood");
    expect(formulationCoverage(d)).toEqual({ targets: [], unlinked: [] });
    expect(exportOf(d).formulation).toBeUndefined();
    expect(planOutlineText(exportOf(d))).not.toContain(PLAN_FORMULATION_HEADING);
  });

  it("maps tapped targets to the chosen objectives that work on them, and flags gaps both ways", () => {
    let d = createDraft(mdd, MEASURES);
    d = toggleFormulationTarget(d, "low-reward-engagement", true);
    d = toggleFormulationTarget(d, "trauma-memory-intrusions", true);
    d = selectAll(d, "mdd-withdrawal-and-low-mood");
    const cov = formulationCoverage(d);
    const reward = cov.targets.find((t) => t.id === "low-reward-engagement")!;
    expect(reward.refs[0]).toBe("Problem 1, objective 1");
    expect(cov.targets.find((t) => t.id === "trauma-memory-intrusions")!.refs).toEqual([]);
    // The measure-tracking objective carries no target, so it is listed as not linked.
    const tracking = cov.unlinked.find((u) => u.objectiveId.endsWith("mdd-phq9-tracking"))!;
    expect(tracking).toBeDefined();
    // Linking it by hand moves it out of the unlinked list.
    d = toggleObjectiveTarget(d, tracking.problemId, tracking.objectiveId, "low-reward-engagement", true);
    expect(formulationCoverage(d).unlinked.some((u) => u.objectiveId === tracking.objectiveId)).toBe(false);
  });

  it("exports a formulation summary for clinician review with no identifiers or diagnosis wording", async () => {
    let d = createDraft(mdd, MEASURES);
    for (const t of ["low-reward-engagement", "sleep-rhythm-disruption", "strengths-and-supports"]) d = toggleFormulationTarget(d, t, true);
    d = selectAll(d, "mdd-withdrawal-and-low-mood");
    d = selectAll(d, "mdd-sleep-and-energy");
    const plan = exportOf(d);
    const text = planOutlineText(plan);
    const joined = text.join("\n");
    expect(text).toContain(PLAN_FORMULATION_HEADING);
    expect(joined).toMatch(/Low engagement with rewarding activity \(keeps difficulties going\)/);
    expect(joined).toMatch(/Worked on in: Problem 1, objective 1/);
    expect(joined).not.toMatch(IDENTIFIER_LABELS);
    // The summary itself carries no diagnosis wording (source titles at the end may name a condition).
    const summary = text.slice(text.indexOf(PLAN_FORMULATION_HEADING), text.findIndex((t) => /^Problem 1:/.test(t)));
    expect(summary.length).toBeGreaterThan(3);
    expect(summary.join("\n")).not.toMatch(/\bdiagnosed\b|\bdiagnosis\s*:/i);
    expect(text.filter((t) => /^Name:/.test(t))).toEqual([PLAN_NAME_LINE]);

    const bytes = await planPdf(plan);
    const doc = await PDFDocument.load(bytes);
    const pages = planPdfPageLines(plan);
    expect(doc.getPageCount()).toBe(pages.length);
    pages.forEach((lines, i) => {
      expect(lines).toContain(PLAN_FOOTER);
      expect(lines).toContain(`Page ${i + 1} of ${pages.length}`);
    });
    const docx = unzipSync(await planDocx(plan));
    expect(strFromU8(docx["word/document.xml"]!)).toContain("Formulation summary (for clinician review)");
  });

  it("prints the Part 2 notice in every PDF and DOCX footer when a substance-use module item is chosen", async () => {
    const sud = moduleOf("substance-use-as-coping");
    let d = addModule(createDraft(mdd, MEASURES), sud, MEASURES);
    d = selectAll(d, "suc-coping-with-substances");
    const plan = exportOf(d);
    for (const lines of planPdfPageLines(plan)) expect(lines.join(" ")).toContain(PLAN_PART2_NOTICE);
    const files = unzipSync(await planDocx(plan));
    const footers = Object.keys(files)
      .filter((n) => /^word\/footer\d*\.xml$/.test(n))
      .map((n) => strFromU8(files[n]!))
      .join("\n");
    expect(footers).toContain(PLAN_PART2_NOTICE);
  });
});
