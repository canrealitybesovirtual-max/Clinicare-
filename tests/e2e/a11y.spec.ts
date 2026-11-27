/**
 * Accessibility (WCAG 2.2 AA via axe-core) on every route and on the dynamic states that matter most: possible
 * diagnoses with results and their live panels open, the plan builder mid-edit and at review, referral results,
 * intervention evidence, medication label panels, handout sharing (QR shown), client topic results, the PHQ-9
 * item 9 alert, the red-flag and identifier banners, the under-18 notice and the crisis dialog.
 * Zero violations allowed, in light and dark. Live lookups answer from upstream fixtures (E2E_UPSTREAM_FIXTURES=1).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  ROUTES,
  SAMPLE,
  answerItem,
  buildPlan,
  choose,
  crisisButton,
  enterSymptomText,
  expandAll,
  goNav,
  gotoReady,
  openAllDetails,
} from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** @axe-core/playwright types its Page from the top-level playwright-core, which can differ by a minor version. */
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]["page"];

async function audit(page: Page, label: string): Promise<void> {
  // Let transitions and live-region updates settle before measuring contrast.
  await page.waitForTimeout(150);
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).withTags(TAGS).analyze();
  const report = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"})\n` +
      v.nodes
        .slice(0, 6)
        .map((n) => `    ${n.target.join(" ")} :: ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 240)}`)
        .join("\n"),
  );
  expect(report, `axe violations on ${label}`).toEqual([]);
}

/** Exactly one h1 per page (WCAG 1.3.1 / 2.4.6 practice). */
async function oneH1(page: Page, label: string): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 }), label).toHaveCount(1);
}

/** Text with a red flag, a negation and planted (fake) identifiers so every banner renders. */
const BUSY_TEXT =
  "Client Jonathan Testperson, phone (555) 867-5309. Sudden panic attacks with heart racing and dizzy spells, " +
  "avoids buses and crowds, wish I were dead at times, denies nightmares.";

const WORRY_TEXT =
  "Worries about everything most days and cannot stop worrying. Restless and keyed up, tired all the time, " +
  "cannot concentrate, irritable, tight shoulders, and trouble sleeping.";

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    for (const route of ROUTES) {
      test(`route ${route}`, async ({ page }) => {
        await gotoReady(page, route);
        await oneH1(page, route);
        await openAllDetails(page);
        await audit(page, `${route} (${scheme})`);
      });
    }

    test("not-found page", async ({ page }) => {
      await page.goto("/no-such-page");
      await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
      await audit(page, `404 (${scheme})`);
    });

    test("symptom finder with identifier alert, red flag and search results", async ({ page }) => {
      await gotoReady(page, "/symptoms");
      await enterSymptomText(page, BUSY_TEXT);
      await expect(page.getByRole("alert").filter({ hasText: "Possible identifiers removed" })).toBeVisible();
      await expect(page.getByText(/^Safety red flags?: assess directly$/)).toBeVisible();
      await page.getByLabel("Search symptoms").fill("sleep");
      await page.getByLabel("Search symptoms").blur();
      await choose(page, "Duration", "1 to 6 months");
      await choose(page, "Clinically significant distress or functional impairment", "Yes");
      await openAllDetails(page);
      await audit(page, `symptoms with banners (${scheme})`);
    });

    test("possible diagnoses with results and every live panel open", async ({ page }) => {
      await gotoReady(page, "/symptoms");
      await enterSymptomText(page, WORRY_TEXT);
      await choose(page, "Duration", "6 months or longer");
      await choose(page, "Clinically significant distress or functional impairment", "Yes");
      await choose(page, "A medical condition could explain the symptoms", "Yes");
      await goNav(page, "Diagnoses");
      await expect(page.getByRole("list", { name: "Possible considerations, ranked" })).toBeVisible();
      const first = page.getByRole("article").first();
      await expect(first).toBeVisible();
      await expandAll(first);
      await expect(first.getByText("WHO title:").first()).toBeVisible();
      await expect(first.getByText("Information from MedlinePlus.gov").first()).toBeVisible();
      // The ICD-10-CM lookup with results.
      await page.getByLabel("ICD-10-CM code or prefix").fill("F41");
      await page.getByRole("button", { name: "Look up" }).click();
      await expect(page.getByText(/^\d+ of \d+ matching codes?$/)).toBeVisible();
      await openAllDetails(page);
      await audit(page, `diagnoses with live panels (${scheme})`);
    });

    test("plan builder: library chosen, objectives edited (identifier alert shown), then review", async ({ page }) => {
      await gotoReady(page, "/plan");
      await page.getByLabel("Plan library").selectOption({ label: "Generalized anxiety disorder" });
      await openAllDetails(page);
      await audit(page, `plan focus step (${scheme})`);

      const step = page.getByRole("region", { name: /^Step \d+ of \d+/ });
      const next = () => step.getByRole("button", { name: /^Next: / }).click();
      await next(); // Formulation (optional)
      await audit(page, `plan formulation step (${scheme})`);
      await next(); // Problems
      await step.getByRole("checkbox").first().check();
      for (let i = 0; i < 3; i++) {
        await next();
        await step.getByRole("checkbox").first().check();
      }
      // Edit a library objective and add one in the client's words (with a fake identifier, to show the alert).
      await step.getByRole("button", { name: /^Edit wording/ }).first().click();
      const editor = step.getByLabel("Wording for this objective");
      await editor.fill("Walk for 20 minutes on three days each week, agreed with the client.");
      await step.getByRole("button", { name: "Done editing" }).click();
      await expect(step.getByText("Edited", { exact: true }).first()).toBeVisible();
      await step.getByRole("button", { name: /^Add an objective/ }).first().click();
      await step.getByLabel("Wording for this objective").fill("Call Jonathan Testperson at (555) 867-5309 to plan a walk.");
      await step.getByLabel("Wording for this objective").blur();
      await expect(step.getByText("Possible identifiers removed")).toBeVisible();
      await audit(page, `plan objectives edited (${scheme})`);

      await next(); // Interventions
      await audit(page, `plan interventions (${scheme})`);
      await next(); // Measures
      await next(); // Review
      await expect(step.getByRole("heading", { name: "Export", exact: true })).toBeVisible();
      await audit(page, `plan review (${scheme})`);
    });

    test("SUD plan at review (Part 2 prompt and notice)", async ({ page }) => {
      await gotoReady(page, "/plan");
      await buildPlan(page, "Alcohol use disorder");
      await audit(page, `SUD plan review (${scheme})`);
    });

    test("referrals with fixture results, a 429 retry and a city search", async ({ page }) => {
      await gotoReady(page, "/referrals");
      const form = page.getByRole("form", { name: "Find care near a location" });
      await form.getByRole("textbox", { name: "ZIP code" }).fill("62701");
      await form.getByRole("button", { name: "Search" }).click();
      await expect(page.getByRole("status").filter({ hasText: /^Showing \d+ results?\.$/ })).toBeVisible();
      await openAllDetails(page);
      await audit(page, `referrals: provider results (${scheme})`);

      await form.getByRole("textbox", { name: "ZIP code" }).fill("99950");
      await form.getByRole("button", { name: "Search" }).click();
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
      await audit(page, `referrals: rate-limited (${scheme})`);

      await choose(form, "What to find", "Treatment facilities");
      await form.getByLabel("Type of treatment").selectOption({ label: "Mental health and substance use" });
      await choose(form, "Search location", "By city and state");
      await form.getByRole("textbox", { name: "City", exact: true }).fill("Springfield");
      await form.getByLabel("State or territory").selectOption("IL");
      await form.getByRole("button", { name: "Search" }).click();
      await expect(page.getByRole("heading", { name: "Fixture Treatment Center 1" })).toBeVisible();
      await openAllDetails(page);
      await audit(page, `referrals: SUD facility results (${scheme})`);
    });

    test("intervention with evidence results open", async ({ page }) => {
      await gotoReady(page, `/interventions/${SAMPLE.intervention}`);
      await page.getByRole("button", { name: "Show PubMed results" }).click();
      await expect(page.getByText(/^Fixture citation 1:/)).toBeVisible();
      const trials = page.getByRole("button", { name: "Show recruiting trials" });
      if (await trials.count()) {
        await trials.click();
        await expect(page.getByText("Fixture recruiting study 1 for automated tests")).toBeVisible();
      }
      await expandAll(page.locator("main"));
      await openAllDetails(page);
      await audit(page, `intervention evidence (${scheme})`);
    });

    for (const id of [SAMPLE.medication, SAMPLE.sudMedication]) {
      test(`medication ${id} with label and RxNorm panels loaded and opened`, async ({ page }) => {
        await gotoReady(page, `/medications/${id}`);
        await expect(page.getByText(/^Data from openFDA/)).toBeVisible();
        await expect(page.getByText(/courtesy of the U\.S\. National Library of Medicine/)).toBeVisible();
        await openAllDetails(page);
        await audit(page, `medication ${id} (${scheme})`);
      });
    }

    test("handout detail with the share QR code shown", async ({ page }) => {
      await gotoReady(page, `/handouts/${SAMPLE.handout}`);
      await expect(page.getByRole("img", { name: /^QR code that opens the link to/ })).toBeVisible();
      await openAllDetails(page);
      await audit(page, `handout share (${scheme})`);
    });

    test("client topic with live results, English and Spanish", async ({ page }) => {
      await gotoReady(page, `/client/topics/${SAMPLE.conditionTopic}`);
      await expect(page.getByText("Information from MedlinePlus.gov")).toBeVisible();
      await audit(page, `client topic (${scheme})`);
      await choose(page, "Language / Idioma", "Español");
      await expect(page.getByText("Estrés (fixture)")).toBeVisible();
      await audit(page, `client topic in Spanish (${scheme})`);
    });

    test("under-18 notice on both clinician screens", async ({ page }) => {
      await gotoReady(page, "/symptoms");
      await enterSymptomText(page, "Worries about everything, restless, cannot sleep.");
      await choose(page, "Client is under 18", "Yes, under 18");
      await audit(page, `symptoms under 18 (${scheme})`);
      await goNav(page, "Diagnoses");
      await expect(page.getByText("Adult content only", { exact: true })).toBeVisible();
      await audit(page, `diagnoses under 18 (${scheme})`);
    });

    test("PHQ-9 fully answered with the item 9 alert", async ({ page }) => {
      await gotoReady(page, "/measures/phq-9");
      for (let i = 1; i <= 9; i++) await answerItem(page, i, 9, i === 9 ? "Several days" : "More than half the days");
      await page.getByRole("group", { name: /^Functional difficulty/ }).getByRole("radio", { name: "Very difficult" }).check();
      await expect(page.getByText("Follow up on item 9 now")).toBeVisible();
      await expect(page.getByText(/^Severity band: /)).toBeVisible();
      await openAllDetails(page);
      await audit(page, `PHQ-9 item 9 alert (${scheme})`);
    });

    for (const route of ["/symptoms", "/client", `/r/${SAMPLE.handout}`] as const) {
      test(`crisis dialog open on ${route}`, async ({ page }) => {
        await gotoReady(page, route);
        await crisisButton(page).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        // APG modal: aria-modal, and the page behind it is inert (aria-hidden alone skips live regions).
        await expect(page.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
        for (const id of ["site-header", "main"]) {
          expect(await page.locator(`#${id}`).evaluate((el) => (el as HTMLElement).inert), id).toBe(true);
        }
        await audit(page, `crisis dialog ${route} (${scheme})`);
        // Another country (no listed line) shows the directory fallback.
        await page.getByRole("dialog").getByLabel("Country").selectOption("OTHER");
        await audit(page, `crisis dialog ${route}, other country (${scheme})`);
      });
    }

    test('guided follow-up for "panic from dogs" with an answer given', async ({ page }) => {
      await gotoReady(page, "/symptoms");
      await enterSymptomText(page, "panic from dogs");
      const panel = page.getByRole("region", { name: /Help me ask more/ });
      await expect(panel.getByRole("heading", { name: "Specific phobia" })).toBeVisible();
      await audit(page, `follow-up panel (${scheme})`);
      await panel.getByRole("button", { name: "Only around dogs" }).click();
      await expect(panel.getByRole("button", { name: /^Change answer to:/ }).first()).toBeVisible();
      await audit(page, `follow-up panel answered (${scheme})`);
    });

    test("ethics hub with card bodies loaded", async ({ page }) => {
      await gotoReady(page, "/ethics");
      await openAllDetails(page);
      // The long card parts load as their own chunk once a disclosure opens.
      await expect(page.getByText("Loading…")).toHaveCount(0);
      await expect(page.locator("main details[open]").first()).toBeVisible();
      await audit(page, `ethics bodies open (${scheme})`);
    });

    test("measure trend with totals and the chart", async ({ page }) => {
      await gotoReady(page, "/tools/trend?measure=phq-9");
      for (const [session, total] of [["1", "18"], ["4", "8"]] as const) {
        await page.getByLabel("Session #", { exact: true }).fill(session);
        await page.getByRole("textbox", { name: /^PHQ-9 total/ }).fill(total);
        await page.getByRole("button", { name: /Add to trend/ }).click();
      }
      // A table from tablet width up, one card per session on phones; either way Remove is on screen.
      await expect(page.getByRole("button", { name: "Remove session #4" })).toBeVisible();
      // Nothing scrolls sideways, and the floating crisis button stays inside the screen (G9).
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(width.scroll).toBeLessThanOrEqual(width.client);
      const box = await crisisButton(page).boundingBox();
      const viewport = page.viewportSize()!;
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      await audit(page, `trend with totals (${scheme})`);
    });

    test("client mode in Spanish", async ({ page }) => {
      await gotoReady(page, "/client");
      await page.getByRole("banner").getByRole("button", { name: "Español" }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await openAllDetails(page);
      await audit(page, `client home in Spanish (${scheme})`);
    });

    test("navigation menus open (More menu or drawer)", async ({ page }) => {
      await gotoReady(page, "/symptoms");
      const drawer = page.getByRole("banner").getByRole("button", { name: /^Menu\b/ });
      if (await drawer.isVisible()) {
        await drawer.click();
        await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
      } else {
        await page.getByRole("banner").getByRole("button", { name: "More" }).click();
        await expect(page.getByRole("banner").getByRole("link", { name: "Ethics & Legal" })).toBeVisible();
      }
      await audit(page, `navigation menu open (${scheme})`);
    });
  });
}
