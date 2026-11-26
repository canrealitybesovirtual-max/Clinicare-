/**
 * Core clinician and client flows: speed to a scored measure, crisis access and disclaimers on every
 * route, client-mode content limits (G3), the adult-only gate (G12), the PHQ-9 item 9 prompt (G9)
 * and on-device PDF downloads.
 */
import { expect, test } from "@playwright/test";
import {
  CLIENT_PHI_BANNER,
  CLINICIAN_PHI_BANNER,
  CLINICIAN_ROUTES,
  DISCLAIMER,
  ICD_CODE_RE,
  ROUTES,
  answerItem,
  choose,
  crisisButton,
  downloadVia,
  enterSymptomText,
  gotoReady,
  loadConditions,
  navLink,
} from "./helpers";

/** Original practice wording (no identifiers) that reads as a worry-predominant presentation. */
const WORRY_TEXT =
  "Worries about everything most days and cannot stop worrying. Restless and keyed up, tired all the time, " +
  "cannot concentrate, irritable, tight shoulders, and trouble sleeping.";

const GAD7_ANSWERS = ["More than half the days", "More than half the days", "Several days", "Nearly every day", "Several days", "More than half the days", "More than half the days"];
// 2 + 2 + 1 + 3 + 1 + 2 + 2 = 13 -> moderate band (10-14).

test.describe("clinician flow", () => {
  test("typed symptoms to a fully scored GAD-7 in under 60 seconds", async ({ page }) => {
    const started = Date.now();
    await gotoReady(page, "/symptoms");

    await enterSymptomText(page, WORRY_TEXT);
    await expect(page.getByRole("heading", { name: /^Detected from your text/ }).locator("..")).not.toContainText(
      "Nothing detected yet",
    );
    await choose(page, "Duration", "6 months or longer");
    await choose(page, "Clinically significant distress or functional impairment", "Yes");

    await page.getByRole("link", { name: /^See possible diagnoses \(\d+\)/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/diagnoses$/);

    const gad = page.getByRole("article", { name: "Generalized anxiety disorder" });
    await expect(gad).toBeVisible();
    await expect(gad.getByText("For clinician review", { exact: true })).toBeVisible();
    await expect(gad.getByText("Possible consideration — not a diagnosis.")).toBeVisible();
    await expect(gad.getByRole("heading", { name: /^Matched features \(\d+\)$/ })).toBeVisible();
    await expect(gad.getByRole("heading", { name: /^Missing features \(\d+\)$/ })).toBeVisible();
    await expect(gad).toContainText("F41.1");
    await expect(gad).toContainText("6B00");
    await expect(gad).toContainText("DSM-5-TR");

    await gad.getByRole("link", { name: "Run GAD-7" }).click();
    await expect(page).toHaveURL(/\/measures\/gad-7$/);

    for (const [i, option] of GAD7_ANSWERS.entries()) await answerItem(page, i + 1, 7, option);

    await expect(page.getByText("Severity band: Moderate anxiety", { exact: true })).toBeVisible();
    await expect(page.getByText("Total 13 of 21. 7 of 7 items answered. Severity band: Moderate anxiety.")).toBeAttached();
    await expect(page.getByText("Scores are not saved — record the result in your EHR.")).toBeVisible();

    expect(Date.now() - started).toBeLessThan(60_000);
  });

  test("clearing a measure removes the answers and the score", async ({ page }) => {
    await gotoReady(page, "/measures/gad-7");
    await answerItem(page, 1, 7, "Nearly every day");
    await expect(page.getByText(/^Total 3 of 21\. 1 of 7 items answered\.$/)).toBeAttached();
    await page.getByRole("button", { name: "Clear answers" }).click();
    await expect(page.getByText(/^Total 0 of 21\. 0 of 7 items answered\.$/)).toBeAttached();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  });
});

test.describe("every route", () => {
  for (const route of ROUTES) {
    test(`crisis button opens the crisis dialog and the disclaimer footer shows on ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console: ${m.text()}`);
      });
      await gotoReady(page, route);

      const footer = page.getByRole("contentinfo");
      await expect(footer).toContainText(DISCLAIMER);

      const trigger = crisisButton(page);
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeInViewport();
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAccessibleName(route === "/client" ? "Get help now" : "Crisis support");
      await expect(dialog.getByRole("link", { name: "Call 988" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: /Call 911/ })).toBeVisible();
      await expect(dialog.getByRole("link", { name: /findahelpline\.com/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();

      // No hydration mismatches, CSP reports or uncaught exceptions on load or while using the dialog.
      expect(errors).toEqual([]);
    });
  }

  test("the crisis button is also present on the not-found page", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
    await expect(crisisButton(page)).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText(DISCLAIMER);
  });

  for (const route of CLINICIAN_ROUTES) {
    test(`PHI banner shows on clinician route ${route}`, async ({ page }) => {
      await gotoReady(page, route);
      await expect(page.getByRole("banner").getByText(CLINICIAN_PHI_BANNER)).toBeVisible();
      await expect(page.getByRole("button", { name: "Clear session" })).toBeVisible();
    });
  }
});

test.describe("client mode (G3)", () => {
  test("shows no ICD codes, condition names or scores, even after a clinician session", async ({ page }) => {
    // Build up clinician state first, then switch modes in-app so the session is still live.
    await gotoReady(page, "/symptoms");
    await enterSymptomText(page, WORRY_TEXT);
    await choose(page, "Duration", "6 months or longer");
    await choose(page, "Clinically significant distress or functional impairment", "Yes");
    await navLink(page, "Measures").click();
    await page.getByRole("link", { name: "Run PHQ-9" }).click();
    await answerItem(page, 1, 9, "Nearly every day");

    await page.getByRole("navigation", { name: "Mode" }).getByRole("link", { name: "Client" }).click();
    await expect(page).toHaveURL(/\/client$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help and skills you can use today");
    await expect(page.getByRole("banner").getByText(CLIENT_PHI_BANNER)).toBeVisible();

    const check = async () => {
      const text = await page.locator("body").innerText();
      const html = await page.content();
      expect(text).not.toMatch(ICD_CODE_RE);
      expect(html).not.toMatch(/\bF\d\d\.\d/);
      for (const c of loadConditions()) {
        expect(text.toLowerCase()).not.toContain(c.name.toLowerCase());
        for (const code of [...c.icd10cm, ...c.icd11]) expect(text).not.toContain(code.code);
      }
      expect(text).not.toMatch(/\b(GAD-7|PHQ-9|score|scores|scored|severity|diagnos\w*|disorder)\b/i);
      expect(text).not.toMatch(/\b\d+\s*(of|\/)\s*(21|27)\b/);
    };
    await check();

    // The client-mode crisis dialog follows the same limits.
    await crisisButton(page).click();
    await expect(page.getByRole("dialog", { name: "Get help now" })).toBeVisible();
    await check();
    await page.keyboard.press("Escape");

    // Client mode has no clinician navigation.
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  });

  test("client handout downloads a PDF", async ({ page }) => {
    await gotoReady(page, "/client");
    const { bytes, name } = await downloadVia(page, page.getByRole("button", { name: "Download to print" }));
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(name).toMatch(/\.pdf$/);
  });
});

test.describe("adult-only scope (G12)", () => {
  test("the under-18 toggle hides suggestions on both screens", async ({ page }) => {
    await gotoReady(page, "/symptoms");
    await enterSymptomText(page, WORRY_TEXT);
    await choose(page, "Duration", "6 months or longer");
    await choose(page, "Clinically significant distress or functional impairment", "Yes");
    await expect(page.getByRole("link", { name: /^See possible diagnoses/ }).filter({ visible: true }).first()).toBeVisible();

    await choose(page, "Client is under 18", "Yes, under 18");
    await expect(page.getByRole("link", { name: /^See possible diagnoses/ })).toHaveCount(0);
    await expect(page.getByText("Adult content only: suggestions are not shown for clients under 18.")).toBeVisible();
    await expect(page.getByText("Adult content only", { exact: true })).toBeVisible();

    await navLink(page, "Diagnoses").click();
    await expect(page).toHaveURL(/\/diagnoses$/);
    await expect(page.getByText("Adult content only", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Possible considerations, ranked" })).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(0);
    const main = await page.locator("main").innerText();
    expect(main).not.toMatch(ICD_CODE_RE);
    expect(main).not.toContain("Consideration 1");

    // Switching back to adult brings the suggestions back (the gate is a toggle, not a reset).
    await page.getByRole("link", { name: "Edit symptoms and context" }).click();
    await choose(page, "Client is under 18", "No (adult)");
    await page.getByRole("link", { name: /^See possible diagnoses/ }).filter({ visible: true }).first().click();
    await expect(page.getByRole("article", { name: "Generalized anxiety disorder" })).toBeVisible();
  });
});

test.describe("PHQ-9 item 9 (G9)", () => {
  test("an answer above 'Not at all' on item 9 shows the follow-up alert with crisis numbers", async ({ page }) => {
    await gotoReady(page, "/measures/phq-9");
    await answerItem(page, 9, 9, "Not at all");
    await expect(page.getByText("Follow up on item 9 now")).toHaveCount(0);

    await answerItem(page, 9, 9, "Several days");
    const alert = page.getByRole("alert").filter({ hasText: "Follow up on item 9 now" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("This app does not assess or decide risk");
    await expect(alert.getByRole("link", { name: /Call or text 988/ })).toBeVisible();
    await expect(alert.getByRole("link", { name: /C-SSRS/ })).toBeVisible();
    await expect(page.getByText(/^Item 9 flagged: follow up directly/)).toBeVisible();
    await expect(page.getByText(/Risk item flagged\.$/)).toBeAttached();

    await answerItem(page, 9, 9, "Not at all");
    await expect(page.getByText("Follow up on item 9 now")).toHaveCount(0);
  });
});

test.describe("PDF downloads", () => {
  test("blank measure forms and the handout download as PDFs", async ({ page }) => {
    await gotoReady(page, "/handouts");
    const buttons = [
      page.getByRole("button", { name: "GAD-7 blank PDF" }),
      page.getByRole("button", { name: "PHQ-9 blank PDF" }),
      page.getByRole("button", { name: "Download PDF" }).first(),
    ];
    for (const b of buttons) {
      const { bytes, name } = await downloadVia(page, b);
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(1000);
      expect(name).toMatch(/\.pdf$/);
    }
    await expect(page.getByText("PDF created on this device.").first()).toBeVisible();
  });

  test("the measure screen offers the same blank PDF", async ({ page }) => {
    await gotoReady(page, "/measures/phq-9");
    const { bytes } = await downloadVia(page, page.getByRole("button", { name: "Download blank PDF" }));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
