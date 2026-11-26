import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import { OutboundRejected } from "@/lib/outbound";
import { MEDICATIONS, getMedication } from "@/lib/schemas-medications";
import { UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  DRUG_LABEL_ATTRIBUTION,
  DRUG_LABEL_SOURCE,
  LABEL_TEXT_MAX,
  OPENFDA_DAILY_CAP,
  __resetOpenFdaForTests,
  configureOpenFdaRateLimit,
  cutAtDsmReference,
  drugLabelQueries,
  lookupDrugLabel,
  tidyLabelText,
} from "@/server/integrations/openfda";
import { POST } from "@/server/routes/drug-label";

/* Real response shape (verified live against api.fda.gov on 2026-11-26), trimmed to the fields we read plus a dosage section. */
const SET_ID = "fda754f6-d0f3-4dce-a17a-927d64f912f7";
const zoloft = (over: Record<string, unknown> = {}) => ({
  spl_product_data_elements: ["Zoloft sertraline hydrochloride SERTRALINE HYDROCHLORIDE SERTRALINE ..."],
  boxed_warning: [
    "WARNING: SUICIDAL THOUGHTS AND BEHAVIORS Antidepressants increased the risk of suicidal thoughts and behavior in pediatric and young adult patients in short-term studies. Closely monitor all antidepressant-treated patients for clinical worsening [see Warnings and Precautions (5.1)].",
  ],
  indications_and_usage: [
    "1 INDICATIONS AND USAGE ZOLOFT is indicated for the treatment of the following [See Clinical Studies (14) ] : &#8226; Major depressive disorder (MDD) <br/>&#8226; Obsessive-compulsive disorder (OCD) ( 1 )",
  ],
  dosage_and_administration: ["2 DOSAGE AND ADMINISTRATION Recommended starting dose 50 mg once daily ..."],
  warnings_and_cautions: [`5 WARNINGS AND PRECAUTIONS Serotonin Syndrome: Increased risk when co-administered with other serotonergic agents ( 5.2 ). ${Array.from({ length: 300 }, (_, i) => `Detail sentence number ${i}.`).join(" ")}`],
  warnings_and_cautions_table: ["<table><tr><td>x</td></tr></table>"],
  contraindications: ["4 CONTRAINDICATIONS ZOLOFT is contraindicated in patients: Taking, or within 14 days of stopping, MAOIs ( 4 ). None. None."],
  set_id: SET_ID,
  id: "a5d1d3c4-0000-0000-0000-000000000000",
  effective_time: "20230808",
  version: "54",
  openfda: {
    application_number: ["NDA019839", "NDA020990"],
    brand_name: ["Zoloft", "ZOLOFT"],
    generic_name: ["SERTRALINE HYDROCHLORIDE"],
    manufacturer_name: ["Viatris Specialty LLC"],
    product_type: ["HUMAN PRESCRIPTION DRUG"],
    route: ["ORAL"],
    rxcui: ["208149"],
  },
  ...over,
});
const page = (doc: unknown, total = 1) => ({
  meta: {
    disclaimer: "Do not rely on openFDA to make decisions regarding medical care.",
    terms: "https://open.fda.gov/terms/",
    license: "https://open.fda.gov/license/",
    last_updated: "2026-11-26",
    results: { skip: 0, limit: 1, total },
  },
  results: [doc],
});
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "No matches found!" } };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
beforeEach(() => {
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true"); // 42 CFR Part 2 owner switch; default (off) is tested in hardening.test.ts
  __resetCoreForTests();
  configureOpenFdaRateLimit();
  __resetOpenFdaForTests();
  phi.force = false;
  delete process.env.OPENFDA_API_KEY;
  fetchMock = vi.fn(async () => json(page(zoloft())));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.OPENFDA_API_KEY;
});

const urlOf = (i = 0) => new URL(String(fetchMock.mock.calls[i]![0]));
const paramsOf = (i = 0) => Object.fromEntries(urlOf(i).searchParams);
const headersOf = (i = 0) => new Headers(fetchMock.mock.calls[i]![1]!.headers);
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/drug-label", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("drug-label: outbound URL carries only curated drug names, brand names and routes", () => {
  it("reference brand first: exact params, nothing else", async () => {
    await lookupDrugLabel({ drug: "sertraline" });
    const u = urlOf();
    expect(`${u.origin}${u.pathname}`).toBe("https://api.fda.gov/drug/label.json");
    expect(paramsOf()).toEqual({ search: 'openfda.brand_name.exact:"Zoloft" AND openfda.route:"ORAL"', limit: "1", sort: "effective_time:desc" });
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("GET");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the single-ingredient generic-name query when the brand label is missing (404)", async () => {
    fetchMock.mockResolvedValueOnce(json(NOT_FOUND, 404));
    const r = await lookupDrugLabel({ drug: "Sertraline" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(paramsOf(1)).toEqual({
      search:
        'openfda.generic_name:"sertraline" AND NOT openfda.generic_name:"and" AND openfda.product_type:"HUMAN PRESCRIPTION DRUG" AND openfda.route:"ORAL"',
      limit: "1",
      sort: "effective_time:desc",
    });
    expect(r.matchedBy).toBe("generic-name");
  });

  it("curated query variants: generic-only, salt name, exclusions, routes, combination and unharmonised labels", () => {
    const s = (id: string) => drugLabelQueries(getMedication(id)!).map((x) => `${x.kind} | ${x.search}`);
    expect(s("escitalopram")).toEqual([
      'generic-name | openfda.generic_name:"escitalopram" AND NOT openfda.generic_name:"and" AND openfda.product_type:"HUMAN PRESCRIPTION DRUG" AND openfda.route:"ORAL"',
    ]);
    expect(s("lithium")[0]).toBe('reference-brand | openfda.brand_name.exact:"LITHOBID" AND openfda.route:"ORAL"');
    expect(s("lithium")[1]).toContain('openfda.generic_name:"lithium carbonate" AND NOT');
    expect(s("chlordiazepoxide")[0]).toBe(
      'generic-name | openfda.generic_name:"chlordiazepoxide" AND NOT openfda.generic_name:"and" AND NOT openfda.generic_name:"clidinium" AND NOT openfda.generic_name:"amitriptyline" AND openfda.product_type:"HUMAN PRESCRIPTION DRUG" AND openfda.route:"ORAL"',
    );
    expect(s("esketamine")[0]).toBe('reference-brand | openfda.brand_name.exact:"Spravato" AND openfda.route:"NASAL"');
    expect(s("selegiline-transdermal")[0]).toContain('openfda.route:"TRANSDERMAL"');
    expect(s("xanomeline-trospium")[1]).toBe(
      'generic-name | openfda.generic_name:"xanomeline" AND openfda.product_type:"HUMAN PRESCRIPTION DRUG" AND openfda.route:"ORAL"',
    );
    expect(s("zuranolone")).toEqual(['product-data | spl_product_data_elements:"zuranolone"']);
  });

  it("every query for every curated medication is built only from curated values and passes the PHI scrubber", async () => {
    const { containsPHI } = await import("@/lib/phi-scrubber");
    const allowed = /^(?:(?:NOT )?(?:openfda\.(?:brand_name\.exact|generic_name|product_type|route)|spl_product_data_elements):"[A-Za-z0-9 .'-]{2,40}"(?: AND |$))+$/;
    for (const m of MEDICATIONS) {
      const steps = drugLabelQueries(m);
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.search).toMatch(allowed);
        expect(containsPHI(step.search)).toBe(false);
      }
    }
  });

  const bad: unknown[] = [
    { drug: "client on sertraline 100 mg since 2019" },
    { drug: "Zoloft" },
    { drug: "Mary Johnson" },
    { drug: "sertraline", zip: "20877" },
    { drug: "y".repeat(400) },
    { drug: null },
    { query: "sertraline" },
    {},
  ];
  it.each(bad.map((b) => [JSON.stringify(b).slice(0, 50), b]))("rejects %s before any fetch", async (_l, body) => {
    await expect(lookupDrugLabel(body as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assertNoPHI runs before any fetch", async () => {
    phi.force = true;
    await expect(lookupDrugLabel({ drug: "lithium" })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
    const res = await post({ drug: "lithium" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "rejected" });
  });

  it("route 400 does not echo the input", async () => {
    const res = await post({ drug: "Robert Brown, MRN 12345678" });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toMatch(/Robert|12345678/);
  });
});

describe("drug-label: normalisation", () => {
  it("plain text, headings and cross-references removed, sections trimmed, dosage never returned", async () => {
    const r = await lookupDrugLabel({ drug: "sertraline" });
    expect(r).toMatchObject({
      drug: "sertraline",
      medicationId: "sertraline",
      found: true,
      matchedBy: "reference-brand",
      brandNames: ["Zoloft"],
      genericName: "SERTRALINE HYDROCHLORIDE",
      routes: ["ORAL"],
      applicationNumber: "NDA019839",
      effectiveTime: "2023-08-08",
      setId: SET_ID,
      dailyMedUrl: `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${SET_ID}`,
      trimmed: true,
    });
    expect(r.boxedWarning).toBe(
      "WARNING: SUICIDAL THOUGHTS AND BEHAVIORS Antidepressants increased the risk of suicidal thoughts and behavior in pediatric and young adult patients in short-term studies. Closely monitor all antidepressant-treated patients for clinical worsening.",
    );
    expect(r.indications).toBe("ZOLOFT is indicated for the treatment of the following: • Major depressive disorder (MDD) • Obsessive-compulsive disorder (OCD)");
    expect(r.contraindications).toBe("ZOLOFT is contraindicated in patients: Taking, or within 14 days of stopping, MAOIs. None.");
    expect(r.warningsAndCautions!.startsWith("Serotonin Syndrome: Increased risk")).toBe(true);
    expect(r.warningsAndCautions!.length).toBeLessThanOrEqual(LABEL_TEXT_MAX.warningsAndCautions);
    const all = JSON.stringify(r);
    expect(all).not.toMatch(/DOSAGE|starting dose|once daily|<table|<br|&#8226;|Viatris/);
  });

  it("older non-PLR labels: `warnings` section and INDICATIONS inside an unclassified section", async () => {
    fetchMock.mockResolvedValue(
      json(
        page(
          zoloft({
            indications_and_usage: undefined,
            warnings_and_cautions: undefined,
            warnings: ["WARNINGS Lithium Toxicity The toxic concentrations for lithium are close to the therapeutic range."],
            spl_unclassified_section: ["Rx only", "INDICATIONS LITHOBID is indicated in the treatment of manic episodes of Bipolar Disorder."],
            boxed_warning: ["WARNING Lithium toxicity is closely related to serum lithium levels."],
            openfda: { brand_name: ["LITHOBID"], generic_name: ["LITHIUM CARBONATE"], product_type: ["HUMAN PRESCRIPTION DRUG"], route: ["ORAL"], application_number: ["NDA018027"] },
          }),
        ),
      ),
    );
    const r = await lookupDrugLabel({ drug: "lithium" });
    expect(r.indications).toBe("LITHOBID is indicated in the treatment of manic episodes of Bipolar Disorder.");
    expect(r.warningsAndCautions).toBe("Lithium Toxicity The toxic concentrations for lithium are close to the therapeutic range.");
    expect(r.boxedWarning).toBe("WARNING Lithium toxicity is closely related to serum lithium levels.");
  });

  it("rejects combination, non-prescription and HPUS-listed hits for single-ingredient entries and tries the next step", async () => {
    fetchMock
      .mockResolvedValueOnce(json(page(zoloft({ openfda: { generic_name: ["NALTREXONE HYDROCHLORIDE AND BUPROPION HYDROCHLORIDE"], product_type: ["HUMAN PRESCRIPTION DRUG"] } }))))
      .mockResolvedValueOnce(json(page(zoloft({ openfda: { generic_name: ["SERTRALINE"], product_type: ["HUMAN OTC DRUG"] } }))));
    const r = await lookupDrugLabel({ drug: "sertraline" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ found: false, matchedBy: null, dailyMedUrl: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=sertraline" });

    __resetCoreForTests();
    configureOpenFdaRateLimit();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(json(page({ spl_product_data_elements: ["ZURANOLONE ... HPUS"], set_id: SET_ID })));
    expect((await lookupDrugLabel({ drug: "zuranolone" })).found).toBe(false);
  });

  it("combination products keep their combination label; unharmonised labels are matched by product data", async () => {
    fetchMock.mockResolvedValueOnce(json(page(zoloft({ openfda: { brand_name: ["Cobenfy"], generic_name: ["XANOMELINE AND TROSPIUM CHLORIDE"], product_type: ["HUMAN PRESCRIPTION DRUG"], route: ["ORAL"] }, boxed_warning: undefined }))));
    const c = await lookupDrugLabel({ drug: "xanomeline and trospium" });
    expect(c).toMatchObject({ found: true, matchedBy: "reference-brand", genericName: "XANOMELINE AND TROSPIUM CHLORIDE", boxedWarning: null });

    fetchMock.mockResolvedValueOnce(json(page({ spl_product_data_elements: ["ZURZUVAE zuranolone ZURANOLONE"], boxed_warning: ["WARNING: IMPAIRED ABILITY TO DRIVE"], set_id: SET_ID, effective_time: "20260615" })));
    const z = await lookupDrugLabel({ drug: "zuranolone" });
    expect(z).toMatchObject({ found: true, matchedBy: "product-data", brandNames: [], genericName: null, boxedWarning: "WARNING: IMPAIRED ABILITY TO DRIVE", effectiveTime: "2026-06-15" });
    expect(paramsOf(1).search).toBe('spl_product_data_elements:"zuranolone"');
  });

  it("unsafe set ids and dates are dropped; DailyMed search link is used instead", async () => {
    fetchMock.mockResolvedValue(json(page(zoloft({ set_id: "../../x?y=1", effective_time: "2023-08-08T00:00" }))));
    const r = await lookupDrugLabel({ drug: "sertraline" });
    expect(r).toMatchObject({ setId: null, effectiveTime: null, dailyMedUrl: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=sertraline" });
  });

  it("tidyLabelText removes PLR cross-references and repeated sentences only", () => {
    expect(tidyLabelText("Text [see Warnings and Precautions (5.1, 5.3)] here ( 5.1 , 5.2 ). Again. Again. End (≥1.5 mEq/L).")).toBe("Text here. Again. End (≥1.5 mEq/L).");
  });

  it("G1: label text is cut at the first sentence that cites the DSM (no diagnostic restatements)", async () => {
    fetchMock.mockResolvedValue(
      json(
        page(
          zoloft({
            indications_and_usage: [
              "INDICATIONS AND USAGE Clomipramine capsules are indicated for the treatment of obsessions and compulsions in patients with OCD. The obsessions or compulsions must cause marked distress in order to meet the DSM-III-R (circa 1989) diagnosis of OCD. Obsessions are recurrent, persistent ideas.",
            ],
          }),
        ),
      ),
    );
    const r = await lookupDrugLabel({ drug: "sertraline" });
    expect(r.indications).toBe("Clomipramine capsules are indicated for the treatment of obsessions and compulsions in patients with OCD.");
    expect(r.trimmed).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/DSM|Diagnostic and Statistical Manual|recurrent, persistent ideas/);
  });

  it("G1: a citation inside the first bullet-style sentence keeps the text before the citation clause", () => {
    // Real Wellbutrin XL highlights shape: no sentence break before the DSM clause.
    expect(
      cutAtDsmReference(
        "Wellbutrin XL is an aminoketone antidepressant, indicated for: • treatment of major depressive disorder (MDD) • prevention of seasonal affective disorder (SAD) 1.1 Major Depressive Disorder (MDD) Wellbutrin XL tablets is indicated for the treatment of major depressive disorder (MDD), as defined by the Diagnostic and Statistical Manual (DSM). The efficacy was established in trials.",
      ),
    ).toEqual({
      text: "Wellbutrin XL is an aminoketone antidepressant, indicated for: • treatment of major depressive disorder (MDD) • prevention of seasonal affective disorder (SAD) 1.1 Major Depressive Disorder (MDD) Wellbutrin XL tablets is indicated for the treatment of major depressive disorder (MDD)…",
      cut: true,
    });
    expect(cutAtDsmReference("Plain text. No citation.")).toEqual({ text: "Plain text. No citation.", cut: false });
    expect(cutAtDsmReference("DSM-IV defines it.")).toEqual({ text: "", cut: true });
  });

  it("not found anywhere: link-out result, cached", async () => {
    fetchMock.mockResolvedValue(json(NOT_FOUND, 404));
    const r = await lookupDrugLabel({ drug: "sertraline" });
    expect(r).toMatchObject({ found: false, boxedWarning: null, setId: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await lookupDrugLabel({ drug: "sertraline" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("drug-label: API key, limits (240/min; 1,000/day keyless), caching, errors, attribution", () => {
  it("OPENFDA_API_KEY goes in the X-Api-Key header, never in the URL; malformed keys are ignored", async () => {
    process.env.OPENFDA_API_KEY = "abcDEF1234567890abcDEF1234567890abcDEF12";
    await lookupDrugLabel({ drug: "sertraline" });
    expect(headersOf().get("x-api-key")).toBe("abcDEF1234567890abcDEF1234567890abcDEF12");
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("abcDEF");
    expect(Object.keys(paramsOf())).toEqual(["search", "limit", "sort"]);
    process.env.OPENFDA_API_KEY = "not a key; DROP";
    await lookupDrugLabel({ drug: "lithium" });
    expect(headersOf(1).get("x-api-key")).toBeNull();
    expect(headersOf(1).get("user-agent")).toBe("ClinicianResourceCompanion/0.1 (reference tool)");
  });

  it("caches the normalised result per medication for 24 h (raw label documents are not cached)", async () => {
    await lookupDrugLabel({ drug: "sertraline" });
    await lookupDrugLabel({ drug: "SERTRALINE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await lookupDrugLabel({ drug: "lithium" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("burst of 6, then 429 without calling upstream", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
    __resetCoreForTests();
    configureOpenFdaRateLimit();
    __resetOpenFdaForTests();
    for (const drug of ["sertraline", "lithium", "fluoxetine", "paroxetine", "citalopram", "venlafaxine"]) await lookupDrugLabel({ drug });
    await expect(lookupDrugLabel({ drug: "desvenlafaxine" })).rejects.toMatchObject({ status: 429 });
    const res = await post({ drug: "levomilnacipran" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: "rate-limited" });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("daily cap without a key stops before calling upstream; a key raises the cap", async () => {
    __resetOpenFdaForTests(OPENFDA_DAILY_CAP.withoutKey);
    await expect(lookupDrugLabel({ drug: "sertraline" })).rejects.toMatchObject({ status: 429, message: "Daily request limit reached, try again tomorrow" });
    expect(fetchMock).not.toHaveBeenCalled();
    process.env.OPENFDA_API_KEY = "abcDEF1234567890abcDEF1234567890abcDEF12";
    await expect(lookupDrugLabel({ drug: "sertraline" })).resolves.toMatchObject({ found: true });
    __resetOpenFdaForTests(OPENFDA_DAILY_CAP.withKey);
    await expect(lookupDrugLabel({ drug: "lithium" })).rejects.toMatchObject({ status: 429 });
  });

  it("upstream errors map to safe errors: 500 -> 502, upstream 429 -> 429, network -> 502, bad JSON shape -> 502", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await expect(lookupDrugLabel({ drug: "sertraline" })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockResolvedValueOnce(json({ error: { code: "OVER_RATE_LIMIT" } }, 429));
    const limited = await post({ drug: "lithium" });
    expect(limited.status).toBe(429);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const net = await post({ drug: "fluoxetine" });
    expect(net.status).toBe(502);
    expect(await net.json()).toEqual({ ok: false, error: "Upstream service did not respond", code: "upstream" });
    fetchMock.mockResolvedValueOnce(json({ meta: {}, results: [] }));
    await expect(lookupDrugLabel({ drug: "paroxetine" })).rejects.toMatchObject({ status: 502, message: "Unexpected response from upstream service" });
  });

  it("route returns data with the exact openFDA attribution and source", async () => {
    const body = await (await post({ drug: "sertraline" })).json();
    expect(body).toMatchObject({ ok: true, attribution: DRUG_LABEL_ATTRIBUTION, source: DRUG_LABEL_SOURCE });
    expect(body.attribution).toBe(
      "Data from openFDA (U.S. FDA). Not for prescribing decisions; consult the full prescribing information. openFDA does not endorse this app.",
    );
    expect(body.data.boxedWarning).toMatch(/^WARNING: SUICIDAL THOUGHTS/);
  });
});
