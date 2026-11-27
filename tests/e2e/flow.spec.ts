/**
 * Core clinician and client flows: speed to a scored measure, crisis access and disclaimers on every
 * route, client-mode content limits (G3), the adult-only gate (G12), the PHQ-9 item 9 prompt (G9)
 * and on-device PDF downloads.
 */
import { expect, test } from "@playwright/test";
import {
  CLIENT_DISCLAIMER,
  CLIENT_DISCLAIMER_ES,
  CLIENT_PHI_BANNER,
  CLIENT_PHI_BANNER_ES,
  CLIENT_ROUTES,
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
  expectClientSafe,
  goNav,
  gotoReady,
  isClientRoute,
  isSpanishRoute,
  loadConditions,
  pdfText,
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

      const es = isSpanishRoute(route);
      const footer = page.getByRole("contentinfo");
      await expect(footer).toContainText(es ? CLIENT_DISCLAIMER_ES : isClientRoute(route) ? CLIENT_DISCLAIMER : DISCLAIMER);

      const trigger = crisisButton(page);
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeInViewport();
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAccessibleName(es ? "Ayuda ahora" : isClientRoute(route) ? "Get help now" : "Crisis support");
      await expect(dialog.getByRole("link", { name: es ? "Llamar al 988" : "Call 988" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: es ? /Llamar al 911/ : /Call 911/ })).toBeVisible();
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

  for (const route of CLIENT_ROUTES) {
    test(`client banner and client chrome on ${route}`, async ({ page }) => {
      await gotoReady(page, route);
      const es = isSpanishRoute(route);
      await expect(page.getByRole("banner").getByText(es ? CLIENT_PHI_BANNER_ES : CLIENT_PHI_BANNER)).toBeVisible();
      await expect(page.getByRole("banner").getByText(CLINICIAN_PHI_BANNER)).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
      await expect(crisisButton(page)).toHaveText(es ? /Ayuda ahora/ : /Get help now/);
      // G3: no one-tap way back into the clinician screens; the share page has no mode control at all.
      await expect(page.getByRole("navigation", { name: "Mode" })).toHaveCount(0);
      await expect(page.getByRole("banner").getByRole("link", { name: "Clinician", exact: true })).toHaveCount(0);
      await expect(page.getByRole("banner").getByRole("button", { name: "Clinician view" })).toHaveCount(
        route.startsWith("/r/") ? 0 : 1,
      );
    });
  }

  test("client mode asks before returning to the clinician view", async ({ page }) => {
    await gotoReady(page, "/client");
    await page.getByRole("banner").getByRole("button", { name: "Clinician view" }).click();
    const dialog = page.getByRole("dialog", { name: "Return to clinician view?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Clinical notes from this session will be visible on this screen.");
    // The safe choice has focus and keeps client mode.
    await expect(dialog.getByRole("button", { name: "Stay in client mode" }).first()).toBeFocused();
    await dialog.getByRole("button", { name: "Stay in client mode" }).first().click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/client$/);
    await page.getByRole("banner").getByRole("button", { name: "Clinician view" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Return to clinician view" }).click();
    await expect(page).toHaveURL(/\/symptoms$/);
    await expect(page.getByRole("banner").getByText(CLINICIAN_PHI_BANNER)).toBeVisible();
  });
});

test.describe("client mode (G3)", () => {
  test("shows no ICD codes, condition names or scores, even after a clinician session", async ({ page }) => {
    // Build up clinician state first, then switch modes in-app so the session is still live.
    await gotoReady(page, "/symptoms");
    await enterSymptomText(page, WORRY_TEXT);
    await choose(page, "Duration", "6 months or longer");
    await choose(page, "Clinically significant distress or functional impairment", "Yes");
    await goNav(page, "Measures");
    await page.getByRole("link", { name: "Run PHQ-9" }).click();
    await answerItem(page, 1, 9, "Nearly every day");

    await goNav(page, "Client mode");
    await expect(page).toHaveURL(/\/client$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help and skills you can use today");
    await expect(page.getByRole("banner").getByText(CLIENT_PHI_BANNER)).toBeVisible();

    const check = () => expectClientSafe(page, "client mode");
    await check();

    // The client-mode crisis dialog follows the same limits.
    await crisisButton(page).click();
    await expect(page.getByRole("dialog", { name: "Get help now" })).toBeVisible();
    await check();
    await page.keyboard.press("Escape");

    // Client mode has no clinician navigation.
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  });

  test("client handout downloads a PDF that names no diagnosis or code", async ({ page }) => {
    await gotoReady(page, "/client");
    const { bytes, name } = await downloadVia(page, page.getByRole("button", { name: "Download to print" }));
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(name).toMatch(/\.pdf$/);
    const { drawn } = pdfText(bytes);
    expect(drawn).toContain("Muscle Relaxation"); // extraction works
    expect(drawn).toContain("Based on information from:");
    for (const c of loadConditions()) {
      expect(drawn.toLowerCase()).not.toContain(c.name.toLowerCase());
      for (const code of [...c.icd10cm, ...c.icd11]) expect(drawn).not.toContain(code.code);
    }
    expect(drawn).not.toMatch(ICD_CODE_RE);
    expect(drawn).not.toMatch(/disorder|diagnos|anxiety|depress|panic|ptsd|phobia/i);
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

    await goNav(page, "Diagnoses");
    await expect(page).toHaveURL(/\/diagnoses$/);
    await expect(page.getByText("Adult content only", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Possible considerations, ranked" })).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(0);
    // No suggestion content: no codes anywhere in main except the ICD-10-CM lookup tool's own example hint.
    const main = await page.locator("main").evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelector('section[aria-labelledby="icd10-lookup-heading"]')?.remove();
      return copy.innerText || copy.textContent || "";
    });
    expect(main).not.toMatch(ICD_CODE_RE);
    expect(main).not.toContain("Consideration 1");

    // Switching back to adult brings the suggestions back (the gate is a toggle, not a reset).
    await page.getByRole("link", { name: "Edit symptoms and context" }).click();
    await choose(page, "Client is under 18", "No (adult)");
    await page.getByRole("link", { name: /^See possible diagnoses/ }).filter({ visible: true }).first().click();
    await expect(page.getByRole("article", { name: "Generalized anxiety disorder" })).toBeVisible();
  });
});

test.describe("adult-only measures (G12)", () => {
  test("with the under-18 toggle on, the measure list, blank-form buttons and measure forms are hidden", async ({ page }) => {
    // Open a measure as an adult first, so the browser history holds it for a client-side "back".
    await gotoReady(page, "/measures");
    await page.getByRole("link", { name: "Run PHQ-9" }).click();
    await expect(page).toHaveURL(/\/measures\/phq-9$/);
    await expect(page.getByRole("group", { name: /^Item 1 of 9:/ })).toBeVisible();

    await goNav(page, "Symptoms");
    await choose(page, "Client is under 18", "Yes, under 18");

    // Back (client-side, so the memory-only session survives) to the PHQ-9 screen.
    await page.goBack();
    await expect(page).toHaveURL(/\/measures\/phq-9$/);
    await expect(page.getByText("Adult content only", { exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: /^Item \d+ of 9:/ })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Several days" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download blank PDF" })).toHaveCount(0);

    // Measures list: no built-in or link-out adult measures.
    await page.getByRole("link", { name: "All measures" }).click();
    await expect(page).toHaveURL(/\/measures$/);
    await expect(page.getByText("Adult content only", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Run / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Blank PDF/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /License pending/ })).toHaveCount(0);

    // Handouts: the client handout stays, the blank measure forms go.
    await goNav(page, "Handouts");
    await expect(page).toHaveURL(/\/handouts$/);
    await expect(page.getByText(/adult measures and their blank forms are not shown/)).toBeVisible();
    await expect(page.getByRole("button", { name: /blank PDF/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download PDF" }).first()).toBeVisible();

    // The gate is a toggle: switching back to adult restores the measures.
    await goNav(page, "Measures");
    // The toggle unmounts with the gate, so click it directly rather than via choose().
    await page.getByRole("group", { name: "Client is under 18" }).locator("label").filter({ hasText: "No (adult)" }).click();
    await expect(page.getByRole("link", { name: "Run PHQ-9" })).toBeVisible();
  });
});

test.describe("typed text stays on the device (G5/G17)", () => {
  test("free-text fields opt out of spellcheck, autocorrect and writing assistants", async ({ page }) => {
    await gotoReady(page, "/symptoms");
    const fields = page.locator("textarea, input:not([type=radio]):not([type=checkbox])");
    expect(await fields.count()).toBeGreaterThanOrEqual(2);
    const attrs = await fields.evaluateAll((els) =>
      els.map((el) => ({
        id: el.id,
        spellcheck: el.getAttribute("spellcheck"),
        autocorrect: el.getAttribute("autocorrect"),
        autocapitalize: el.getAttribute("autocapitalize"),
        autocomplete: el.getAttribute("autocomplete"),
        gramm: el.getAttribute("data-gramm"),
        grammEditor: el.getAttribute("data-gramm_editor"),
        grammarly: el.getAttribute("data-enable-grammarly"),
      })),
    );
    for (const a of attrs) {
      expect(a, a.id).toEqual({
        id: a.id,
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        autocomplete: "off",
        gramm: "false",
        grammEditor: "false",
        grammarly: "false",
      });
    }
    expect(attrs.map((a) => a.id)).toEqual(expect.arrayContaining(["symptom-text", "symptom-search"]));
  });

  test("Clear session empties the symptom search box and its results, not only the text box", async ({ page }) => {
    await gotoReady(page, "/symptoms");
    const search = page.getByLabel("Search symptoms");
    await search.fill("sleep");
    await search.blur();
    await expect(search).toHaveValue("sleep");
    await expect(page.getByText(/^\d+ matching symptoms?$/)).toBeAttached();
    await enterSymptomText(page, WORRY_TEXT);

    await page.getByRole("button", { name: "Clear session" }).click();
    await expect(page.getByText("Session cleared. Nothing was saved.")).toBeVisible();
    await expect(page.getByLabel("Search symptoms")).toHaveValue("");
    await expect(page.getByText(/^\d+ matching symptoms?$/)).toHaveCount(0);
    await expect(page.getByLabel(/^Symptoms and behaviors/)).toHaveValue("");
  });

  test("the 15-minute idle wipe empties the symptom search box too", async ({ page }) => {
    await page.clock.install();
    await gotoReady(page, "/symptoms");
    const search = page.getByLabel("Search symptoms");
    await search.fill("worry");
    await search.blur();
    await expect(page.getByText(/^\d+ matching symptoms?$/)).toBeAttached();

    await page.clock.fastForward("16:00");
    await expect(page.getByText(/cleared after 15 minutes without activity/)).toBeVisible();
    await expect(page.getByLabel("Search symptoms")).toHaveValue("");
    await expect(page.getByText(/^\d+ matching symptoms?$/)).toHaveCount(0);
  });
});

test.describe("text matching never reads as 'no risk' (G9)", () => {
  test("the Symptom Finder and Diagnoses screens always say to ask directly about suicide risk", async ({ page }) => {
    const note = "Text matching can miss risk statements; always ask directly about suicide risk.";
    await gotoReady(page, "/symptoms");
    await expect(page.getByText(note)).toBeVisible();
    await goNav(page, "Diagnoses");
    await expect(page).toHaveURL(/\/diagnoses$/);
    await expect(page.getByText(note)).toBeVisible();
  });

  test("a passive death wish typed in everyday words raises the suicidality banner", async ({ page }) => {
    await gotoReady(page, "/symptoms");
    await enterSymptomText(page, "Denies SI but says she wishes she would not wake up.");
    await expect(page.getByRole("region", { name: "Safety red flags" })).toContainText("Possible suicide risk noted");
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
