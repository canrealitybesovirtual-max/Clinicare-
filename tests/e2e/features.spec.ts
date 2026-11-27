/**
 * Phase 2-4 screens end to end, against canned upstream answers (E2E_UPSTREAM_FIXTURES=1):
 * - treatment plan builder: PDF and DOCX exports start, contain the disclaimer, and SUD plans carry the Part 2 notice;
 * - FHIR export downloads a QuestionnaireResponse with no identifier keys;
 * - share links hold only /r/<id>, and the share page is client-safe;
 * - client pages (topics with live MedlinePlus results, skills, help, /r/<id>) show no ICD codes, diagnosis names
 *   or scores (G3);
 * - every substance-use context shows the 42 CFR Part 2 prompt (G6);
 * - live lookups show the attribution string the route returned, offer retry when rate-limited or offline, and
 *   fall back to an official link.
 */
import { unzipSync, strFromU8 } from "fflate";
import { expect, test, type Page } from "@playwright/test";
import {
  CLIENT_ROUTES,
  DISCLAIMER,
  PART2_NOTICE,
  SAMPLE,
  SUD_HUB_PROMPT,
  answerItem,
  buildPlan,
  choose,
  conditionNameTerms,
  downloadVia,
  enterSymptomText,
  expectClientSafe,
  goNav,
  gotoReady,
  loadHandouts,
  pdfText,
} from "./helpers";

/** Text of every XML part of a DOCX (document, headers, footers). */
export function docxText(bytes: Buffer): string {
  const files = unzipSync(new Uint8Array(bytes));
  return Object.entries(files)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, data]) => strFromU8(data))
    .join("\n")
    .replace(/<[^>]+>/g, "");
}

const PDF_FOOTER = "Resource only. Not a substitute for clinical judgment.";

async function sudPrompt(page: Page) {
  await expect(page.getByText(SUD_HUB_PROMPT).first()).toBeVisible();
}

test.describe("treatment plan builder", () => {
  test("exports a plan as PDF and DOCX, with the disclaimer and edited wording", async ({ page }) => {
    await gotoReady(page, "/plan");
    await buildPlan(page, "Generalized anxiety disorder", { customObjective: "Practice slow breathing for five minutes each evening." });
    const step = page.getByRole("region", { name: /^Step \d+ of \d+/ });
    await expect(step).toContainText("Practice slow breathing for five minutes each evening.");
    await expect(step).toContainText("See DSM-5-TR.");

    const pdf = await downloadVia(page, step.getByRole("button", { name: "Download PDF" }));
    expect(pdf.bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdf.name).toBe("Treatment plan draft.pdf");
    const text = pdfText(pdf.bytes).drawn;
    expect(text).toContain(PDF_FOOTER);
    expect(text).toContain("Practice slow breathing");
    expect(text).not.toContain(PART2_NOTICE);
    await expect(page.getByText("PDF created on this device.")).toBeVisible();

    const docx = await downloadVia(page, step.getByRole("button", { name: "Download Word (.docx)" }));
    expect(docx.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(docx.name).toBe("Treatment plan draft.docx");
    const words = docxText(docx.bytes);
    expect(words).toContain(PDF_FOOTER);
    expect(words).toContain("Practice slow breathing for five minutes each evening.");
    await expect(page.getByText("Word document created on this device.")).toBeVisible();
  });

  test("a substance-use plan shows the Part 2 prompt and both exports print the Part 2 notice", async ({ page }) => {
    await gotoReady(page, "/plan");
    await buildPlan(page, "Alcohol use disorder");
    await sudPrompt(page);
    await expect(page.getByText("42 CFR Part 2", { exact: true }).first()).toBeVisible();
    const step = page.getByRole("region", { name: /^Step \d+ of \d+/ });
    await expect(step.getByText(PART2_NOTICE)).toBeVisible();

    const pdf = await downloadVia(page, step.getByRole("button", { name: "Download PDF" }));
    expect(pdf.bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdfText(pdf.bytes).drawn).toContain(PART2_NOTICE);
    const docx = await downloadVia(page, step.getByRole("button", { name: "Download Word (.docx)" }));
    expect(docx.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(docxText(docx.bytes)).toContain(PART2_NOTICE);
  });

  test("a ?condition=<curated id> link preselects the library; anything else is ignored", async ({ page }) => {
    await gotoReady(page, "/plan?condition=panic-disorder");
    await expect(page.getByText("Plan library: Panic disorder")).toBeVisible();
    await gotoReady(page, "/plan?condition=not-a-library");
    await expect(page.getByLabel("Plan library")).toHaveValue("");
  });
});

test.describe("FHIR export (no identifiers)", () => {
  const FORBIDDEN = ["subject", "author", "source", "encounter", "identifier", "id", "patient", "name", "telecom", "address", "birthDate", "basedOn", "partOf", "contained", "reference", "performer", "authored"];

  function keysOf(node: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(node)) node.forEach((v) => keysOf(v, out));
    else if (node && typeof node === "object")
      for (const [k, v] of Object.entries(node)) {
        out.add(k);
        keysOf(v, out);
      }
    return out;
  }

  test("a scored GAD-7 downloads as a QuestionnaireResponse without identifier keys", async ({ page }) => {
    await gotoReady(page, "/measures/gad-7");
    const exportButton = page.getByRole("button", { name: "Export FHIR (no identifiers)" });
    await expect(exportButton).toBeDisabled();
    for (let i = 1; i <= 7; i++) await answerItem(page, i, 7, i % 2 ? "Several days" : "More than half the days");
    const { bytes, name } = await downloadVia(page, exportButton);
    expect(name).toBe("gad-7-response.fhir.json");
    const qr = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    expect(qr.resourceType).toBe("QuestionnaireResponse");
    expect(qr.status).toBe("completed");
    expect(qr.questionnaire).toMatch(/^http:\/\/loinc\.org\/q\/69737-5/);
    expect(Object.keys(qr)).not.toContain("text");
    expect(Object.keys(qr)).not.toContain("meta");
    const keys = keysOf(qr);
    for (const k of FORBIDDEN) expect(keys.has(k), `forbidden key ${k}`).toBe(false);
    const raw = bytes.toString("utf8");
    expect(raw).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/); // no date of any kind
    await expect(page.getByText(/FHIR file created on this device/)).toBeVisible();
  });
});

test.describe("share a handout", () => {
  test("the link and QR code hold only /r/<id>, and the link opens the client-safe share page", async ({ page, baseURL }) => {
    // Type something first: nothing from the session may end up in the link.
    await gotoReady(page, "/symptoms");
    await enterSymptomText(page, "Worries about everything, restless, cannot sleep.");
    await goNav(page, "Handouts");
    await expect(page).toHaveURL(/\/handouts$/);
    await page.getByRole("link", { name: /Muscle relaxation/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/handouts/${SAMPLE.handout}$`));

    const link = page.getByLabel("Link to send");
    const origin = new URL(baseURL ?? "http://127.0.0.1:3100").origin;
    await expect(link).toHaveValue(`${origin}/r/${SAMPLE.handout}`);
    await expect(page.getByRole("img", { name: /^QR code that opens the link to/ })).toBeVisible();
    const qrSrc = await page.getByRole("img", { name: /^QR code that opens the link to/ }).getAttribute("src");
    expect(qrSrc).toMatch(/^data:image\/svg\+xml/);

    const href = await link.inputValue();
    const u = new URL(href);
    expect(u.search).toBe("");
    expect(u.hash).toBe("");
    expect(u.pathname).toMatch(/^\/r\/[a-z0-9-]+$/);

    await page.goto(u.pathname);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Get help now" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await expectClientSafe(page, u.pathname);
  });
});

test.describe("client pages (G3)", () => {
  for (const route of CLIENT_ROUTES) {
    test(`${route} shows no ICD codes, diagnosis names or scores`, async ({ page }) => {
      await gotoReady(page, route);
      if (route.startsWith("/client/topics/")) {
        // Live MedlinePlus results (fixtures include a title that names a condition: it must be replaced).
        await expect(page.getByText("Information from MedlinePlus.gov")).toBeVisible();
      }
      await page.locator("details").evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
      await expectClientSafe(page, route);
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    });
  }

  test("the full HTML of every client handout page, scripts included, names no condition", async ({ request }) => {
    // Server pages hand the client view only client-safe sources (src/lib/client-safe.ts clientHandout), so
    // diagnosis-named source titles never reach the client's device, not even in the page payload.
    // Everyday words a sheet uses itself ("panic" in the panic-cycle sheet) are its own reviewed client text.
    const all = [...conditionNameTerms(), "bipolar", "schizophren", "adhd", "psychotic"];
    for (const h of loadHandouts()) {
      const terms = all.filter((t) => !h.ownText.includes(t));
      const routes = [`/r/${h.id}`, `/client/skills/${h.id}`, ...(h.es ? [`/r/${h.id}/es`] : [])];
      for (const route of routes) {
        const res = await request.get(route);
        expect(res.status(), route).toBe(200);
        const html = (await res.text()).toLowerCase();
        for (const t of terms) expect(html.includes(t), `${route}: ${t}`).toBe(false);
      }
    }
  });

  test("the relationship-safety pages have a neutral tab title, a quick exit and discreet-browsing tips", async ({ page }) => {
    for (const route of ["/client/topics/relationship-safety", "/r/relationship-safety-help-card"]) {
      await gotoReady(page, route);
      await expect(page).toHaveTitle("Health information");
      const exit = page.getByRole("link", { name: "Quick exit" });
      await expect(exit).toBeVisible();
      await expect(exit).toHaveAttribute("href", "https://www.google.com/");
      await expect(page.getByText("Is someone else able to check this phone or computer?")).toBeVisible();
      await expect(page.getByText("988").first()).toBeVisible(); // crisis help stays on screen (G9)
    }
    await gotoReady(page, `/client/topics/${SAMPLE.topic}`);
    await expect(page.getByRole("link", { name: "Quick exit" })).toHaveCount(0);
  });

  test("a topic page in Spanish keeps the attribution and stays client-safe", async ({ page }) => {
    await gotoReady(page, `/client/topics/${SAMPLE.conditionTopic}`);
    await expect(page.getByText("Information from MedlinePlus.gov")).toBeVisible();
    await choose(page, "Language / Idioma", "Español");
    await expect(page.getByText("Estrés (fixture)")).toBeVisible();
    await expect(page.getByText("Information from MedlinePlus.gov")).toBeVisible();
    await expectClientSafe(page, "topic in Spanish");
  });
});

test.describe("substance-use contexts show the 42 CFR Part 2 prompt (G6)", () => {
  for (const route of [`/interventions/${SAMPLE.sudIntervention}`, `/medications/${SAMPLE.sudMedication}`, `/handouts/${SAMPLE.sudHandout}`]) {
    test(route, async ({ page }) => {
      await gotoReady(page, route);
      await sudPrompt(page);
    });
  }

  test("the substance-use handout PDF prints the Part 2 notice", async ({ page }) => {
    await gotoReady(page, `/handouts/${SAMPLE.sudHandout}`);
    await expect(page.getByText(PART2_NOTICE).first()).toBeVisible();
    const { bytes } = await downloadVia(page, page.getByRole("button", { name: "Download PDF" }).first());
    expect(pdfText(bytes).drawn).toContain(PART2_NOTICE);
  });

  test("an SUD ICD-10-CM lookup shows the prompt and the notice", async ({ page }) => {
    await gotoReady(page, "/diagnoses");
    await page.getByLabel("ICD-10-CM code or prefix").fill("F10.20");
    await page.getByRole("button", { name: "Look up" }).click();
    const lookup = page.getByRole("region", { name: "ICD-10-CM code lookup" });
    await expect(lookup.getByText("Alcohol dependence, uncomplicated")).toBeVisible();
    await expect(lookup.getByText(SUD_HUB_PROMPT)).toBeVisible();
    await expect(lookup.getByText(PART2_NOTICE)).toBeVisible();
    await expect(lookup.getByText("ICD-10-CM codes: NLM Clinical Table Search Service (provided as is)")).toBeVisible();
  });

  test("addiction-counselor and substance-use facility searches show the prompt and the notice", async ({ page }) => {
    await gotoReady(page, "/referrals");
    const form = page.getByRole("form", { name: "Find care near a location" });
    await form.getByLabel("Provider type").selectOption({ label: "Addiction counselor" });
    await expect(form.getByText(SUD_HUB_PROMPT)).toBeVisible();
    await form.getByRole("textbox", { name: "ZIP code" }).fill("62701");
    await form.getByRole("button", { name: "Search" }).click();
    const results = page.getByRole("region", { name: /^Addiction counselor near/ });
    await expect(results.getByText(SUD_HUB_PROMPT)).toBeVisible();
    await expect(results.getByText("42 CFR Part 2", { exact: true })).toBeVisible();

    await choose(form, "What to find", "Treatment facilities");
    await form.getByLabel("Type of treatment").selectOption({ label: "Substance use" });
    await form.getByRole("button", { name: "Search" }).click();
    const facilities = page.getByRole("region", { name: /^Treatment facilities/ });
    await expect(facilities.getByRole("heading", { name: "Fixture Treatment Center 1" })).toBeVisible();
    await expect(facilities.getByText("42 CFR Part 2", { exact: true })).toBeVisible();
    await expect(facilities.getByText(/^Data: SAMHSA FindTreatment\.gov\./)).toBeVisible();
  });
});

test.describe("live lookups: attribution, retry, offline", () => {
  test("referral searches by ZIP and by city show results and the returned attribution", async ({ page }) => {
    await gotoReady(page, "/referrals");
    const form = page.getByRole("form", { name: "Find care near a location" });
    await form.getByLabel("Provider type").selectOption({ label: "Psychologist" });
    await form.getByRole("textbox", { name: "ZIP code" }).fill("62701");
    await form.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Showing \d+ results?\.$/ })).toBeVisible();
    const results = page.getByRole("region", { name: /^Psychologist near/ });
    await expect(results.getByRole("heading", { name: "Riley Fixture, PHD" })).toBeVisible();
    await expect(results.getByText(/^Data: CMS NPPES NPI Registry\./)).toBeVisible();

    await choose(form, "What to find", "Health centers");
    await choose(form, "Search location", "By city and state");
    await form.getByRole("textbox", { name: "City", exact: true }).fill("Springfield");
    await form.getByLabel("State or territory").selectOption("IL");
    await form.getByRole("button", { name: "Search" }).click();
    const centers = page.getByRole("region", { name: /^Health centers within/ });
    await expect(centers.getByRole("heading", { name: "Fixture Community Health Center 1" })).toBeVisible();
    await expect(centers.getByText(/^Data: HRSA Data Warehouse/)).toBeVisible();
  });

  test("a rate-limited search offers retry and the official finder; offline offers retry too", async ({ page, context }) => {
    await gotoReady(page, "/referrals");
    const form = page.getByRole("form", { name: "Find care near a location" });
    await form.getByRole("textbox", { name: "ZIP code" }).fill("99950"); // fixture: NPPES answers 429
    await form.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Too many searches in a short time", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    await form.getByRole("textbox", { name: "ZIP code" }).fill("62701");
    await context.setOffline(true);
    try {
      await form.getByRole("button", { name: "Search" }).click();
      await expect(page.getByText("You appear to be offline", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Showing \d+ results?\.$/ })).toBeVisible();
  });

  test("diagnoses: ICD-11 and MedlinePlus panels load on open and show their attribution", async ({ page }) => {
    await gotoReady(page, "/symptoms");
    await enterSymptomText(
      page,
      "Worries about everything most days and cannot stop worrying. Restless and keyed up, tired all the time, cannot concentrate, irritable, tight shoulders, and trouble sleeping.",
    );
    await choose(page, "Duration", "6 months or longer");
    await choose(page, "Clinically significant distress or functional impairment", "Yes");
    await goNav(page, "Diagnoses");
    const gad = page.getByRole("article", { name: "Generalized anxiety disorder" });
    await expect(gad).toBeVisible();
    await gad.getByRole("button", { name: /^ICD-11 details \(WHO\)/ }).click();
    await expect(gad.getByText("WHO title:")).toBeVisible();
    await expect(gad.getByText(/^ICD-11 content: World Health Organization \(WHO\) ICD-API/)).toBeVisible();
    await gad.getByRole("button", { name: /^Psychoeducation links \(MedlinePlus\)/ }).click();
    await expect(gad.getByText("Information from MedlinePlus.gov").first()).toBeVisible();
  });

  test("intervention evidence: PubMed and trials results with attribution", async ({ page }) => {
    await gotoReady(page, `/interventions/${SAMPLE.intervention}`);
    await page.getByRole("button", { name: "Show PubMed results" }).click();
    await expect(page.getByText(/^Fixture citation 1:/)).toBeVisible();
    await expect(page.getByText(/^Citations from PubMed/)).toBeVisible();
    const trials = page.getByRole("button", { name: "Show recruiting trials" });
    if (await trials.count()) {
      await trials.click();
      await expect(page.getByText("Fixture recruiting study 1 for automated tests")).toBeVisible();
      await expect(page.getByText(/^Source: ClinicalTrials\.gov/)).toBeVisible();
    }
  });

  test("medication: FDA label and RxNorm panels load with attribution", async ({ page }) => {
    await gotoReady(page, `/medications/${SAMPLE.medication}`);
    const label = page.getByRole("region", { name: "Current FDA label (openFDA)" });
    await expect(label.getByText(/Test fixture boxed warning/)).toBeVisible();
    await expect(label.getByText(/^Data from openFDA/)).toBeVisible();
    const rx = page.getByRole("region", { name: "RxNorm names and classes" });
    await expect(rx.getByText("Zoloft").first()).toBeVisible();
    await expect(rx.getByText(/courtesy of the U\.S\. National Library of Medicine/)).toBeVisible();
  });
});

test.describe("disclaimer on generated files (G14)", () => {
  test("a handout PDF carries the footer", async ({ page }) => {
    await gotoReady(page, `/handouts/${SAMPLE.handout}`);
    const { bytes } = await downloadVia(page, page.getByRole("button", { name: "Download PDF" }).first());
    expect(pdfText(bytes).drawn).toContain(PDF_FOOTER);
    await expect(page.getByRole("contentinfo")).toContainText(DISCLAIMER);
  });
});
