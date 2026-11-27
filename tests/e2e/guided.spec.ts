/**
 * Round 3 flows end to end (upstream fixtures, E2E_UPSTREAM_FIXTURES=1):
 * - "panic from dogs": the guided follow-up names the fear, offers specific phobia as a pattern to consider for
 *   clinician review, an answer re-scores on this device with no request leaving the page, and Diagnoses agrees;
 * - the Claude assistant is absent everywhere while the server has not enabled it (the e2e server sets none of
 *   ANTHROPIC_API_KEY, AI_ASSISTANT_ENABLED or AI_BAA_CONFIRMED), and its route answers "not configured";
 * - client mode and a handout switch from English to Spanish, including the printable PDF;
 * - the safety-plan worksheet prints the crisis lines, blank handwritten lines and the footer, never typed identifiers;
 * - the interventions list honours ?condition=<curated id> only.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  CLIENT_DISCLAIMER_ES,
  SAMPLE,
  choose,
  downloadVia,
  enterSymptomText,
  expectClientSafe,
  goNav,
  gotoReady,
  pdfText,
} from "./helpers";

const WORRY_TEXT =
  "Worries about everything most days and cannot stop worrying. Restless and keyed up, tired all the time, " +
  "cannot concentrate, irritable, tight shoulders, and trouble sleeping.";

/** Records every request to the app's own /api routes from now on. */
function apiRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) seen.push(`${r.method()} ${r.url()}`);
  });
  return seen;
}

test.describe('guided follow-up: "panic from dogs"', () => {
  test("names the fear, offers specific phobia to consider, re-scores on an answer, and Diagnoses agrees", async ({ page }) => {
    await gotoReady(page, "/symptoms");
    const api = apiRequests(page);
    await enterSymptomText(page, "panic from dogs");

    const panel = page.getByRole("region", { name: /Help me ask more/ });
    await expect(panel.getByRole("heading", { name: /^Questions to ask next/ })).toBeVisible();
    await expect(panel.getByText("For clinician review").first()).toBeVisible();
    // The pattern to consider carries its codes and the DSM-5-TR pointer, never a verdict.
    await expect(panel.getByRole("heading", { name: "Specific phobia" })).toBeVisible();
    await expect(panel).toContainText("F40.218");
    await expect(panel).toContainText("See DSM-5-TR");
    await expect(panel).not.toContainText(/diagnosed with|the client has|diagnosis is/i);
    // The text itself now documents the fear of animals (step 2); questions use the dictionary's label ("dogs"),
    // and the missing key feature, avoidance, is offered as a tap-to-add feature.
    await expect(page.getByRole("region", { name: /Check what was found/ })).toContainText("Phobic fear centered on animals");
    await expect(panel.getByText("Do the attacks happen only around dogs, or also out of the blue?")).toBeVisible();
    await expect(panel.getByRole("button", { name: /^Add symptom: Going out of the way to avoid the feared thing/ })).toBeVisible();

    await panel.getByRole("button", { name: "Only around dogs" }).click();
    await panel.getByRole("button", { name: "6 months or longer" }).click();
    // The duration answer is written into the Context step, where the clinician can still change it.
    await expect(page.getByRole("group", { name: "Duration" }).getByRole("radio", { name: "6 months or longer" })).toBeChecked();

    await page.getByRole("link", { name: /^See possible diagnoses \(\d+\)/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/diagnoses$/);
    const sp = page.getByRole("article", { name: "Specific phobia" });
    await expect(sp).toBeVisible();
    await expect(sp.getByText("For clinician review", { exact: true })).toBeVisible();
    await expect(sp).toContainText("6B03");
    await expect(sp).toContainText("DSM-5-TR");

    // Everything above ran on this device.
    expect(api).toEqual([]);
  });
});

test.describe("optional Claude assistant (owner amendment)", () => {
  test("is absent on both screens while the server has not enabled it, and its route says so", async ({ page }) => {
    await gotoReady(page, "/symptoms");
    const api = apiRequests(page);
    await enterSymptomText(page, WORRY_TEXT);
    await choose(page, "Duration", "6 months or longer");
    await choose(page, "Clinically significant distress or functional impairment", "Yes");
    await expect(page.getByRole("region", { name: /Help me ask more/ })).toBeVisible();
    await expect(page.getByText(/Ask the AI assistant/)).toHaveCount(0);
    // The on-device suggestions switch may show; no assistant switch may.
    await expect(page.getByRole("switch", { name: /assistant|Claude/i })).toHaveCount(0);

    await goNav(page, "Diagnoses");
    await expect(page.getByRole("list", { name: "Possible considerations, ranked" })).toBeVisible();
    await expect(page.getByText(/Ask the AI assistant/)).toHaveCount(0);
    expect(api.filter((r) => r.includes("/api/assistant"))).toEqual([]);

    const res = await page.request.post("/api/assistant", { data: {} });
    expect(res.status()).toBe(503);
    expect(((await res.json()) as { code?: string }).code).toBe("not-configured");
  });
});

test.describe("Spanish (EN to ES)", () => {
  test("client mode and a skill switch to Spanish, with a Spanish printout, and back", async ({ page }) => {
    await gotoReady(page, "/client");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("banner").getByRole("button", { name: "Español" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ayuda y ejercicios que puede usar hoy");
    await expect(page.getByRole("contentinfo")).toContainText(CLIENT_DISCLAIMER_ES);
    await expect(page.getByRole("button", { name: "Ayuda ahora" })).toBeVisible();
    await expectClientSafe(page, "client home in Spanish");
    await expect(page.locator("body")).not.toContainText(/trastorno|diagn[oó]stic|puntuaci/i);

    // The skill follows the shell language after a client-side navigation (the choice lives in memory only).
    await page.getByRole("link", { name: "Abrir el ejercicio" }).click();
    await expect(page).toHaveURL(new RegExp(`/client/skills/${SAMPLE.handout}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Práctica de relajación muscular en casa");
    const { bytes } = await downloadVia(page, page.getByRole("button", { name: "Descargar para imprimir" }));
    const { drawn } = pdfText(bytes);
    expect(drawn).toContain("Práctica de relajación muscular en casa");
    expect(drawn).toContain("Página 1 de");
    expect(drawn).toContain("Solo es un recurso. No sustituye el juicio clínico.");
    await expectClientSafe(page, "skill in Spanish");

    await page.getByRole("banner").getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Muscle Relaxation Practice at Home");
  });

  test("the clinician handout page previews and prints the Spanish version, with the Part 2 notice on a substance-use sheet", async ({ page }) => {
    await gotoReady(page, `/handouts/${SAMPLE.handout}`);
    await choose(page, "Language / Idioma", "Español");
    // The preview the client will read switches; the page title stays the clinician's English heading.
    await expect(page.getByRole("heading", { name: "Prepárese" })).toBeVisible();
    const es = await downloadVia(page, page.getByRole("button", { name: "Download PDF (Español)" }));
    expect(pdfText(es.bytes).drawn).toContain("Página 1 de");

    await gotoReady(page, `/handouts/${SAMPLE.sudHandout}`);
    await choose(page, "Language / Idioma", "Español");
    const sud = pdfText((await downloadVia(page, page.getByRole("button", { name: "Download PDF (Español)" }))).bytes).drawn;
    // The Spanish notice prints above the exact English sentence.
    expect(sud).toContain("42 CFR Part 2 prohíbe el uso o la divulgación no autorizados de estos registros.");
    expect(sud).toContain("42 CFR Part 2 prohibits unauthorized use or disclosure of these records.");
  });
});

test.describe("safety plan worksheet", () => {
  test("prints crisis lines, handwritten lines and the footer, and never a typed identifier", async ({ page }) => {
    await gotoReady(page, "/tools/safety-plan");
    const signs = page.getByLabel("Part 1: Notice my early signs");
    await signs.fill("Skipping meals and not answering texts; calls Maria Lopez at 555-301-2299 at night.");
    await signs.blur();
    await expect(page.getByRole("alert").filter({ hasText: "Possible identifiers removed" })).toBeVisible();
    await expect(signs).not.toHaveValue(/Maria|555-301-2299/);

    const { bytes, name } = await downloadVia(page, page.getByRole("button", { name: "Download PDF", exact: true }));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(name).not.toMatch(/maria|lopez|555/i);
    const { all, drawn } = pdfText(bytes);
    expect(drawn).toContain("Skipping meals");
    for (const line of ["988", "911", "findahelpline.com"]) expect(drawn).toContain(line);
    expect(drawn).toContain("Person and how to reach them (write by hand)");
    expect(drawn).toContain("Resource only. Not a substitute for clinical judgment.");
    expect(drawn).toMatch(/Page 1 of \d/);
    expect(all).not.toMatch(/Maria|Lopez|555-301-2299|5553012299/);

    // The blank copy still carries the crisis lines.
    const blank = pdfText((await downloadVia(page, page.getByRole("button", { name: "Download blank PDF" }))).bytes).drawn;
    for (const line of ["988", "911", "findahelpline.com"]) expect(blank).toContain(line);
  });
});

test.describe("interventions filter by curated condition id", () => {
  test("?condition=<curated id> preselects the condition; anything else is ignored", async ({ page }) => {
    await gotoReady(page, "/interventions?condition=generalized-anxiety-disorder");
    const results = page.getByRole("region", { name: "Results" });
    await expect(results.getByText("For", { exact: false }).filter({ hasText: "Generalized anxiety disorder" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Show all conditions" })).toBeVisible();

    await gotoReady(page, "/interventions?condition=Jonathan%20Testperson");
    await expect(page.getByRole("button", { name: "Show all conditions" })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Jonathan");
  });
});
