/**
 * Server-render smoke tests for the UI-B pages (/referrals, /ethics, /medications, /medications/[id]):
 * one h1, crisis support first on Referrals, the hub prompts and disclaimers where the rules require them,
 * every hub item reachable by its #id anchor, and static params for every curated medication.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { SessionProvider } from "@/state/session";
import { ethicsCodes, legalTopics } from "@/lib/library";
import { HUB_PROMPTS } from "@/lib/schemas-hub";
import { MEDICATIONS } from "@/lib/schemas-medications";
import { PART2_NOTICE } from "@/lib/referral-links";
import EthicsPage from "@/app/(clinician)/ethics/page";
import ReferralsPage from "@/app/(clinician)/referrals/page";
import MedicationsPage from "@/app/(clinician)/medications/page";
import MedicationPage, { generateStaticParams } from "@/app/(clinician)/medications/[id]/page";

const html = (el: React.ReactElement) => renderToString(<SessionProvider>{el}</SessionProvider>);
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("/referrals", () => {
  const page = text(html(<ReferralsPage />));
  it("has one h1 and puts crisis support before everything else", () => {
    expect(count(page, "<h1")).toBe(1);
    const crisis = page.indexOf("Crisis and emergency support");
    expect(crisis).toBeGreaterThan(0);
    for (const later of ["Find care near a location", "Medication evaluation", "Complementary & integrative options", "Directories and helplines"]) {
      expect(page.indexOf(later), later).toBeGreaterThan(crisis);
    }
    expect(page).toContain('href="tel:988"');
    expect(page).toContain("findahelpline.com");
  });
  it("explains what location data is sent and shows the SUD prompt in substance use groups", () => {
    expect(page).toContain("Location is sent only as a ZIP or city/state — never anything else.");
    expect(page).toContain(HUB_PROMPTS.sud.message);
    expect(page).toContain("Not yet re-verified");
  });
  it("lists complementary options with library links and no unproven-treatment category", () => {
    for (const id of ["physical-activity", "yoga-mind-body", "mindfulness-meditation", "sleep-hygiene-education"]) {
      expect(page).toContain(`href="/interventions/${id}"`);
    }
    expect(page).not.toMatch(/homeopath/i);
  });
});

describe("/ethics", () => {
  const page = text(html(<EthicsPage />));
  it("has one h1, every code and topic anchor, and the telehealth prompt", () => {
    expect(count(page, "<h1")).toBe(1);
    for (const c of ethicsCodes) expect(page, c.id).toContain(`id="${c.id}"`);
    for (const t of legalTopics) expect(page, t.id).toContain(`id="${t.id}"`);
    expect(page).toContain(HUB_PROMPTS.telehealth.message);
    expect(page).toContain("check for newer editions every year");
    expect(page).toContain("Information, not legal advice");
  });
  it("prints the exact Part 2 notice from the regulation", () => {
    expect(page.toLowerCase()).toContain(PART2_NOTICE.toLowerCase());
  });
});

describe("/medications", () => {
  it("lists every curated medication with the prescribing disclaimer", () => {
    const page = text(html(<MedicationsPage />));
    expect(count(page, "<h1")).toBe(1);
    expect(page).toContain("Not for prescribing decisions; consult the full prescribing information.");
    for (const m of MEDICATIONS) expect(page, m.id).toContain(`href="/medications/${m.id}"`);
  });
  it("prerenders a page per medication id", () => {
    expect(generateStaticParams().map((p) => p.id)).toEqual(MEDICATIONS.map((m) => m.id));
  });
  it("shows the SUD hub prompt only for substance-use treatment medications", async () => {
    const nal = text(html(await MedicationPage({ params: Promise.resolve({ id: "naltrexone" }) })));
    const flu = text(html(await MedicationPage({ params: Promise.resolve({ id: "fluoxetine" }) })));
    expect(count(nal, "<h1")).toBe(1);
    expect(nal).toContain(HUB_PROMPTS.sud.message);
    expect(flu).not.toContain(HUB_PROMPTS.sud.message);
    expect(flu).toContain("Not for prescribing decisions; consult the full prescribing information.");
    expect(flu).toContain("Boxed warning");
  });
});
