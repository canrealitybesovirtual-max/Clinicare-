import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import medicationsJson from "@content/medications.json";
import { conditions } from "@/lib/content";
import { containsPHI } from "@/lib/phi-scrubber";
import {
  MEDICATIONS,
  MEDICATION_CATEGORIES,
  MEDICATION_GENERICS,
  MedicationDrug,
  MedicationsFileSchema,
  dailyMedLabelUrl,
  dailyMedSearchUrl,
  getMedication,
  medicationsByCategory,
  medicationsFile,
  rxNavConceptUrl,
} from "@/lib/schemas-medications";

const byId = (id: string) => {
  const m = getMedication(id);
  if (!m) throw new Error(`missing medication ${id}`);
  return m;
};
const notes = (id: string) => byId(id).clinicianNotes.join(" ");

describe("content/medications.json: contract and governance (G10)", () => {
  it("validates, with file-level governance and clinician-only scope", () => {
    const file = MedicationsFileSchema.parse(medicationsJson);
    expect(file.medications.length).toBeGreaterThanOrEqual(60);
    expect(file.license).toBe("original");
    expect(file.lastVerified).toBe("2026-11-26");
    expect(file.reviewedBy).toBe("PENDING");
    expect(file.sources.length).toBeGreaterThanOrEqual(5);
    const publishers = file.sources.map((s) => s.publisher).join(" | ");
    expect(publishers).toMatch(/U\.S\. Food and Drug Administration/);
    expect(publishers).toMatch(/National Institute of Mental Health/);
    expect(publishers).toMatch(/National Library of Medicine/);
    expect(file.sources.map((s) => s.url)).toEqual(expect.arrayContaining(["https://dailymed.nlm.nih.gov/dailymed/", "https://www.nimh.nih.gov/health/topics/mental-health-medications"]));
    expect(file.scope).toMatch(/Clinician mode only/);
    expect(file.scope).toMatch(/not prescribing, dosing/);
    expect(file.scope).toMatch(/psychiatrist, primary care clinician or psychiatric nurse practitioner/);
  });

  it("rejects duplicates, unknown fields and a boxed-warning flag without a matching note", () => {
    const base = structuredClone(medicationsJson) as { medications: Record<string, unknown>[] };
    const dup = structuredClone(base);
    dup.medications.push(structuredClone(dup.medications[0]!));
    expect(() => MedicationsFileSchema.parse(dup)).toThrow(ZodError);
    const extra = structuredClone(base);
    (extra.medications[0] as Record<string, unknown>).dose = "x";
    expect(() => MedicationsFileSchema.parse(extra)).toThrow(ZodError);
    const flag = structuredClone(base);
    const sert = flag.medications.find((m) => m.id === "sertraline")!;
    sert.clinicianNotes = ["Serotonin syndrome risk with other serotonergic drugs and MAOIs."];
    expect(() => MedicationsFileSchema.parse(flag)).toThrow(/boxedWarning=true/);
  });

  it("covers every required class and medication", () => {
    const ids = new Set(MEDICATIONS.map((m) => m.id));
    const required = [
      // SSRIs, SNRIs and other antidepressants
      "fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram", "fluvoxamine",
      "venlafaxine", "desvenlafaxine", "duloxetine", "levomilnacipran",
      "bupropion", "mirtazapine", "trazodone", "vortioxetine", "vilazodone",
      // TCAs and MAOIs
      "amitriptyline", "nortriptyline", "imipramine", "clomipramine", "doxepin",
      "phenelzine", "tranylcypromine", "isocarboxazid", "selegiline-transdermal",
      // anxiety, trauma-related nightmares
      "buspirone", "hydroxyzine", "alprazolam", "clonazepam", "lorazepam", "diazepam", "prazosin",
      // mood stabilizers
      "lithium", "valproate", "lamotrigine", "carbamazepine",
      // second-generation antipsychotics
      "aripiprazole", "brexpiprazole", "cariprazine", "quetiapine", "olanzapine", "risperidone", "paliperidone",
      "ziprasidone", "lurasidone", "lumateperone", "asenapine", "iloperidone", "clozapine",
      // rapid-acting / neurosteroids
      "esketamine", "zuranolone", "brexanolone",
      // alcohol use disorder
      "naltrexone", "acamprosate", "disulfiram", "topiramate", "gabapentin",
      // sleep
      "suvorexant", "lemborexant", "daridorexant", "zolpidem", "eszopiclone", "ramelteon",
    ];
    for (const id of required) expect(ids, id).toContain(id);
    for (const c of MEDICATION_CATEGORIES) expect(medicationsByCategory(c).length, c).toBeGreaterThan(0);
  });

  it("condition links point at real condition files", () => {
    const known = new Set(conditions.map((c) => c.id));
    const linked = MEDICATIONS.flatMap((m) => m.usedFor.flatMap((u) => (u.conditionId ? [u.conditionId] : [])));
    expect(linked.length).toBeGreaterThan(20);
    for (const id of linked) expect(known, id).toContain(id);
  });
});

describe("medications: clinical-safety wording rules", () => {
  const allText = () =>
    MEDICATIONS.flatMap((m) => [m.class, ...m.clinicianNotes, ...m.usedFor.map((u) => u.label)]).join("\n");

  it("contains no dosing, schedules or titration instructions", () => {
    const text = allText();
    expect(text).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|mL|units?|mEq)\b/i);
    expect(text).not.toMatch(/\b(?:once|twice|three times) (?:a |per )?day\b|\b(?:q\.?d|b\.?i\.?d|t\.?i\.?d|q\.?h\.?s|prn)\b|\bper day\b|\bdaily dose\b/i);
    expect(text).not.toMatch(/\b(?:start(?:ing)?|initial|target|maximum|max) dose\b|\bdose (?:of|is|range)\b|\bincrease (?:by|to)\b/i);
    expect(text).not.toMatch(/\b\d+\s*(?:hours?|days?|weeks?)\b/i); // no timing instructions either
  });

  it("never states a final diagnosis, DSM criteria or forbidden claims", () => {
    const text = JSON.stringify(medicationsJson);
    expect(text).not.toMatch(/Criterion [A-H]\b|DSM-5-TR [Cc]riteria/);
    expect(text).not.toMatch(/[Hh]omeopath/);
    expect(text).not.toMatch(/HIPAA[ -](?:certified|approved|certification)/);
    expect(text).not.toMatch(/\b(?:you have|diagnosed with|the client has)\b/i);
    expect(text).not.toMatch(/\b(?:firstName|lastName|clientName|patientName|dateOfBirth|dob|ssn|mrn|insuranceId)\b/);
  });

  it("notes are short and original (not label sentences)", () => {
    for (const m of MEDICATIONS) {
      for (const n of m.clinicianNotes) {
        expect(n.length, m.id).toBeLessThanOrEqual(320);
        expect(n, m.id).not.toMatch(/\[see |\(\s*\d+\.\d+\s*\)|is indicated for/i); // label phrasing / cross-refs
      }
    }
  });

  it("antidepressants carry the suicidality boxed warning; serotonergic agents note serotonin syndrome", () => {
    const ad = ["fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram", "fluvoxamine", "venlafaxine", "desvenlafaxine", "duloxetine", "levomilnacipran", "bupropion", "mirtazapine", "trazodone", "vortioxetine", "vilazodone", "amitriptyline", "nortriptyline", "phenelzine", "tranylcypromine", "gepirone"];
    for (const id of ad) {
      expect(byId(id).boxedWarning, id).toBe(true);
      expect(notes(id), id).toMatch(/young adults/);
    }
    for (const id of ["fluoxetine", "sertraline", "citalopram", "escitalopram", "venlafaxine", "duloxetine", "vortioxetine", "vilazodone", "trazodone", "clomipramine"])
      expect(notes(id), id).toMatch(/[Ss]erotonin syndrome/);
    for (const id of ["phenelzine", "tranylcypromine", "isocarboxazid"]) expect(notes(id), id).toMatch(/tyramine/);
  });

  it("benzodiazepines note dependence and withdrawal risk and are Schedule IV", () => {
    const benzos = MEDICATIONS.filter((m) => /^Benzodiazepine$/.test(m.class));
    expect(benzos.map((m) => m.id).sort()).toEqual(["alprazolam", "chlordiazepoxide", "clonazepam", "diazepam", "lorazepam", "temazepam"]);
    for (const m of benzos) {
      const t = m.clinicianNotes.join(" ");
      expect(t, m.id).toMatch(/dependence/);
      expect(t, m.id).toMatch(/withdrawal/);
      expect(t, m.id).toMatch(/opioids/);
      expect(m.deaSchedule, m.id).toBe("CIV");
      expect(m.boxedWarning, m.id).toBe(true);
    }
  });

  it("DEA schedules match openFDA NDC data (checked 2026-11-26)", () => {
    const expected: Record<string, string | undefined> = {
      esketamine: "CIII", zuranolone: "CIV", brexanolone: "CIV", suvorexant: "CIV", lemborexant: "CIV", daridorexant: "CIV",
      zolpidem: "CIV", eszopiclone: "CIV", zaleplon: "CIV", methylphenidate: "CII", amphetamine: "CII", lisdexamfetamine: "CII",
      ramelteon: undefined, gabapentin: undefined, buspirone: undefined, atomoxetine: undefined, viloxazine: undefined, hydroxyzine: undefined,
    };
    for (const [id, s] of Object.entries(expected)) expect(byId(id).deaSchedule, id).toBe(s);
  });

  it("lithium, clozapine, valproate, lamotrigine and carbamazepine carry their key monitoring cautions", () => {
    expect(notes("lithium")).toMatch(/levels/);
    expect(notes("lithium")).toMatch(/kidney and thyroid/);
    expect(notes("clozapine")).toMatch(/neutropenia/);
    expect(notes("valproate")).toMatch(/liver injury/);
    expect(notes("valproate")).toMatch(/birth defects/);
    expect(notes("lamotrigine")).toMatch(/Stevens-Johnson/);
    expect(notes("carbamazepine")).toMatch(/HLA-B\*1502/);
    expect(notes("esketamine")).toMatch(/REMS/);
    expect(notes("brexanolone")).toMatch(/REMS/);
    expect(notes("zolpidem")).toMatch(/complex sleep behaviors/);
  });

  it("AUD medications: topiramate and gabapentin are marked off-label; all AUD entries trigger the Part 2 reminder (G6)", () => {
    const aud = medicationsByCategory("aud");
    expect(aud.map((m) => m.id).sort()).toEqual(["acamprosate", "disulfiram", "gabapentin", "naltrexone", "topiramate"]);
    for (const m of aud) expect(m.sudRelated, m.id).toBe(true);
    for (const id of ["topiramate", "gabapentin"]) {
      const u = byId(id).usedFor.find((x) => /alcohol use disorder/i.test(x.label))!;
      expect(u.status, id).toBe("off-label");
      expect(notes(id), id).toMatch(/Off-label for alcohol use disorder/);
    }
    for (const id of ["naltrexone", "acamprosate", "disulfiram"]) {
      expect(byId(id).usedFor[0]!.status, id).toBe("fda-approved");
      expect(byId(id).usedFor[0]!.label, id).toMatch(/[Aa]lcohol/);
    }
    for (const id of ["diazepam", "chlordiazepoxide"]) expect(byId(id).sudRelated, id).toBe(true); // alcohol-withdrawal use
    expect(byId("sertraline").sudRelated).toBeUndefined();
  });

  it("off-label uses are always labelled off-label in the text as well", () => {
    for (const m of MEDICATIONS)
      for (const u of m.usedFor) if (u.status === "off-label") expect(u.label, m.id).toMatch(/off-label/i);
  });
});

describe("medications: identifiers, links and the outbound validator (G5, G17)", () => {
  it("RxCUIs are unique digits; MedlinePlus links are drug-information pages on medlineplus.gov", () => {
    const seen = new Set<string>();
    for (const m of MEDICATIONS) {
      expect(m.rxcui).toMatch(/^\d{1,10}$/);
      expect(seen.has(m.rxcui), m.id).toBe(false);
      seen.add(m.rxcui);
      expect(m.medlinePlus.length, m.id).toBeGreaterThan(0);
      for (const l of m.medlinePlus) expect(l.url).toMatch(/^https:\/\/medlineplus\.gov\/druginfo\/meds\/a\d{6}\.html$/);
    }
    expect(byId("sertraline").rxcui).toBe("36437");
    expect(byId("dextromethorphan-bupropion").rxnormName).toBe("bupropion / dextromethorphan");
  });

  it("brands: no veterinary products, combination brands kept separate", () => {
    const vet = new Set(medicationsFile.brandExclusions.map((b) => b.toLowerCase()));
    for (const m of MEDICATIONS) for (const b of [...m.commonBrands, ...(m.combinationBrands ?? [])]) expect(vet.has(b.toLowerCase()), `${m.id}:${b}`).toBe(false);
    expect(byId("bupropion").combinationBrands).toEqual(expect.arrayContaining(["Auvelity", "Contrave"]));
    expect(byId("sertraline").commonBrands).toEqual(["Zoloft"]);
    expect(byId("lithium").commonBrands).toContain("Lithobid");
  });

  it("every curated outbound value is a plain drug/brand name that the PHI scrubber does not flag", () => {
    for (const m of MEDICATIONS) {
      const values = [m.generic, m.rxnormName, m.label?.name, m.label?.brand, ...(m.label?.exclude ?? [])].filter((v): v is string => !!v);
      for (const v of values) {
        expect(v).toMatch(/^[A-Za-z][A-Za-z0-9 ./'-]{1,78}$/);
        expect(containsPHI(v), `${m.id}:${v}`).toBe(false);
      }
    }
  });

  it("MedicationDrug accepts curated generics and ids (any case) and rejects everything else", () => {
    expect(MedicationDrug.parse("Sertraline")).toBe("sertraline");
    expect(MedicationDrug.parse("  SELEGILINE ")).toBe("selegiline-transdermal");
    expect(MedicationDrug.parse("xanomeline-trospium")).toBe("xanomeline-trospium");
    for (const bad of ["Zoloft", "sertraline 50 mg", "John Smith", "my client", "", "x".repeat(200), "sertraline; DROP TABLE"])
      expect(MedicationDrug.safeParse(bad).success, bad).toBe(false);
    expect(MEDICATION_GENERICS.length).toBe(MEDICATIONS.length);
  });

  it("link-out builders only produce https URLs on the expected hosts", () => {
    expect(dailyMedSearchUrl("lithium")).toBe("https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=lithium");
    expect(dailyMedLabelUrl("FDA754F6-D0F3-4DCE-A17A-927D64F912F7")).toBe("https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=fda754f6-d0f3-4dce-a17a-927d64f912f7");
    expect(dailyMedLabelUrl("javascript:alert(1)")).toBeNull();
    expect(rxNavConceptUrl("36437")).toBe("https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=36437");
    expect(rxNavConceptUrl("1; x")).toBeNull();
  });
});
