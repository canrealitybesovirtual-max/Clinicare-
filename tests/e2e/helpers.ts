/**
 * Shared helpers for the Playwright suite. Session state is memory-only, so any test that carries
 * state from one screen to the next must move with in-app links (client-side navigation), never
 * page.goto(), which reloads the tab and wipes the session by design.
 *
 * The app server runs with canned upstream answers (E2E_UPSTREAM_FIXTURES=1, tests/fixtures/upstream), so
 * every /api lookup below returns deterministic fixture data and nothing reaches a real API.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { expect, type Download, type Locator, type Page } from "@playwright/test";

export const ROOT = path.resolve(__dirname, "../..");

/** Sample ids for the dynamic routes (curated content ids, the only values that may appear in a URL). */
export const SAMPLE = {
  intervention: "progressive-muscle-relaxation",
  sudIntervention: "urge-surfing",
  medication: "sertraline",
  sudMedication: "naltrexone",
  handout: "pmr-homework",
  sudHandout: "drinking-diary",
  topic: "stress",
  conditionTopic: "anxiety",
  sudTopic: "alcohol",
  skill: "grounding-5-4-3-2-1",
  /** Round 3 content: a newer handout (with Spanish), intervention and client topics, including a substance-use one. */
  newHandout: "mood-routine-tracker",
  newIntervention: "applied-tension",
  newTopic: "unusual-experiences",
  newSudTopic: "opioids",
} as const;

/** The clinician tools (src/app/(clinician)/tools). */
export const TOOL_ROUTES = [
  "/tools",
  "/tools/note",
  "/tools/trend",
  "/tools/safety-plan",
  "/tools/session",
  "/tools/referral-letter",
  "/tools/practice",
  "/tools/precautions",
  "/tools/care-transition",
  "/tools/release-of-information",
  "/tools/accommodation-letter",
  "/tools/goals",
  "/tools/option-grid",
] as const;

/**
 * The pages the service worker precaches (public/sw.js PAGES), plus two measure pages it caches on visit (the
 * offline step opens /measures/gad-7, so it is visited online first).
 */
export const SW_ROUTES = [
  "/",
  "/symptoms",
  "/diagnoses",
  "/diagnoses/compare",
  "/measures",
  "/plan",
  "/interventions",
  "/handouts",
  "/referrals",
  "/medications",
  "/medications/effects",
  "/ethics",
  "/tools",
  "/about",
  "/client",
  "/client/help",
  "/client/skills",
  "/client/calm",
  "/formulations",
  "/formulations/builder",
  "/orientations",
  "/practice",
  "/populations",
  "/about/changelog",
  "/about/report",
  "/measures/gad-7",
  "/measures/phq-9",
] as const;

/** Client-facing routes: client mode and the public share page. No diagnosis names, codes or scores (G3). */
export const CLIENT_ROUTES = [
  "/client",
  "/client/help",
  "/client/skills",
  `/client/skills/${SAMPLE.skill}`,
  `/client/topics/${SAMPLE.topic}`,
  `/client/topics/${SAMPLE.conditionTopic}`,
  `/client/topics/${SAMPLE.sudTopic}`,
  `/client/topics/${SAMPLE.newTopic}`,
  `/client/topics/${SAMPLE.newSudTopic}`,
  "/client/topics/work-stress",
  "/client/calm",
  `/r/${SAMPLE.handout}`,
  `/r/${SAMPLE.handout}/es`,
  `/r/${SAMPLE.sudHandout}`,
] as const;

/** Clinician routes (the PHI banner and clinician navigation show on these). */
export const CLINICIAN_ROUTES = [
  "/",
  "/symptoms",
  "/diagnoses",
  "/diagnoses/compare",
  "/measures",
  "/measures/gad-7",
  "/measures/phq-9",
  "/plan",
  "/interventions",
  `/interventions/${SAMPLE.intervention}`,
  `/interventions/${SAMPLE.sudIntervention}`,
  `/interventions/${SAMPLE.newIntervention}`,
  "/handouts",
  `/handouts/${SAMPLE.handout}`,
  `/handouts/${SAMPLE.sudHandout}`,
  `/handouts/${SAMPLE.newHandout}`,
  "/referrals",
  "/medications",
  `/medications/${SAMPLE.medication}`,
  `/medications/${SAMPLE.sudMedication}`,
  "/medications/effects",
  "/ethics",
  ...TOOL_ROUTES,
  "/formulations",
  "/formulations/five-ps-biopsychosocial-spiritual",
  "/formulations/co-occurring-and-level-of-care",
  "/formulations/builder",
  "/orientations",
  "/orientations/cognitive-therapy",
  "/orientations/somatic-and-parts-based-therapies",
  "/practice",
  "/practice/alliance-and-rupture-repair",
  "/practice/intake-assessment",
  "/populations",
  "/populations/perinatal",
  "/populations/justice-involved",
  "/about",
  "/about/changelog",
  "/about/report",
] as const;

/** Every route in the app (one sample per dynamic segment, plus the SUD samples). */
export const ROUTES: readonly string[] = [...CLINICIAN_ROUTES, ...CLIENT_ROUTES];

export function isClientRoute(route: string): boolean {
  return route === "/client" || route.startsWith("/client/") || route.startsWith("/r/");
}

/** The Spanish share link (/r/<id>/es) opens the handout in Spanish and moves the whole shell to Spanish. */
export function isSpanishRoute(route: string): boolean {
  return /^\/r\/[a-z0-9-]+\/es$/.test(route);
}

export const DISCLAIMER =
  "Resource only. Not a substitute for clinical judgment. Not a medical device. For licensed clinicians.";
/** The client-worded footer on /client/** and /r/** (owner decision): still the positioning sentence, then plain words. */
export const CLIENT_DISCLAIMER =
  "Resource only. Not a substitute for clinical judgment. This page shares general information. It is not medical advice and does not replace care from a licensed professional.";
export const CLIENT_DISCLAIMER_ES =
  "Solo es un recurso. No sustituye el juicio clínico. Esta página ofrece información general. No es consejo médico y no reemplaza la atención de un profesional con licencia.";

export const CLINICIAN_PHI_BANNER = "Do not enter names or identifying details.";
export const CLIENT_PHI_BANNER = "Please do not type your name or other personal details.";
export const CLIENT_PHI_BANNER_ES = "Por favor, no escriba su nombre ni otros datos personales.";

/** Exact 42 CFR Part 2 notice (owner decision 2026-11-26, docs/RESOURCES.md). */
export const PART2_NOTICE = "42 CFR Part 2 prohibits unauthorized use or disclosure of these records.";
/** Start of the SUD Ethics & Legal Hub prompt (<HubPrompt context="sud"/>). */
export const SUD_HUB_PROMPT = "Substance use: 42 CFR Part 2 may protect these records in addition to HIPAA.";

/** ICD-10-CM F-codes (F41.1) and ICD-11 mental-health codes (6A70, 6B00). */
export const ICD_CODE_RE = /F\d\d\.|6[AB]\d\d/;

export interface ConditionInfo {
  id: string;
  name: string;
  icd10cm: { code: string }[];
  icd11: { code: string }[];
}

/** Every condition in the knowledge base (names and codes that must never reach a client page). */
export function loadConditions(): ConditionInfo[] {
  const dir = path.join(ROOT, "content/conditions");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as ConditionInfo);
}

/** Client handouts in content/handouts: id, whether a Spanish version exists, and the handout's own client text. */
export function loadHandouts(): { id: string; es: boolean; ownText: string }[] {
  const dir = path.join(ROOT, "content/handouts");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const h = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown> & { id: string };
      const own = ["title", "intro", "sections", "practiceLog", "safetyNote", "es"].map((k) => JSON.stringify(h[k] ?? ""));
      return { id: h.id, es: Boolean(h.es), ownText: own.join(" ").toLowerCase() };
    });
}

/**
 * Lower-case condition names to look for in client pages: each name without its parenthetical, its short form
 * without "disorder", and the parenthetical itself ("ptsd", "health anxiety"). "Adjustment" and "alcohol use" are
 * everyday words and are left out as short forms.
 */
export function conditionNameTerms(): string[] {
  const everyday = new Set(["adjustment", "alcohol use"]);
  const terms = new Set<string>();
  for (const c of loadConditions()) {
    const lower = c.name.toLowerCase();
    const base = lower.replace(/\s*\(.*\)\s*/, "").trim();
    const short = base.replace(/[-\s]*disorder\b/, "").trim();
    terms.add(base);
    if (short && !everyday.has(short)) terms.add(short);
    const paren = /\(([^)]+)\)/.exec(lower)?.[1];
    if (paren && !/\b(and|other|presentation|pattern)\b/.test(paren)) terms.add(paren);
  }
  return [...terms];
}

/**
 * Client-facing text limits (G3): no ICD codes, no condition names, no scoring or diagnosis words. Checks the
 * visible text and the HTML (attributes and hidden text included).
 */
export async function expectClientSafe(page: Page, label: string): Promise<void> {
  const text = await page.locator("body").innerText();
  const html = await page.content();
  expect(text, label).not.toMatch(ICD_CODE_RE);
  expect(html, label).not.toMatch(/\bF\d\d\.\d/);
  const lower = text.toLowerCase();
  for (const c of loadConditions()) {
    expect(lower, `${label}: condition name ${c.name}`).not.toContain(c.name.toLowerCase());
    for (const code of [...c.icd10cm, ...c.icd11]) expect(text, `${label}: code ${code.code}`).not.toContain(code.code);
  }
  expect(text, label).not.toMatch(/\b(GAD-7|PHQ-9|score|scores|scored|severity|diagnos\w*|disorder)\b/i);
  expect(text, label).not.toMatch(/\b\d+\s*(of|\/)\s*(21|27)\b/);
}

export function crisisButton(page: Page): Locator {
  return page.getByRole("button", { name: /^(Crisis help|Get help now|Ayuda en crisis|Ayuda ahora)$/ });
}

export type NavLabel =
  | "Symptoms"
  | "Diagnoses"
  | "Measures"
  | "Plan"
  | "Interventions"
  | "Handouts"
  | "Referrals"
  | "Medications"
  | "Ethics & Legal"
  | "Tools"
  | "Client mode"
  | "About";

/**
 * Follow a site-wide navigation link with a client-side navigation, wherever it sits at this width: the header
 * bar, its "More" menu (wide screens) or the menu drawer (small screens).
 */
export async function goNav(page: Page, label: NavLabel): Promise<void> {
  const drawerTrigger = page.getByRole("banner").getByRole("button", { name: /^Menu\b/ });
  if (await drawerTrigger.isVisible()) {
    await drawerTrigger.click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await drawer.getByRole("link", { name: label, exact: true }).click();
    await expect(drawer).toBeHidden();
    return;
  }
  const nav = page.getByRole("banner").getByRole("navigation", { name: "Main" });
  const inBar = nav.getByRole("link", { name: label, exact: true }).filter({ visible: true });
  if ((await inBar.count()) === 0) await nav.getByRole("button", { name: "More" }).click();
  await nav.getByRole("link", { name: label, exact: true }).filter({ visible: true }).first().click();
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
export async function choose(page: Page | Locator, legend: string | RegExp, option: string): Promise<void> {
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

/** Open every <details> element (disclosures) so their content is audited too. */
export async function openAllDetails(page: Page): Promise<void> {
  await page.locator("details").evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
}

/** Open every collapsed lazy panel / disclosure button (aria-expanded="false") inside `scope`. */
export async function expandAll(scope: Locator): Promise<number> {
  const closed = scope.locator('button[aria-expanded="false"]:visible');
  let n = 0;
  for (let guard = 0; guard < 40; guard++) {
    const count = await closed.count();
    if (count === 0) break;
    await closed.first().click();
    n += 1;
  }
  return n;
}

export async function readDownload(download: Download): Promise<Buffer> {
  const p = await download.path();
  if (!p) throw new Error("download has no local path");
  return readFileSync(p);
}

/** Click a button that triggers a client-side download and return the bytes. */
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

/* ------------------------------------------------------------------ plan builder */

/**
 * Start a plan for one curated library on /plan: choose the library, check the first problem, its first
 * definition, goal and objective, then (optionally) add a custom objective with `customObjective` typed key by key.
 * Ends on the review step. Uses only in-page controls, so the memory-only draft survives.
 */
export async function buildPlan(page: Page, conditionLabel: string, opts: { customObjective?: string } = {}): Promise<void> {
  await page.getByLabel("Plan library").selectOption({ label: conditionLabel });
  await expect(page.getByText(`Plan library: ${conditionLabel}`)).toBeVisible();
  const step = page.getByRole("region", { name: /^Step \d+ of \d+/ });
  const next = () => step.getByRole("button", { name: /^Next: / }).click();

  await next(); // Problems
  await step.getByRole("checkbox").first().check();
  for (let i = 0; i < 3; i++) {
    await next(); // Behavioral definitions, Long-term goals, Objectives
    await step.getByRole("checkbox").first().check();
  }
  if (opts.customObjective !== undefined) {
    await step.getByRole("button", { name: /^Add an objective/ }).first().click();
    const editor = step.getByLabel("Wording for this objective");
    await expect(editor).toBeFocused();
    await editor.pressSequentially(opts.customObjective);
    await editor.blur();
    await step.getByRole("button", { name: "Done editing" }).click();
  }
  await next(); // Interventions
  await next(); // Measures
  await next(); // Review
  await expect(step.getByRole("heading", { name: "Export", exact: true })).toBeVisible();
}
