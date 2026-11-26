/**
 * Accessibility (WCAG 2.2 AA via axe-core) on every route and on the dynamic states that matter
 * most: possible diagnoses with results, the PHQ-9 item 9 alert, the red-flag and identifier
 * banners, the under-18 notice and the crisis dialog. Zero violations allowed, in light and dark.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ROUTES, answerItem, choose, crisisButton, enterSymptomText, gotoReady, navLink } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** @axe-core/playwright types its Page from the top-level playwright-core, which can differ by a minor version. */
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]["page"];

async function openAllDetails(page: Page): Promise<void> {
  await page.locator("details").evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
}

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

/** Text with a red flag, a negation and planted (fake) identifiers so every banner renders. */
const BUSY_TEXT =
  "Client Jonathan Testperson, phone (555) 867-5309. Sudden panic attacks with heart racing and dizzy spells, " +
  "avoids buses and crowds, wish I were dead at times, denies nightmares.";

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    for (const route of ROUTES) {
      test(`route ${route}`, async ({ page }) => {
        await gotoReady(page, route);
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

    test("possible diagnoses with results", async ({ page }) => {
      await gotoReady(page, "/symptoms");
      await enterSymptomText(page, BUSY_TEXT);
      await choose(page, "Duration", "1 to 6 months");
      await choose(page, "Clinically significant distress or functional impairment", "Yes");
      await choose(page, "A medical condition could explain the symptoms", "Yes");
      await navLink(page, "Diagnoses").click();
      await expect(page.getByRole("list", { name: "Possible considerations, ranked" })).toBeVisible();
      await expect(page.getByRole("article").first()).toBeVisible();
      await openAllDetails(page);
      await audit(page, `diagnoses with results (${scheme})`);
    });

    test("under-18 notice on both clinician screens", async ({ page }) => {
      await gotoReady(page, "/symptoms");
      await enterSymptomText(page, "Worries about everything, restless, cannot sleep.");
      await choose(page, "Client is under 18", "Yes, under 18");
      await audit(page, `symptoms under 18 (${scheme})`);
      await navLink(page, "Diagnoses").click();
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

    for (const route of ["/symptoms", "/client"] as const) {
      test(`crisis dialog open on ${route}`, async ({ page }) => {
        await gotoReady(page, route);
        await crisisButton(page).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await audit(page, `crisis dialog ${route} (${scheme})`);
        // Another country (no listed line) shows the directory fallback.
        await page.getByRole("dialog").getByLabel("Country").selectOption("OTHER");
        await audit(page, `crisis dialog ${route}, other country (${scheme})`);
      });
    }
  });
}
