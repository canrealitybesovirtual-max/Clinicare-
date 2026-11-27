/**
 * Pure helpers behind the Referrals, Ethics & Legal Hub and Medication screens (UI-B):
 * dialable tel:/sms: links from curated entries, the browser-side location check (only a ZIP or a city + state,
 * PHI-scrubbed, can be sent), directory and hub facet indexes, and the medication list helpers.
 */
import { describe, expect, it } from "vitest";
import { ethicsCodes, interventions, legalTopics } from "@/lib/library";
import { HUB_CONTEXTS, HUB_PROMPTS, PROFESSIONS, ethicsCodesFor, legalTopicsFor } from "@/lib/schemas-hub";
import { MEDICATIONS, isSudTreatment } from "@/lib/schemas-medications";
import { REFERRAL_KINDS } from "@/lib/schemas-referrals";
import { ALL, matchesFacets } from "@/components/ethics/facet-index";
import { buildHubIndex, countryLabel, hubCountries, jurisdictionLabel } from "@/components/ethics/hub-labels";
import { DIRECTORIES, directoryGroups, directoryIndex } from "@/components/referrals/directory-data";
import { checkLocation, IDENTIFIER_MESSAGE } from "@/components/referrals/location-check";
import { KIND_ORDER, smsHref, smsNumber, telHref } from "@/components/referrals/referral-format";
import { COMPLEMENTARY_IDS, evidenceLead } from "@/components/referrals/complementary-options";
import { PROVIDER_TYPE_OPTIONS, STATE_OPTIONS } from "@/components/referrals/search-options";
import { errorCopy, isSudQuery, requestBody } from "@/components/referrals/referral-search";
import { deaLabel, isSudMedication, matchesMedication, toListItem } from "@/components/medications/medication-labels";

describe("tel: and sms: links", () => {
  it("builds dialable links from printed numbers", () => {
    expect(telHref("988")).toBe("tel:988");
    expect(telHref("1-800-662-4357")).toBe("tel:18006624357");
    expect(telHref("116 123")).toBe("tel:116123");
    expect(telHref("13 11 14")).toBe("tel:131114");
    expect(telHref("301-555-0123 ext. 12")).toBe("tel:3015550123");
    expect(telHref("+44 300 123 3393")).toBe("tel:+443001233393");
    expect(telHref(null)).toBeNull();
    expect(telHref("call us")).toBeNull();
  });
  it("reads the number from curated text instructions", () => {
    expect(smsNumber("Text HOME to 741741")).toBe("741741");
    expect(smsNumber("Text 988")).toBe("988");
    expect(smsNumber("Text AYUDA to 988")).toBe("988");
    expect(smsNumber('Text "helpline" to 62640')).toBe("62640");
    expect(smsNumber("Text START to 678-678")).toBe("678678");
    expect(smsNumber("Text 0477 13 11 14")).toBe("0477131114");
    expect(smsNumber("Text 1-800-985-5990")).toBe("18009855990");
    expect(smsNumber("Text us anytime")).toBeNull();
    expect(smsHref("Text SHOUT to 85258")).toBe("sms:85258");
  });
  it("gives every directory entry with a phone or text route a working link", () => {
    for (const dir of DIRECTORIES) {
      for (const e of dir.entries) {
        if (e.phone) expect(telHref(e.phone), e.id).toMatch(/^tel:\+?\d{3,15}$/);
        if (e.text) expect(smsHref(e.text), e.id).toMatch(/^sms:\+?\d{3,15}$/);
      }
    }
  });
});

describe("location check (only a ZIP or a city + state leaves the device)", () => {
  it("accepts a 5-digit ZIP only", () => {
    expect(checkLocation("zip", { zip: "20877", city: "", state: "" })).toEqual({ ok: true, location: { zip: "20877" } });
    for (const bad of ["2087", "208771", "20877-1234", "abcde", ""]) {
      expect(checkLocation("zip", { zip: bad, city: "", state: "" }).ok, bad).toBe(false);
    }
  });
  it("accepts a USPS-style city with a state", () => {
    expect(checkLocation("city", { zip: "", city: "Gaithersburg", state: "MD" })).toEqual({
      ok: true,
      location: { city: "Gaithersburg", state: "MD" },
    });
    expect(checkLocation("city", { zip: "", city: "St. Louis", state: "MO" }).ok).toBe(true);
  });
  it("needs a state, letters only and no accents", () => {
    expect(checkLocation("city", { zip: "", city: "Gaithersburg", state: "" })).toMatchObject({ ok: false, field: "state" });
    expect(checkLocation("city", { zip: "", city: "Cañon City", state: "CO" })).toMatchObject({ ok: false, field: "city" });
    expect(checkLocation("city", { zip: "", city: "Apt 4", state: "MD" })).toMatchObject({ ok: false, field: "city" });
  });
  it("never sends anything the PHI scrubber flags, or a scrubbed placeholder", () => {
    for (const city of ["John Smith", "jane.doe@example.com", "555-867-5309", "[NAME]"]) {
      const r = checkLocation("city", { zip: "", city, state: "TX" });
      expect(r, city).toMatchObject({ ok: false, field: "city", identifier: true, message: IDENTIFIER_MESSAGE });
    }
  });
});

describe("referral search requests", () => {
  const zip = { zip: "20877" } as const;
  it("sends only the keys each strict route schema accepts", () => {
    expect(requestBody({ mode: "providers", location: zip, providerType: "psychiatrist" })).toEqual({
      providerType: "psychiatrist",
      location: zip,
      limit: 20,
      skip: 0,
    });
    expect(requestBody({ mode: "providers", location: zip, providerType: "psychiatrist" }, 37)).toMatchObject({ skip: 37 });
    expect(requestBody({ mode: "health-centers", location: zip, radiusMiles: 10 })).toEqual({ location: zip, radiusMiles: 10, limit: 25 });
    expect(requestBody({ mode: "treatment-facilities", location: zip, facilityType: "both", radiusMiles: 25 }, 2)).toEqual({
      location: zip,
      facilityType: "both",
      radiusMiles: 25,
      page: 2,
      pageSize: 20,
    });
  });
  it("flags substance use searches for the Part 2 prompt", () => {
    expect(isSudQuery({ mode: "providers", providerType: "addiction-counselor" })).toBe(true);
    expect(isSudQuery({ mode: "providers", providerType: "psychiatrist" })).toBe(false);
    expect(isSudQuery({ mode: "treatment-facilities", facilityType: "substance-use" })).toBe(true);
    expect(isSudQuery({ mode: "treatment-facilities", facilityType: "both" })).toBe(true);
    expect(isSudQuery({ mode: "treatment-facilities", facilityType: "mental-health" })).toBe(false);
    expect(isSudQuery({ mode: "health-centers" })).toBe(false);
    expect(PROVIDER_TYPE_OPTIONS.filter((p) => p.sud).map((p) => p.id)).toEqual(["addiction-counselor"]);
  });
  it("offers retry for rate limits and outages, a link-out when not configured", () => {
    expect(errorCopy({ code: "rate-limited", message: "" })).toMatchObject({ retry: true, fallback: true });
    expect(errorCopy({ code: "network", message: "" })).toMatchObject({ retry: true, fallback: true });
    expect(errorCopy({ code: "not-configured", message: "x" })).toMatchObject({ retry: false, fallback: true });
    expect(errorCopy({ code: "invalid", message: "" }).body).toMatch(/ZIP code instead/);
    expect(errorCopy({ code: "upstream", message: "That ZIP code or city was not found." }).body).toBe("That ZIP code or city was not found.");
  });
  it("lists every US state and territory the outbound validator accepts", () => {
    expect(STATE_OPTIONS).toHaveLength(56);
    expect(new Set(STATE_OPTIONS.map((s) => s.code)).size).toBe(56);
  });
});

describe("referral directory", () => {
  it("groups every entry once, crisis lines first", () => {
    const groups = directoryGroups();
    const ids = groups.flatMap((g) => g.entries.map((e) => e.id));
    const all = DIRECTORIES.flatMap((d) => d.entries.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...all].sort());
    expect(groups[0]!.kind).toBe("crisis");
    expect(KIND_ORDER.length).toBe(REFERRAL_KINDS.length);
  });
  it("filters by kind and region, keeping international services for every country", () => {
    const index = directoryIndex();
    const vis = (id: string, values: Record<string, string>) => matchesFacets(index, "directory", id, values);
    expect(vis("988-lifeline", { region: "US", kind: ALL })).toBe(true);
    expect(vis("988-lifeline", { region: "GB", kind: ALL })).toBe(false);
    expect(vis("samaritans-uk", { region: "GB", kind: "crisis" })).toBe(true);
    expect(vis("nhs-111-mental-health", { region: "GB", kind: ALL })).toBe(true); // GB-ENG is within GB
    expect(vis("findahelpline", { region: "NZ", kind: ALL })).toBe(true);
    expect(vis("findahelpline", { region: "INTL", kind: ALL })).toBe(true);
    expect(vis("canada-988", { region: "INTL", kind: ALL })).toBe(false);
    expect(vis("samhsa-otp-directory", { region: ALL, kind: "medication" })).toBe(true);
    expect(vis("samhsa-otp-directory", { region: ALL, kind: "crisis" })).toBe(false);
  });
});

describe("Ethics & Legal Hub index", () => {
  const countries = hubCountries(ethicsCodes, legalTopics);
  const index = buildHubIndex(ethicsCodes, legalTopics, countries);
  it("lists priority countries first and names them", () => {
    expect(countries.slice(0, 6)).toEqual(["US", "CA", "GB", "IE", "AU", "NZ"]);
    expect(countryLabel("GB")).toBe("United Kingdom");
    expect(jurisdictionLabel("US-state-varies")).toBe("US: varies by state");
  });
  it("matches ethicsCodesFor and legalTopicsFor for every profession and country", () => {
    for (const p of PROFESSIONS) {
      const expected = ethicsCodesFor(ethicsCodes, { profession: p }).map((c) => c.id);
      const got = ethicsCodes.filter((c) => matchesFacets(index, "ethics", c.id, { profession: p, country: ALL })).map((c) => c.id);
      expect(new Set(got), p).toEqual(new Set(expected));
    }
    for (const c of countries) {
      const codes = ethicsCodesFor(ethicsCodes, { country: c }).map((x) => x.id);
      expect(new Set(ethicsCodes.filter((x) => matchesFacets(index, "ethics", x.id, { country: c })).map((x) => x.id)), c).toEqual(new Set(codes));
      const topics = legalTopicsFor(legalTopics, { country: c }).map((x) => x.id);
      // Legal topics ignore the profession facet.
      expect(new Set(legalTopics.filter((x) => matchesFacets(index, "legal", x.id, { country: c, profession: "mft" })).map((x) => x.id)), c).toEqual(
        new Set(topics),
      );
    }
  });
  it("always includes global frameworks", () => {
    const global = ethicsCodes.filter((c) => c.scope === "global").map((c) => c.id);
    expect(global.length).toBeGreaterThan(0);
    for (const id of global) expect(matchesFacets(index, "ethics", id, { country: "NZ" })).toBe(true);
  });
  it("links every hub prompt to items that exist on the page", () => {
    const ids = new Set([...ethicsCodes.map((c) => c.id), ...legalTopics.map((t) => t.id)]);
    for (const ctx of HUB_CONTEXTS) for (const id of [...HUB_PROMPTS[ctx].ethicsIds, ...HUB_PROMPTS[ctx].legalIds]) expect(ids.has(id), `${ctx}:${id}`).toBe(true);
  });
});

describe("complementary & integrative options (G4)", () => {
  it("links only existing library interventions", () => {
    const ids = new Set(interventions.map((i) => i.id));
    for (const id of COMPLEMENTARY_IDS) expect(ids.has(id), id).toBe(true);
  });
  it("keeps evidence leads to whole sentences and does not split at et al.", () => {
    expect(evidenceLead("First point. Second (Smith et al., 2024). Third.")).toBe("First point. Second (Smith et al., 2024).");
    expect(evidenceLead("Only one sentence")).toBe("Only one sentence");
    for (const id of COMPLEMENTARY_IDS) {
      const lead = evidenceLead(interventions.find((i) => i.id === id)!.evidenceLevel);
      expect(lead.length, id).toBeGreaterThan(20);
      expect(lead, id).toMatch(/[.)]$/);
    }
  });
});

describe("medication list helpers", () => {
  it("labels DEA schedules", () => {
    expect(deaLabel("CIV")).toBe("DEA Schedule IV (C-IV)");
    expect(deaLabel("CII")).toBe("DEA Schedule II (C-II)");
  });
  it("flags every SUD-treatment medication, including every one the server treats as Part 2", () => {
    for (const m of MEDICATIONS) if (isSudTreatment(m)) expect(isSudMedication(m), m.id).toBe(true);
    expect(isSudMedication(MEDICATIONS.find((m) => m.id === "fluoxetine")!)).toBe(false);
  });
  it("searches generic, brand and class names locally", () => {
    const items = MEDICATIONS.map(toListItem);
    const hit = (q: string) => items.filter((i) => matchesMedication(i, q)).map((i) => i.id);
    expect(hit("zoloft")).toContain("sertraline");
    expect(hit("SSRI")).toContain("fluoxetine");
    expect(hit("")).toHaveLength(items.length);
    expect(hit("zzzz")).toEqual([]);
  });
  it("keeps list items slim (no clinician notes or label queries reach the client)", () => {
    const item = toListItem(MEDICATIONS[0]!) as unknown as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual(["aliases", "boxedWarning", "brands", "category", "className", "deaSchedule", "id", "name", "sud"]);
  });
});
