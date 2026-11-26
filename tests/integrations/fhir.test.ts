import { afterEach, describe, expect, it, vi } from "vitest";
import { getMeasure } from "@/lib/content";
import { scoreMeasure } from "@/lib/measures";
import type { Measure } from "@/lib/schemas";
import {
  DISPLAY_URL,
  FHIR_JSON_MIME,
  FORBIDDEN_KEYS,
  FhirExportUnavailable,
  FhirIdentifierError,
  ITEM_WEIGHT_URL,
  LOINC_DIFFICULTY_ANSWERS,
  LOINC_FREQUENCY_ANSWERS,
  LOINC_NOTICE,
  LOINC_PANELS,
  LOINC_SYSTEM,
  ORDINAL_VALUE_URL,
  UCUM_SYSTEM,
  answersFromQuestionnaireResponse,
  buildQuestionnaireResponse,
  describeFhirExport,
  findIdentifierProblems,
  questionnaireResponseBytes,
  questionnaireResponseFilename,
  serializeQuestionnaireResponse,
  validateNoIdentifiers,
  type QuestionnaireResponse,
} from "@/lib/fhir";

function measure(id: string): Measure {
  const m = getMeasure(id);
  if (!m) throw new Error(`missing measure ${id}`);
  return m;
}
const GAD7 = measure("gad-7");
const PHQ9 = measure("phq-9");

const GAD7_ITEMS = ["69725-0", "68509-9", "69733-4", "69734-2", "69735-9", "69689-8", "69736-7"];
const PHQ9_ITEMS = ["44250-9", "44255-8", "44259-0", "44254-1", "44251-7", "44258-2", "44252-5", "44253-3", "44260-8"];
const CODE_FOR_SCORE = ["LA6568-5", "LA6569-3", "LA6570-1", "LA6571-9"];

/** Every key at any depth, with its path. */
function allKeys(node: unknown, path = ""): { key: string; path: string }[] {
  if (node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((v, i) => allKeys(v, `${path}[${i}]`));
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => [
    { key: k, path: path ? `${path}.${k}` : k },
    ...allKeys(v, path ? `${path}.${k}` : k),
  ]);
}

/** Every string leaf. */
function allStrings(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node === null || typeof node !== "object") return [];
  return (Array.isArray(node) ? node : Object.values(node as Record<string, unknown>)).flatMap(allStrings);
}

function items(qr: QuestionnaireResponse) {
  return qr.item ?? [];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FHIR QuestionnaireResponse: structure", () => {
  it("builds a completed GAD-7 response that references the LOINC panel", () => {
    const answers = [0, 1, 2, 3, 0, 1, 2];
    const qr = buildQuestionnaireResponse(GAD7, answers);
    expect(qr.resourceType).toBe("QuestionnaireResponse");
    expect(qr.questionnaire).toBe("http://loinc.org/q/69737-5");
    expect(qr._questionnaire).toEqual({ extension: [{ url: DISPLAY_URL, valueString: GAD7.name }] });
    expect(qr.status).toBe("completed");
    expect(qr.language).toBe("en");
    expect(qr.authored).toBeUndefined();
    expect(Object.keys(qr).sort()).toEqual(["_questionnaire", "item", "language", "questionnaire", "resourceType", "status"]);

    const list = items(qr);
    expect(list.map((i) => i.linkId)).toEqual(["1", "2", "3", "4", "5", "6", "7", "70274-6"]);
    GAD7.items.forEach((it, i) => {
      const item = list[i]!;
      expect(item.text).toBe(it.text);
      expect(item.answer).toHaveLength(1);
      const a = item.answer![0]!;
      const v = answers[i]!;
      expect(a.valueCoding).toEqual({
        extension: [{ url: ORDINAL_VALUE_URL, valueDecimal: v }],
        system: LOINC_SYSTEM,
        code: CODE_FOR_SCORE[v],
        display: GAD7.options[v]!.label,
      });
      expect(a.extension).toEqual([{ url: ITEM_WEIGHT_URL, valueDecimal: v }]);
      expect(a.valueInteger).toBeUndefined();
    });
  });

  it("builds a completed PHQ-9 response with item 9 included and the PHQ-9 total", () => {
    const answers = [1, 1, 2, 0, 3, 1, 0, 2, 1];
    const qr = buildQuestionnaireResponse(PHQ9, answers);
    expect(qr.questionnaire).toBe("http://loinc.org/q/44249-1");
    expect(qr.status).toBe("completed");
    const list = items(qr);
    expect(list.map((i) => i.linkId)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "44261-6"]);
    const item9 = list.find((i) => i.linkId === "9")!;
    expect(item9.text).toBe(PHQ9.items[8]!.text);
    expect(item9.answer![0]!.valueCoding!.code).toBe("LA6569-3");
    expect(item9.answer![0]!.valueCoding!.display).toBe("Several days");
    const total = list.at(-1)!;
    expect(total.text).toBe("PHQ-9 total score");
    expect(total.answer).toEqual([{ valueQuantity: { value: 11, unit: "{score}", system: UCUM_SYSTEM, code: "{score}" } }]);
  });

  it("exports item 9 exactly as answered, including 'Not at all' and 'Nearly every day'", () => {
    for (const v of [0, 3]) {
      const answers = [0, 0, 0, 0, 0, 0, 0, 0, v];
      const item9 = items(buildQuestionnaireResponse(PHQ9, answers)).find((i) => i.linkId === "9");
      expect(item9).toBeDefined();
      expect(item9!.answer![0]!.valueCoding!.code).toBe(CODE_FOR_SCORE[v]);
      expect(item9!.answer![0]!.valueCoding!.extension).toEqual([{ url: ORDINAL_VALUE_URL, valueDecimal: v }]);
    }
  });

  it("states no severity band, diagnosis or risk decision", () => {
    const qr = buildQuestionnaireResponse(PHQ9, [3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const text = JSON.stringify(qr);
    for (const band of PHQ9.scoring.bands) expect(text).not.toContain(band.clinicianNote);
    for (const r of PHQ9.riskItems) expect(text).not.toContain(r.message);
    expect(text).not.toMatch(/"(Severe|Moderately severe|Moderate|Mild|None-minimal)"/);
    expect(text).not.toMatch(/F\d{2}\.\d|6A70|6B00|diagnos/i);
  });

  it("uses only strings from the measure content, LOINC and fixed FHIR constants (nothing typed)", () => {
    for (const m of [GAD7, PHQ9]) {
      const answers = m.items.map((_, i) => i % 4);
      const qr = buildQuestionnaireResponse(m, answers, { authoredDate: true, now: new Date(2026, 10, 26), functional: 1 });
      const allowed = new Set<string>([
        "QuestionnaireResponse",
        "en",
        "completed",
        "in-progress",
        "2026-11-26",
        `http://loinc.org/q/${m.loinc!.panel}`,
        m.name,
        `${m.shortName} total score`,
        LOINC_SYSTEM,
        UCUM_SYSTEM,
        ORDINAL_VALUE_URL,
        ITEM_WEIGHT_URL,
        DISPLAY_URL,
        "{score}",
        ...m.items.flatMap((it) => [it.id, it.text]),
        ...m.options.map((o) => o.label),
        ...(m.functionalItem ? [m.functionalItem.text] : []),
        ...LOINC_FREQUENCY_ANSWERS.flatMap((a) => [a.code, a.display]),
        ...LOINC_DIFFICULTY_ANSWERS.flatMap((a) => [a.code, a.display]),
        ...Object.values(LOINC_PANELS).flatMap((p) => [p.total, ...(p.functional ? [p.functional.code] : [])]),
      ]);
      for (const s of allStrings(qr)) expect(allowed.has(s), `unexpected string ${JSON.stringify(s)}`).toBe(true);
    }
  });

  it("is deterministic for the same input", () => {
    const a = serializeQuestionnaireResponse(buildQuestionnaireResponse(GAD7, [1, 2, 3, 0, 1, 2, 3]));
    const b = serializeQuestionnaireResponse(buildQuestionnaireResponse(GAD7, [1, 2, 3, 0, 1, 2, 3]));
    expect(a).toBe(b);
  });

  it("makes no network request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    buildQuestionnaireResponse(PHQ9, [1, 1, 1, 1, 1, 1, 1, 1, 1], { functional: 0, linkIds: "loinc" });
    questionnaireResponseBytes(buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("FHIR QuestionnaireResponse: LOINC codes", () => {
  it("uses the LOINC LL358-3 frequency answers with scores 0-3", () => {
    expect(LOINC_FREQUENCY_ANSWERS).toEqual([
      { code: "LA6568-5", display: "Not at all", score: 0 },
      { code: "LA6569-3", display: "Several days", score: 1 },
      { code: "LA6570-1", display: "More than half the days", score: 2 },
      { code: "LA6571-9", display: "Nearly every day", score: 3 },
    ]);
  });

  it("uses the LOINC 69722-7 difficulty answers (unscored)", () => {
    expect(LOINC_DIFFICULTY_ANSWERS.map((a) => [a.code, a.display, a.score])).toEqual([
      ["LA6572-7", "Not difficult at all", null],
      ["LA6573-5", "Somewhat difficult", null],
      ["LA6575-0", "Very difficult", null],
      ["LA6574-3", "Extremely difficult", null],
    ]);
  });

  it("maps every GAD-7 and PHQ-9 item to its LOINC question code and total code", () => {
    expect(LOINC_PANELS["69737-5"]!.items).toEqual(Object.fromEntries(GAD7_ITEMS.map((c, i) => [String(i + 1), c])));
    expect(LOINC_PANELS["69737-5"]!.total).toBe("70274-6");
    expect(LOINC_PANELS["69737-5"]!.functional).toBeUndefined();
    expect(LOINC_PANELS["44249-1"]!.items).toEqual(Object.fromEntries(PHQ9_ITEMS.map((c, i) => [String(i + 1), c])));
    expect(LOINC_PANELS["44249-1"]!.total).toBe("44261-6");
    expect(LOINC_PANELS["44249-1"]!.functional!.code).toBe("69722-7");
    // Content agrees with the mapping.
    expect(GAD7.loinc).toEqual({ panel: "69737-5", total: "70274-6" });
    expect(PHQ9.loinc).toEqual({ panel: "44249-1", total: "44261-6" });
  });

  it("codes every option of the shipped measures (no uncoded valueInteger fallback)", () => {
    for (const m of [GAD7, PHQ9]) {
      for (const o of m.options) {
        const qr = buildQuestionnaireResponse(m, m.items.map(() => o.value));
        for (const it of items(qr).slice(0, m.items.length)) {
          expect(it.answer![0]!.valueInteger).toBeUndefined();
          expect(it.answer![0]!.valueCoding!.code).toBe(CODE_FOR_SCORE[o.value]);
        }
      }
    }
  });

  it("can use LOINC question codes as linkIds", () => {
    const g = buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0], { linkIds: "loinc" });
    expect(items(g).map((i) => i.linkId)).toEqual([...GAD7_ITEMS, "70274-6"]);
    const p = buildQuestionnaireResponse(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, 2], { linkIds: "loinc" });
    expect(items(p).map((i) => i.linkId)).toEqual([...PHQ9_ITEMS, "44261-6"]);
    expect(items(p).find((i) => i.linkId === "44260-8")!.answer![0]!.valueCoding!.code).toBe("LA6570-1");
  });

  it("falls back to valueInteger for an option LOINC does not define", () => {
    const custom: Measure = { ...GAD7, options: GAD7.options.map((o) => (o.value === 3 ? { ...o, label: "Almost always" } : o)) };
    const qr = buildQuestionnaireResponse(custom, [3, 0, 0, 0, 0, 0, 0]);
    expect(items(qr)[0]!.answer).toEqual([{ valueInteger: 3 }]);
    expect(items(qr)[1]!.answer![0]!.valueCoding!.code).toBe("LA6568-5");
  });
});

describe("FHIR QuestionnaireResponse: completed vs in-progress", () => {
  it("is in-progress with only the answered items and no total when any item is unanswered", () => {
    const qr = buildQuestionnaireResponse(PHQ9, [1, null, 2, null, null, null, null, null, 1]);
    expect(qr.status).toBe("in-progress");
    expect(items(qr).map((i) => i.linkId)).toEqual(["1", "3", "9"]);
    expect(items(qr).some((i) => i.linkId === "44261-6")).toBe(false);
  });

  it("treats a short answers array as in-progress", () => {
    const qr = buildQuestionnaireResponse(GAD7, [1, 1, 1]);
    expect(qr.status).toBe("in-progress");
    expect(items(qr)).toHaveLength(3);
  });

  it("omits item entirely when nothing is answered (no empty arrays)", () => {
    const qr = buildQuestionnaireResponse(GAD7, GAD7.items.map(() => null));
    expect(qr.status).toBe("in-progress");
    expect("item" in qr).toBe(false);
    expect(serializeQuestionnaireResponse(qr)).not.toContain("[]");
  });

  it("is completed only when every item is answered", () => {
    expect(buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, null]).status).toBe("in-progress");
    expect(buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0]).status).toBe("completed");
  });

  it("does not let the unscored difficulty answer change status", () => {
    const qr = buildQuestionnaireResponse(PHQ9, [1, 1, null, 1, 1, 1, 1, 1, 1], { functional: 1 });
    expect(qr.status).toBe("in-progress");
    expect(items(qr).find((i) => i.linkId === "69722-7")).toBeDefined();
  });
});

describe("FHIR QuestionnaireResponse: totals", () => {
  it.each([
    ["gad-7", [0, 0, 0, 0, 0, 0, 0], 0],
    ["gad-7", [3, 3, 3, 3, 3, 3, 3], 21],
    ["gad-7", [1, 2, 3, 0, 1, 2, 3], 12],
    ["phq-9", [0, 0, 0, 0, 0, 0, 0, 0, 0], 0],
    ["phq-9", [3, 3, 3, 3, 3, 3, 3, 3, 3], 27],
    ["phq-9", [2, 1, 0, 3, 2, 1, 0, 3, 2], 14],
  ])("%s %j totals %i, matching scoreMeasure", (id, answers, expected) => {
    const m = measure(id);
    const qr = buildQuestionnaireResponse(m, answers);
    const total = items(qr).find((i) => i.linkId === m.loinc!.total)!;
    expect(total.answer![0]!.valueQuantity!.value).toBe(expected);
    expect(total.answer![0]!.valueQuantity!.value).toBe(scoreMeasure(m, answers).total);
    // The total equals the sum of the ordinalValue weights carried on the item answers.
    const sum = items(qr)
      .flatMap((i) => i.answer ?? [])
      .flatMap((a) => a.valueCoding?.extension ?? [])
      .filter((e) => e.url === ORDINAL_VALUE_URL)
      .reduce((s, e) => s + (e.valueDecimal ?? 0), 0);
    expect(sum).toBe(expected);
  });

  it("rejects answers that are not one of the measure's option values", () => {
    expect(() => buildQuestionnaireResponse(GAD7, [4, 0, 0, 0, 0, 0, 0])).toThrow(RangeError);
    expect(() => buildQuestionnaireResponse(GAD7, [-1, 0, 0, 0, 0, 0, 0])).toThrow(RangeError);
    expect(() => buildQuestionnaireResponse(GAD7, [1.5, 0, 0, 0, 0, 0, 0])).toThrow(RangeError);
    expect(() => buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0, 0])).toThrow(RangeError);
    expect(() => buildQuestionnaireResponse(GAD7, [Number.NaN, 0, 0, 0, 0, 0, 0])).toThrow(RangeError);
  });
});

describe("FHIR QuestionnaireResponse: functional difficulty", () => {
  it("adds the PHQ-9 difficulty answer as LOINC 69722-7 when given", () => {
    const qr = buildQuestionnaireResponse(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, 0], { functional: 2 });
    const d = items(qr).find((i) => i.linkId === "69722-7")!;
    expect(d.text).toBe(PHQ9.functionalItem!.text);
    expect(d.answer).toEqual([{ valueCoding: { system: LOINC_SYSTEM, code: "LA6575-0", display: "Very difficult" } }]);
    expect(items(buildQuestionnaireResponse(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, 0])).some((i) => i.linkId === "69722-7")).toBe(false);
  });

  it("maps all four difficulty options", () => {
    const codes = [0, 1, 2, 3].map(
      (f) => items(buildQuestionnaireResponse(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, 0], { functional: f })).find((i) => i.linkId === "69722-7")!
        .answer![0]!.valueCoding!.code,
    );
    expect(codes).toEqual(["LA6572-7", "LA6573-5", "LA6575-0", "LA6574-3"]);
  });

  it("leaves the difficulty answer out of GAD-7, whose LOINC panel does not contain it, and says so", () => {
    const qr = buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0], { functional: 1 });
    expect(items(qr).some((i) => i.linkId === "69722-7")).toBe(false);
    const info = describeFhirExport(GAD7);
    expect(info).toMatchObject({ available: true, questionnaire: "http://loinc.org/q/69737-5", includesFunctionalItem: false });
    expect(info.note).toMatch(/not part of the LOINC GAD-7 panel/);
    expect(describeFhirExport(PHQ9)).toMatchObject({ available: true, includesFunctionalItem: true, note: undefined });
  });

  it("rejects an out-of-range difficulty answer", () => {
    expect(() => buildQuestionnaireResponse(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, 0], { functional: 4 })).toThrow(RangeError);
    expect(() => buildQuestionnaireResponse(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, 0], { functional: -1 })).toThrow(RangeError);
    expect(() => buildQuestionnaireResponse(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, 0], { functional: 0.5 })).toThrow(RangeError);
  });
});

describe("FHIR QuestionnaireResponse: no identifiers", () => {
  const variants: [string, () => QuestionnaireResponse][] = [
    ["GAD-7 complete", () => buildQuestionnaireResponse(GAD7, [1, 2, 3, 0, 1, 2, 3])],
    ["GAD-7 partial", () => buildQuestionnaireResponse(GAD7, [1, null, 3])],
    ["PHQ-9 complete + difficulty + date", () =>
      buildQuestionnaireResponse(PHQ9, [1, 1, 1, 1, 1, 1, 1, 1, 1], { functional: 3, authoredDate: true, now: new Date(2026, 0, 2) })],
    ["PHQ-9 loinc linkIds", () => buildQuestionnaireResponse(PHQ9, [0, 1, 2, 3, 0, 1, 2, 3, 0], { linkIds: "loinc" })],
  ];

  it.each(variants)("%s contains no forbidden key at any depth", (_, build) => {
    const qr = build();
    const forbidden = new Set(FORBIDDEN_KEYS.map((k) => k.toLowerCase()));
    const hits = allKeys(qr).filter(({ key }) => forbidden.has(key.replace(/^_/, "").toLowerCase()));
    expect(hits).toEqual([]);
    expect(findIdentifierProblems(qr)).toEqual([]);
    expect(() => validateNoIdentifiers(qr)).not.toThrow();
    expect(Object.keys(qr)).not.toContain("text"); // no narrative
    expect(Object.keys(qr)).not.toContain("meta");
  });

  it("covers every key the task forbids", () => {
    for (const k of ["subject", "author", "source", "encounter", "identifier", "id", "patient", "name", "telecom", "address", "birthDate"]) {
      expect(FORBIDDEN_KEYS).toContain(k);
    }
  });

  it("omits authored by default and writes a bare local date only when opted in", () => {
    expect(buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0]).authored).toBeUndefined();
    expect(buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0], { authoredDate: false }).authored).toBeUndefined();
    const qr = buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0], { authoredDate: true, now: new Date(2026, 10, 26, 23, 59, 30) });
    expect(qr.authored).toBe("2026-11-26");
    expect(qr.authored).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const today = buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0], { authoredDate: true });
    expect(today.authored).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0], { authoredDate: true, now: new Date(Number.NaN) })).toThrow(
      RangeError,
    );
  });

  const clean = () => JSON.parse(serializeQuestionnaireResponse(buildQuestionnaireResponse(PHQ9, [1, 1, 1, 1, 1, 1, 1, 1, 1]))) as Record<string, unknown>;

  it.each<[string, (r: Record<string, unknown>) => void, RegExp]>([
    ["subject", (r) => (r.subject = { reference: "Patient/123" }), /subject: forbidden key/],
    ["author", (r) => (r.author = { display: "Clinician" }), /author: forbidden key/],
    ["source", (r) => (r.source = { display: "x" }), /source: forbidden key/],
    ["encounter", (r) => (r.encounter = { display: "x" }), /encounter: forbidden key/],
    ["identifier", (r) => (r.identifier = { value: "abc" }), /identifier: forbidden key/],
    ["id at root", (r) => (r.id = "qr-1"), /^id: forbidden key/],
    ["id nested in an item", (r) => ((r.item as Record<string, unknown>[])[0]!.id = "x"), /item\[0\]\.id: forbidden key/],
    ["patient", (r) => (r.contained = [{ resourceType: "Patient" }]), /contained: forbidden key/],
    ["Patient fields", (r) => (r.extension = [{ patient: { name: [{ family: "x" }], telecom: [], address: [], birthDate: "1990-01-01" } }]), /extension\[0\]\.patient: forbidden key/],
    ["name", (r) => (r.name = "x"), /name: forbidden key/],
    ["telecom", (r) => (r.telecom = []), /telecom: forbidden key/],
    ["address", (r) => (r.address = []), /address: forbidden key/],
    ["birthDate", (r) => (r.birthDate = "1990-01-01"), /birthDate: forbidden key/],
    ["primitive extension _subject", (r) => (r._subject = { extension: [] }), /_subject: forbidden key/],
    ["case variants", (r) => (r.Subject = {}), /Subject: forbidden key/],
    ["a reference anywhere", (r) => (r.extension = [{ url: "x", valueReference: { reference: "Practitioner/1" } }]), /reference: forbidden key/],
    ["basedOn", (r) => (r.basedOn = [{}]), /basedOn: forbidden key/],
    ["meta.source", (r) => (r.meta = { source: "#abc" }), /meta\.source: forbidden key/],
    ["a narrative", (r) => (r.text = { status: "generated", div: "<div>notes</div>" }), /^text: narrative/],
    ["authored with a time", (r) => (r.authored = "2026-11-26T10:00:00Z"), /authored must be YYYY-MM-DD/],
    ["an e-mail in item text", (r) => ((r.item as Record<string, unknown>[])[0]!.text = "Reach me at someone@example.com"), /item\[0\]\.text: value looks like an identifier/],
    ["a phone number in a display", (r) => (r._questionnaire = { extension: [{ url: "x", valueString: "Call 555-867-5309" }] }), /valueString: value looks like an identifier/],
  ])("validateNoIdentifiers fails on %s", (_, mutate, expected) => {
    const r = clean();
    expect(() => validateNoIdentifiers(r)).not.toThrow();
    mutate(r);
    const problems = findIdentifierProblems(r);
    expect(problems.some((p) => expected.test(p)), problems.join("\n")).toBe(true);
    expect(() => validateNoIdentifiers(r)).toThrow(FhirIdentifierError);
    try {
      validateNoIdentifiers(r);
    } catch (e) {
      expect((e as FhirIdentifierError).problems).toEqual(problems);
    }
  });

  it("refuses to build when measure text itself carries an identifier (typed text cannot ride along)", () => {
    const tampered: Measure = {
      ...GAD7,
      items: GAD7.items.map((it, i) => (i === 0 ? { ...it, text: "Client reachable at 555-867-5309" } : it)),
    };
    expect(() => buildQuestionnaireResponse(tampered, [0, 0, 0, 0, 0, 0, 0])).toThrow(FhirIdentifierError);
  });

  it("serializeQuestionnaireResponse re-validates a resource altered after building", () => {
    const qr = buildQuestionnaireResponse(GAD7, [0, 0, 0, 0, 0, 0, 0]) as QuestionnaireResponse & { subject?: unknown };
    qr.subject = { reference: "Patient/1" };
    expect(() => serializeQuestionnaireResponse(qr)).toThrow(FhirIdentifierError);
    expect(() => questionnaireResponseBytes(qr)).toThrow(FhirIdentifierError);
  });

  it("handles non-objects and cycles without throwing", () => {
    expect(findIdentifierProblems(null)).toEqual([]);
    expect(findIdentifierProblems(42)).toEqual([]);
    const a: Record<string, unknown> = { resourceType: "QuestionnaireResponse" };
    a.self = a;
    expect(findIdentifierProblems(a)).toEqual([]);
  });
});

describe("FHIR QuestionnaireResponse: unavailable measures", () => {
  it("throws FhirExportUnavailable without a verified LOINC mapping", () => {
    const { loinc: _drop, ...noLoinc } = GAD7;
    expect(() => buildQuestionnaireResponse(noLoinc as Measure, [0, 0, 0, 0, 0, 0, 0])).toThrow(FhirExportUnavailable);
    expect(() => buildQuestionnaireResponse({ ...GAD7, loinc: { panel: "12345-6" } }, [0, 0, 0, 0, 0, 0, 0])).toThrow(
      FhirExportUnavailable,
    );
    expect(() => buildQuestionnaireResponse({ ...GAD7, loinc: { panel: "../evil" } }, [0, 0, 0, 0, 0, 0, 0])).toThrow(
      /malformed/,
    );
    expect(() => buildQuestionnaireResponse({ ...GAD7, loinc: { panel: "69737-5", total: "44261-6" } }, [0, 0, 0, 0, 0, 0, 0])).toThrow(
      /does not match/,
    );
    expect(() => buildQuestionnaireResponse({ ...GAD7, items: GAD7.items.slice(0, 6) }, [0, 0, 0, 0, 0, 0])).toThrow(
      /do not match/,
    );
    expect(describeFhirExport(noLoinc as Measure)).toMatchObject({ available: false, includesFunctionalItem: false });
  });
});

describe("FHIR QuestionnaireResponse: files and round-trip", () => {
  it("names the file after the measure id", () => {
    expect(questionnaireResponseFilename(GAD7)).toBe("gad-7-response.fhir.json");
    expect(questionnaireResponseFilename(PHQ9)).toBe("phq-9-response.fhir.json");
    expect(questionnaireResponseFilename({ id: "../../etc/passwd" })).toBe("measure-response.fhir.json");
    expect(FHIR_JSON_MIME).toBe("application/fhir+json");
  });

  it.each(["item", "loinc"] as const)("round-trips through JSON with %s linkIds", (linkIds) => {
    for (const [m, answers] of [
      [GAD7, [3, 2, 1, 0, 1, 2, 3]],
      [PHQ9, [0, 1, 2, 3, 0, 1, 2, 3, 1]],
      [PHQ9, [2, null, null, 1, null, null, null, null, 0]],
    ] as const) {
      const qr = buildQuestionnaireResponse(m, answers, { linkIds, functional: 1 });
      const json = serializeQuestionnaireResponse(qr);
      expect(json.endsWith("\n")).toBe(true);
      const parsed = JSON.parse(json) as unknown;
      expect(parsed).toEqual(qr);
      expect(() => validateNoIdentifiers(parsed)).not.toThrow();
      const back = answersFromQuestionnaireResponse(m, parsed);
      expect(back).toEqual(m.items.map((_, i) => answers[i] ?? null));
      expect(buildQuestionnaireResponse(m, back, { linkIds, functional: 1 })).toEqual(qr);
    }
  });

  it("produces UTF-8 bytes that decode to the same JSON (em dash in PHQ-9 item 6 survives)", () => {
    const qr = buildQuestionnaireResponse(PHQ9, [0, 0, 0, 0, 0, 1, 0, 0, 0]);
    const bytes = questionnaireResponseBytes(qr);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe(serializeQuestionnaireResponse(qr));
    expect(JSON.parse(text).item[5].text).toBe(PHQ9.items[5]!.text);
  });

  it("answersFromQuestionnaireResponse rejects other resources and unreadable answers", () => {
    expect(() => answersFromQuestionnaireResponse(GAD7, { resourceType: "Patient" })).toThrow(TypeError);
    expect(() =>
      answersFromQuestionnaireResponse(GAD7, {
        resourceType: "QuestionnaireResponse",
        item: [{ linkId: "1", answer: [{ valueCoding: { system: LOINC_SYSTEM, code: "LA9999-9" } }] }],
      }),
    ).toThrow(RangeError);
  });

  it("exports the LOINC notice the UI shows beside the export", () => {
    expect(LOINC_NOTICE).toMatch(/Regenstrief Institute/);
    expect(LOINC_NOTICE).toMatch(/loinc\.org\/license/);
  });
});
