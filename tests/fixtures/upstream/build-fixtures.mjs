#!/usr/bin/env node
/**
 * Builds tests/fixtures/upstream/<upstream>.json: canned upstream answers for the Playwright suite
 * (E2E_UPSTREAM_FIXTURES=1, src/server/core.ts). Run after content changes that add codes or medications:
 *
 *   node tests/fixtures/upstream/build-fixtures.mjs
 *
 * Everything here is FICTIONAL test data in the real upstream response shapes: no real people, no real NPIs,
 * no real PMIDs or trial ids, no WHO, FDA or NLM text. Codes and medication names come from content/ so every
 * curated lookup the app can make has an answer. Never used outside tests.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const content = (rel) => JSON.parse(readFileSync(path.join(root, "content", rel), "utf8"));
const conditions = readdirSync(path.join(root, "content/conditions"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => content(`conditions/${f}`));
const meds = content("medications.json").medications;

const ABOUT = "Fictional e2e fixture data in the upstream's response shape (E2E_UPSTREAM_FIXTURES=1, tests only).";
function write(upstream, responses, extra = "") {
  const file = { _about: `${ABOUT}${extra ? ` ${extra}` : ""}`, upstream, responses };
  writeFileSync(path.join(here, `${upstream}.json`), `${JSON.stringify(file, null, 2)}\n`);
}

/* ---------------- NLM Clinical Tables ICD-10-CM: [total, codes, extra, display] ---------------- */
const allIcd10 = [...new Map(conditions.flatMap((c) => c.icd10cm.map((x) => [x.code, x.label]))).entries()].sort();
const icd10Rows = (prefix) => allIcd10.filter(([code]) => code.startsWith(prefix));
const icd10Entries = [];
const prefixes = new Set();
for (const [code] of allIcd10) {
  prefixes.add(code);
  prefixes.add(code.split(".")[0]);
}
for (const p of [...prefixes].sort()) {
  const rows = icd10Rows(p);
  icd10Entries.push({ when: { query: { terms: p } }, json: [rows.length, rows.map((r) => r[0]), null, rows] });
}
icd10Entries.push({ note: "any other code or curated term", json: [2, ["F41.1", "F41.9"], null, [["F41.1", "Generalized anxiety disorder"], ["F41.9", "Anxiety disorder, unspecified"]]] });
write("nlm-icd10cm", icd10Entries, "Titles are the curated labels from content/conditions.");

/* ---------------- WHO ICD-API: token, codeinfo, entity ---------------- */
write("who-icd11-token", [{ json: { access_token: "e2e-fixture-token-not-a-secret", token_type: "Bearer", expires_in: 3600 } }]);
const icd11 = [...new Map(conditions.flatMap((c) => c.icd11.map((x) => [x.code, x.label]))).entries()].sort();
const icd11Entries = [];
icd11.forEach(([code, label], i) => {
  const entity = String(900000001 + i);
  icd11Entries.push({
    when: { path: `/mms/codeinfo/${code}` },
    json: { code, stemId: `http://id.who.int/icd/release/11/2026-01/mms/${entity}` },
  });
  icd11Entries.push({
    when: { path: `/mms/${entity}` },
    json: {
      code,
      title: { "@language": "en", "@value": label },
      definition: { "@language": "en", "@value": `Test fixture definition for ${code}. Not WHO text; the real ICD-API supplies this.` },
      classKind: "category",
      browserUrl: `https://icd.who.int/browse/2026-01/mms/en#${entity}`,
      inclusion: [{ label: { "@language": "en", "@value": `Fixture inclusion term for ${code}` } }],
      exclusion: [{ label: { "@language": "en", "@value": `Fixture exclusion term for ${code}` } }],
    },
  });
});
// Longest code first: "/mms/codeinfo/6B20" is a substring of "/mms/codeinfo/6B20.0".
icd11Entries.sort((a, b) => b.when.path.length - a.when.path.length);
icd11Entries.push({ note: "unknown code", status: 404 });
write("who-icd11", icd11Entries);

/* ---------------- MedlinePlus Connect (JSON feed) ---------------- */
const page = (title, url, summary) => ({ title: { _value: title }, link: [{ href: url, rel: "alternate" }], summary: { _value: summary } });
write("medlineplus-connect", [
  {
    when: { query: { "informationRecipient.languageCode.c": "es" } },
    json: { feed: { entry: [page("Salud mental (fixture)", "https://medlineplus.gov/spanish/mentalhealth.html", "Resumen de prueba en español para pruebas automatizadas.")] } },
  },
  {
    json: {
      feed: {
        entry: [
          page("Mental Health (fixture)", "https://medlineplus.gov/mentalhealth.html", "Fixture summary for automated tests. The real MedlinePlus page has the plain-language text."),
          page("Stress (fixture)", "https://medlineplus.gov/stress.html", "Second fixture page so lists render with more than one item."),
        ],
      },
    },
  },
]);

/* ---------------- MedlinePlus Health Topics (XML) ---------------- */
const doc = (url, title, summary, alt = "", group = "Mental Health and Behavior") =>
  `<document rank="0" url="${url}"><content name="title">${title}</content>${alt ? `<content name="altTitle">${alt}</content>` : ""}<content name="FullSummary">${summary}</content><content name="groupName">${group}</content></document>`;
const xml = (docs) => `<?xml version="1.0" encoding="UTF-8"?><nlmSearchResult><count>${docs.length}</count><list num="${docs.length}">${docs.join("")}</list></nlmSearchResult>`;
write("medlineplus-topics", [
  {
    when: { query: { db: "healthTopicsSpanish" } },
    text: xml([
      doc("https://medlineplus.gov/spanish/stress.html", "Estrés (fixture)", "Texto de prueba para pruebas automatizadas."),
      doc("https://medlineplus.gov/spanish/sleepdisorders.html", "Problemas para dormir (fixture)", "Segundo texto de prueba."),
    ]),
  },
  {
    note: "the second title names a condition on purpose: client mode must swap it for a neutral label",
    text: xml([
      doc("https://medlineplus.gov/stress.html", "Stress (fixture)", "Fixture summary in plain words for automated tests."),
      doc("https://medlineplus.gov/anxiety.html", "Anxiety", "Fixture summary that names anxiety, so client mode hides it.", "Worry"),
      doc("https://medlineplus.gov/healthysleep.html", "Healthy Sleep (fixture)", "Another plain fixture summary."),
    ]),
  },
]);

/* ---------------- CMS NPPES NPI Registry ---------------- */
const TAX = [
  ["2084P0800X", "Psychiatry & Neurology, Psychiatry"],
  ["363LP0808X", "Nurse Practitioner, Psych/Mental Health"],
  ["103T00000X", "Psychologist"],
  ["103TC0700X", "Psychologist, Clinical"],
  ["101YP2500X", "Counselor, Professional"],
  ["101YM0800X", "Counselor, Mental Health"],
  ["1041C0700X", "Social Worker, Clinical"],
  ["106H00000X", "Marriage & Family Therapist"],
  ["101YA0400X", "Counselor, Addiction (Substance Use Disorder)"],
];
const PEOPLE = [
  ["AVERY", "SAMPLE", "MD"],
  ["JORDAN", "EXAMPLE", "PMHNP"],
  ["RILEY", "FIXTURE", "PHD"],
  ["CASEY", "PLACEHOLDER", "PSYD"],
  ["MORGAN", "DEMO", "LPC"],
  ["QUINN", "MOCKWELL", "LMHC"],
  ["SKYLER", "TESTWOOD", "LCSW"],
  ["DREW", "STUBBS", "LMFT"],
  ["ROWAN", "DUMMYFORD", "LADC"],
];
const npiRecords = TAX.flatMap(([code, desc], i) => {
  const [first, last, cred] = PEOPLE[i];
  const person = {
    number: String(1999000001 + i * 2),
    enumeration_type: "NPI-1",
    basic: { first_name: first, last_name: last, credential: cred, status: "A", last_updated: "2026-10-01" },
    addresses: [
      { address_purpose: "MAILING", address_1: "PO BOX 100", city: "SPRINGFIELD", state: "IL", postal_code: "627010000" },
      { address_purpose: "LOCATION", address_1: `${100 + i} FIXTURE AVE`, address_2: "SUITE 2", city: "SPRINGFIELD", state: "IL", postal_code: "627010000", telephone_number: `217-555-01${String(10 + i)}` },
    ],
    taxonomies: [{ code, desc, primary: true, state: "IL" }],
  };
  const org = {
    number: String(1999000002 + i * 2),
    enumeration_type: "NPI-2",
    basic: { organization_name: `FIXTURE ${desc.split(",")[0].toUpperCase()} GROUP`, status: "A", last_updated: "2026-09-15" },
    addresses: [{ address_purpose: "LOCATION", address_1: `${200 + i} SAMPLE ST`, city: "SPRINGFIELD", state: "IL", postal_code: "62702", telephone_number: `217-555-02${String(10 + i)}` }],
    taxonomies: [{ code, desc, primary: true, state: "IL" }],
  };
  return [person, org];
});
write("cms-nppes", [
  { note: "ZIP 99950: rate-limited answer, to test the retry button", when: { query: { postal_code: "99950" } }, status: 429 },
  { note: "ZIP 59001: no results", when: { query: { postal_code: "59001" } }, json: { result_count: 0, results: [] } },
  { json: { result_count: npiRecords.length, results: npiRecords } },
], "NPIs in the 1999000000 range are not issued to anyone.");

/* ---------------- HRSA HDW health centers ---------------- */
const sites = [1, 2, 3].map((n) => ({
  HCC_FCT_ID: 900000 + n,
  SITE_NM: `Fixture Community Health Center ${n}`,
  SITE_ADDRESS: `${n}0 Example Rd`,
  SITE_CITY: "SPRINGFIELD",
  SITE_STATE_ABBR: "IL",
  SITE_ZIP_CD: "62701",
  SITE_PHONE_NUM: `2175550${300 + n}`,
  SITE_URL: "https://findahealthcenter.hrsa.gov/",
  HCC_TYP_DESC: "Service Delivery Site",
  HCC_LOC_DESC: "Permanent",
  Distance: n * 1.7,
}));
write("hrsa-hdw", [
  { when: { path: "/GetHealthCentersAroundALocation" }, json: { HCC: sites } },
  { when: { path: "/GetHealthCentersByArea" }, json: { HCC: sites.slice(0, 1).map((s) => ({ ...s, Distance: undefined })) } },
]);

/* ---------------- SAMHSA FindTreatment.gov ---------------- */
const svc = (f2, f3) => ({ f1: f2, f2, f3 });
const rows = [1, 2].map((n) => ({
  name1: `Fixture Treatment Center ${n}`,
  name2: n === 1 ? "Outpatient Program" : null,
  street1: `${n}00 Placeholder Blvd`,
  city: "SPRINGFIELD",
  state: "IL",
  zip: "62703",
  phone: `217-555-04${n}0`,
  intake1: `217-555-04${n}1`,
  hotline1: null,
  website: "https://findtreatment.gov/",
  miles: n * 2.4,
  services: [
    svc("TC", "Outpatient; Telemedicine/telehealth therapy"),
    svc("SET", "Outpatient"),
    svc("PAY", "Cash or self-payment; Medicaid; Private health insurance"),
    svc("PYAS", "Sliding fee scale"),
    svc("AGE", "Adults; Seniors"),
    svc("SL", "Spanish"),
  ],
}));
write("samhsa-findtreatment", [{ json: { page: 1, totalPages: 1, recordCount: rows.length, rows } }]);

/* ---------------- NLM RxNav (RxNorm / RxClass) ---------------- */
const rxEntries = [];
for (const m of meds) {
  const name = m.rxnormName ?? m.generic;
  rxEntries.push({ when: { path: "/rxcui.json", query: { name } }, json: { idGroup: { name, rxnormId: [m.rxcui] } } });
  const brand = m.label?.brand ?? m.commonBrands?.[0];
  rxEntries.push({
    when: { path: `/rxcui/${m.rxcui}/related.json` },
    json: {
      relatedGroup: {
        conceptGroup: [{ tty: "SBD", conceptProperties: brand ? [{ rxcui: "1", name: `${name} 10 MG Oral Tablet [${brand}]` }] : [] }],
      },
    },
  });
}
rxEntries.push({
  when: { path: "/rxclass/class/byDrugName.json", query: { relaSource: "ATC" } },
  json: { rxclassDrugInfoList: { rxclassDrugInfo: [{ rxclassMinConceptItem: { classId: "N06AX", className: "Fixture ATC class", classType: "ATC1-4" } }] } },
});
rxEntries.push({
  when: { path: "/rxclass/class/byDrugName.json", query: { relaSource: "DAILYMED" } },
  json: { rxclassDrugInfoList: { rxclassDrugInfo: [{ rxclassMinConceptItem: { classId: "N0000000001", className: "Fixture Established Pharmacologic Class", classType: "EPC" } }] } },
});
rxEntries.push({ note: "any other drug name", when: { path: "/rxcui.json" }, json: { idGroup: {} } });
write("nlm-rxnav", rxEntries, "RxCUIs and brand names are the curated values from content/medications.json.");

/* ---------------- openFDA drug label ---------------- */
const fdaEntries = [];
for (const m of meds) {
  const lab = m.label ?? {};
  if (lab.unharmonized) continue;
  const route = lab.route ?? "ORAL";
  // The first query step starts with the brand (reference label) or the generic name (drugLabelQueries()).
  const needle = lab.brand ? `openfda.brand_name.exact:"${lab.brand}"` : `openfda.generic_name:"${lab.name ?? m.generic}"`;
  const generic = (lab.name ?? m.generic).toUpperCase();
  fdaEntries.push({
    when: { paramStartsWith: needle },
    json: {
      meta: { results: { total: 1 } },
      results: [
        {
          set_id: "00000000-0000-4000-8000-000000000001",
          effective_time: "20260101",
          ...(m.boxedWarning ? { boxed_warning: ["BOXED WARNING: Test fixture boxed warning. The real label text comes from openFDA."] } : {}),
          indications_and_usage: ["1 INDICATIONS AND USAGE Test fixture indications text for automated tests."],
          warnings_and_cautions: ["5 WARNINGS AND PRECAUTIONS Test fixture warnings text for automated tests."],
          contraindications: ["4 CONTRAINDICATIONS Test fixture contraindications text."],
          openfda: {
            brand_name: lab.brand ? [lab.brand] : [],
            generic_name: [generic],
            route: [route],
            product_type: ["HUMAN PRESCRIPTION DRUG"],
          },
        },
      ],
    },
  });
}
fdaEntries.push({ note: "no matching label (openFDA answers 404)", status: 404 });
write("openfda-label", fdaEntries);

/* ---------------- NCBI E-utilities (PubMed) ---------------- */
const pmids = ["99000001", "99000002", "99000003"];
const summary = { uids: pmids };
pmids.forEach((id, i) => {
  summary[id] = {
    uid: id,
    title: `Fixture citation ${i + 1}: a placeholder title for automated tests.`,
    source: "Fixture J",
    pubdate: `${2024 - i} Jan`,
    pubtype: [i === 0 ? "Meta-Analysis" : i === 1 ? "Randomized Controlled Trial" : "Systematic Review", "Journal Article"],
  };
});
write("ncbi-eutils", [
  { when: { path: "/esearch.fcgi" }, json: { esearchresult: { count: "3", idlist: pmids } } },
  { when: { path: "/esummary.fcgi" }, json: { result: summary } },
], "PMIDs 99000001-99000003 are placeholders.");

/* ---------------- ClinicalTrials.gov API v2 ---------------- */
const study = (n) => ({
  protocolSection: {
    identificationModule: { nctId: `NCT9900000${n}`, briefTitle: `Fixture recruiting study ${n} for automated tests` },
    statusModule: { overallStatus: "RECRUITING", lastUpdatePostDateStruct: { date: "2026-10-01" } },
    designModule: { phases: n === 1 ? ["PHASE2"] : ["NA"], studyType: "INTERVENTIONAL" },
    conditionsModule: { conditions: ["Fixture condition"] },
    armsInterventionsModule: { interventions: [{ name: "Fixture intervention" }] },
    contactsLocationsModule: { locations: [{ country: "United States", state: "Illinois" }, { country: "Canada" }] },
  },
});
write("clinicaltrials-gov", [{ json: { totalCount: 2, studies: [study(1), study(2)] } }], "NCT9900000x ids are placeholders.");

/* ---------------- WHO GHO OData ---------------- */
const gho = [2021, 2020, 2019].flatMap((year, i) => [
  { TimeDim: year, Dim1Type: "SEX", Dim1: "SEX_BTSX", NumericValue: 10 + i, Low: 8 + i, High: 12 + i, Value: `${10 + i}`, Date: "2026-01-15T00:00:00" },
  { TimeDim: year, Dim1Type: "SEX", Dim1: "SEX_FMLE", NumericValue: 9 + i, Low: 7 + i, High: 11 + i, Value: `${9 + i}`, Date: "2026-01-15T00:00:00" },
]);
write("who-gho", [{ json: { value: gho } }]);

console.log("upstream fixtures written to", path.relative(root, here));
