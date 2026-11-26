/**
 * Shared helpers for the Playwright suite. Session state is memory-only, so any test that carries
 * state from one screen to the next must move with in-app links (client-side navigation), never
 * page.goto(), which reloads the tab and wipes the session by design.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { expect, type Download, type Locator, type Page } from "@playwright/test";

export const ROOT = path.resolve(__dirname, "../..");

/** Every route in the Phase 1 app. */
export const ROUTES = [
  "/",
  "/symptoms",
  "/diagnoses",
  "/measures",
  "/measures/gad-7",
  "/measures/phq-9",
  "/handouts",
  "/client",
  "/about",
] as const;

/** Routes that show the clinician PHI banner (everything except client mode). */
export const CLINICIAN_ROUTES = ROUTES.filter((r) => r !== "/client");

export const DISCLAIMER =
  "Resource only. Not a substitute for clinical judgment. Not a medical device. For licensed clinicians.";

export const CLINICIAN_PHI_BANNER = "Do not enter names or identifying details.";
export const CLIENT_PHI_BANNER = "Please do not type your name or other personal details.";

/** ICD-10-CM F-codes (F41.1) and ICD-11 mental-health codes (6A70, 6B00). */
export const ICD_CODE_RE = /F\d\d\.|6[AB]\d\d/;

export interface ConditionInfo {
  id: string;
  name: string;
  icd10cm: { code: string }[];
  icd11: { code: string }[];
}

export function loadConditions(): ConditionInfo[] {
  const ids = ["panic-disorder", "agoraphobia", "generalized-anxiety-disorder", "major-depressive-disorder", "ptsd"];
  return ids.map((id) => JSON.parse(readFileSync(path.join(ROOT, "content/conditions", `${id}.json`), "utf8")) as ConditionInfo);
}

export function crisisButton(page: Page): Locator {
  return page.getByRole("button", { name: /^(Crisis help|Get help now)$/ });
}

/** The site-wide navigation link (header nav), by its visible label. */
export function navLink(page: Page, label: "Symptoms" | "Diagnoses" | "Measures" | "Handouts" | "About"): Locator {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true });
}

/** Resolves once React has hydrated the page (event handlers are attached to the header). */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const el = document.querySelector("header button");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"));
  });
}

/** Navigate (full load) and wait until the page is interactive. */
export async function gotoReady(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await expect(crisisButton(page)).toBeVisible();
  await waitForHydration(page);
}

/** Pick one option of a ChoiceGroup (fieldset + legend, visually styled radio labels). */
export async function choose(page: Page, legend: string | RegExp, option: string): Promise<void> {
  const group = page.getByRole("group", { name: legend });
  await group.locator("label").filter({ hasText: option }).first().click();
  await expect(group.getByRole("radio", { name: option, exact: true })).toBeChecked();
}

/** Answer one measure item ("Item 3 of 9: ..."). */
export async function answerItem(page: Page, index: number, total: number, option: string): Promise<void> {
  const item = page.getByRole("group", { name: new RegExp(`^Item ${index} of ${total}:`) });
  await item.getByRole("radio", { name: option, exact: true }).check();
}

/** Type (paste) into the Symptom Finder text box and wait for the debounced PHI scrub + match. */
export async function enterSymptomText(page: Page, text: string): Promise<void> {
  const box = page.getByLabel(/^Symptoms and behaviors/);
  await box.fill(text);
  // Blur scrubs immediately; the debounce would also do it after 500 ms.
  await box.blur();
}

export async function readDownload(download: Download): Promise<Buffer> {
  const p = await download.path();
  if (!p) throw new Error("download has no local path");
  return readFileSync(p);
}

/** Click a button that triggers a client-side PDF download and return the bytes. */
export async function downloadVia(page: Page, button: Locator): Promise<{ bytes: Buffer; name: string }> {
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  const bytes = await readDownload(download);
  return { bytes, name: download.suggestedFilename() };
}

/**
 * Everything readable in a PDF: the raw bytes, every inflated (Flate) stream, and the text drawn by
 * Tj operators (pdf-lib writes standard-font text as hex strings). Good enough to search for leaks.
 */
export function pdfText(bytes: Buffer): { all: string; drawn: string } {
  const raw = bytes.toString("latin1");
  const parts: string[] = [raw];
  // "stream" but not the tail of "endstream", so every stream (every page) is read, not every other one.
  const re = /(?<!end)stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      parts.push(inflateSync(bytes.subarray(start, end)).toString("latin1"));
    } catch {
      /* not a Flate stream */
    }
    re.lastIndex = end + "endstream".length;
  }
  const joined = parts.join("\n");
  const hex = [...joined.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((x) => Buffer.from(x[1] ?? "", "hex").toString("latin1"));
  const literal = [...joined.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((x) => x[1] ?? "");
  const drawn = [...hex, ...literal].join("\n");
  return { all: `${joined}\n${drawn}`, drawn };
}

/** All text a user (or screen reader) could perceive, including form field values. */
export async function visibleTextAndValues(page: Page): Promise<string> {
  return page.evaluate(() => {
    const values = [...document.querySelectorAll("input, textarea, select")].map(
      (el) => (el as HTMLInputElement).value ?? "",
    );
    return [document.body.innerText, ...values].join("\n");
  });
}
