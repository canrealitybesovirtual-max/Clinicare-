import { describe, expect, it } from "vitest";
import us from "@content/referrals/us.json";
import intl from "@content/referrals/international.json";
import zcta from "@content/referrals/zcta-centroids.json";
import crisisLines from "@content/crisis-lines.json";
import { PART2_NOTICE } from "@/lib/referral-links";
import {
  REFERRAL_KINDS,
  ReferralDirectorySchema,
  ReferralEntrySchema,
  isVerified,
  referralsFor,
  type ReferralEntry,
} from "@/lib/schemas-referrals";

const TODAY = "2026-11-26"; // compile date of these files
const usDir = ReferralDirectorySchema.parse(us);
const intlDir = ReferralDirectorySchema.parse(intl);
const all: ReferralEntry[] = [...usDir.entries, ...intlDir.entries];
const byId = new Map(all.map((e) => [e.id, e]));

describe("referral directories: schema and governance", () => {
  it("both files parse, carry file-level governance and an original license", () => {
    for (const d of [usDir, intlDir]) {
      expect(d.license).toBe("original");
      expect(d.sources.length).toBeGreaterThan(0);
      expect(d.reviewedBy).toBe("PENDING");
      expect(d.lastVerified).toBeNull(); // not every entry is verified by a person yet
      expect(d.compiledOn).toBe(TODAY);
    }
    expect(usDir.scope).toBe("US");
    expect(intlDir.scope).toBe("international");
  });

  it("ids are unique across both files and every kind is a known kind", () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) expect(REFERRAL_KINDS).toContain(e.kind);
  });

  it("every entry has sources, an https URL, and a verification date or explicit 'unverified'", () => {
    for (const e of all) {
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      expect(e.url.startsWith("https://"), e.id).toBe(true);
      expect(e.lastVerified === "unverified" || e.lastVerified <= TODAY, e.id).toBe(true);
      if (isVerified(e)) expect(e.verification, e.id).toMatch(/2026-11-26/);
    }
  });

  it("crisis and helpline entries all have a phone, text or chat route", () => {
    const crisis = all.filter((e) => e.kind === "crisis" || e.kind === "helpline");
    expect(crisis.length).toBeGreaterThanOrEqual(15);
    for (const e of crisis) expect(Boolean(e.phone || e.text || e.chat), e.id).toBe(true);
  });
});

describe("referral directories: required coverage", () => {
  const required = [
    "988-lifeline",
    "988-lifeline-spanish",
    "988-lifeline-asl",
    "veterans-crisis-line",
    "samhsa-national-helpline",
    "findtreatment-gov",
    "hrsa-find-a-health-center",
    "nami-helpline",
    "crisis-text-line",
    "trans-lifeline",
    "trevor-project-young-adults",
    "open-path-collective",
    "samhsa-otp-directory",
    "psychology-today-directory",
    "apa-psychologist-locator",
    "aamft-therapist-locator",
    "findahelpline",
    "nhs-111-mental-health",
    "samaritans-uk",
    "mind-infoline",
    "shout-85258",
    "canada-988",
    "canada-mental-health-supports",
    "lifeline-australia",
    "beyond-blue",
    "13yarn",
    "medicare-mental-health",
    "nz-1737",
    "lifeline-aotearoa",
    "samaritans-ireland",
    "text-50808",
    "who-mhgap",
  ];
  for (const id of required) it(`includes ${id}`, () => expect(byId.has(id)).toBe(true));

  it("covers every referral kind at least once", () => {
    for (const k of REFERRAL_KINDS) expect(all.some((e) => e.kind === k), k).toBe(true);
  });

  it("988 entries: call/text/chat, Veterans press 1, Spanish, ASL videophone", () => {
    const l = byId.get("988-lifeline")!;
    expect(l).toMatchObject({ phone: "988", text: "Text 988", region: "US", kind: "crisis" });
    expect(l.chat).toMatch(/^https:\/\/988lifeline\.org\//);
    expect(l.notes?.join(" ")).toMatch(/press 1/);
    expect(byId.get("988-lifeline-spanish")!.text).toBe("Text AYUDA to 988");
    expect(byId.get("988-lifeline-asl")).toMatchObject({ kind: "deaf-hoh" });
    expect(byId.get("988-lifeline-asl")!.videophone).toMatch(/videophone/i);
    expect(byId.get("veterans-crisis-line")).toMatchObject({ phone: "988", phoneNote: "Dial 988, then press 1", text: "Text 838255", kind: "veterans" });
  });

  it("key numbers match the values checked on 2026-11-26", () => {
    expect(byId.get("samhsa-national-helpline")!.phone).toBe("1-800-662-4357");
    expect(byId.get("samhsa-national-helpline")!.lastVerified).toBe(TODAY);
    expect(byId.get("crisis-text-line")!.text).toBe("Text HOME to 741741");
    expect(byId.get("nami-helpline")!.phone).toBe("1-800-950-6264");
    expect(byId.get("trans-lifeline")!.phone).toBe("877-565-8860");
    expect(byId.get("trevor-project-young-adults")!.phone).toBe("1-866-488-7386");
    expect(byId.get("samaritans-uk")!.phone).toBe("116 123");
    expect(byId.get("samaritans-ireland")!.phone).toBe("116 123");
    expect(byId.get("shout-85258")!.text).toBe("Text SHOUT to 85258");
    expect(byId.get("text-50808")!.text).toBe("Text HELLO to 50808");
    expect(byId.get("nhs-111-mental-health")!.phoneNote).toMatch(/option 2/);
    expect(byId.get("lifeline-australia")!.phone).toBe("13 11 14");
    expect(byId.get("beyond-blue")!.phone).toBe("1300 22 4636");
    expect(byId.get("13yarn")!.phone).toBe("13 92 76");
    expect(byId.get("medicare-mental-health")!.phone).toBe("1800 595 212");
    expect(byId.get("nz-1737")!.phone).toBe("1737");
    expect(byId.get("lifeline-aotearoa")!.phone).toBe("0800 543 354");
    expect(byId.get("canada-988")!.phone).toBe("988");
  });

  it("agrees with content/crisis-lines.json where both list a service", () => {
    const urlFor = (c: string) => crisisLines.countries.find((x) => x.country === c)!.url.replace(/\/$/, "");
    expect(byId.get("988-lifeline")!.url.replace(/\/$/, "")).toBe(urlFor("US"));
    expect(byId.get("canada-988")!.url.replace(/\/$/, "")).toBe(urlFor("CA"));
    expect(byId.get("samaritans-uk")!.url.replace(/\/$/, "")).toBe(urlFor("GB"));
    expect(byId.get("lifeline-australia")!.url.replace(/\/$/, "")).toBe(urlFor("AU"));
    expect(byId.get("nz-1737")!.url.replace(/\/$/, "")).toBe(urlFor("NZ"));
    expect(crisisLines.international.url.replace(/\/$/, "")).toBe(byId.get("findahelpline")!.url.replace(/\/$/, ""));
  });
});

describe("referral directories: guardrails", () => {
  it("adult-only scope: the Trevor Project is listed only for ages 18-24", () => {
    const t = byId.get("trevor-project-young-adults")!;
    expect(t.ageRange).toEqual({ min: 18, max: 24 });
    expect(t.audience).toMatch(/18-24/);
    for (const e of all) if (e.ageRange) expect(e.ageRange.min, e.id).toBeGreaterThanOrEqual(18);
  });

  it("substance-use and medication entries carry the 42 CFR Part 2 notice", () => {
    const sud = all.filter((e) => e.kind === "substance-use" || e.kind === "medication" || ["smart-recovery", "alcoholics-anonymous", "narcotics-anonymous"].includes(e.id));
    expect(sud.length).toBeGreaterThanOrEqual(5);
    for (const e of sud) expect(e.notes?.join(" "), e.id).toContain(PART2_NOTICE);
  });

  it("commercial directories are flagged", () => {
    expect(byId.get("psychology-today-directory")!.commercial).toBe(true);
    expect(byId.get("psychology-today-directory")!.notes?.join(" ")).toMatch(/pay to be listed/);
  });

  it("closed services are not referred to (Wellness Together Canada) and renamed ones use the new name", () => {
    const wtc = byId.get("canada-mental-health-supports")!;
    expect(wtc.url).not.toMatch(/wellnesstogether/);
    expect(wtc.notes?.join(" ")).toMatch(/no longer operating/);
    expect(all.some((e) => /wellnesstogether\.ca/.test(e.url))).toBe(false);
    expect(byId.get("medicare-mental-health")!.url).toBe("https://www.medicarementalhealth.gov.au/");
  });

  it("no forbidden content, client-identifier fields or re-hosted worksheets", () => {
    const text = JSON.stringify([us, intl]);
    expect(text).not.toMatch(/homeopath/i);
    expect(text).not.toMatch(/HIPAA[ -](certified|approved)/i);
    expect(text).not.toMatch(/\b(firstName|lastName|clientName|patientName|dateOfBirth|insuranceId)\b/);
    expect(text).not.toMatch(/Criterion [A-H]\b/);
    expect(text).not.toMatch(/therapistaid\.com|cci\.health\.wa\.gov\.au/);
  });

  it("referralsFor filters by kind and region and lists crisis entries first", () => {
    const gb = referralsFor(intlDir, { region: "GB" });
    expect(gb.map((e) => e.id)).toEqual(expect.arrayContaining(["samaritans-uk", "nhs-111-mental-health", "mind-infoline", "findahelpline"]));
    expect(gb[0]!.kind).toBe("crisis");
    expect(referralsFor(usDir, { kind: "medication" }).map((e) => e.id).sort()).toEqual(["samhsa-buprenorphine-locator", "samhsa-otp-directory"]);
  });
});

describe("referral entry schema rejects unsafe entries", () => {
  const base = {
    id: "example-line",
    name: "Example line",
    description: "An example service description that is long enough.",
    url: "https://example.org/",
    phone: "1-800-555-0100",
    region: "US",
    kind: "crisis",
    lastVerified: "unverified",
    verification: "Not checked online; example only.",
    sources: [{ title: "Example", publisher: "Example Org", url: "https://example.org/" }],
  };
  it("accepts the base entry", () => expect(ReferralEntrySchema.safeParse(base).success).toBe(true));
  const cases: [string, Record<string, unknown>][] = [
    ["youth age range", { ageRange: { min: 13, max: 24 }, audience: "Young people 13-24" }],
    ["age range without audience", { ageRange: { min: 18, max: 24 } }],
    ["http URL", { url: "http://example.org/" }],
    ["crisis entry without a route", { phone: undefined }],
    ["unknown kind", { kind: "alternative-medicine" }],
    ["bad lastVerified", { lastVerified: "yesterday" }],
    ["extra field (client data)", { clientNotes: "x" }],
    ["no sources", { sources: [] }],
    ["phone with letters", { phone: "1-800-CALL-NOW" }],
  ];
  for (const [name, patch] of cases) {
    it(`rejects ${name}`, () => expect(ReferralEntrySchema.safeParse({ ...base, ...patch }).success).toBe(false));
  }
  it("rejects duplicate ids and misplaced regions at directory level", () => {
    const dir = { ...us, entries: [us.entries[0], us.entries[0]] };
    expect(ReferralDirectorySchema.safeParse(dir).success).toBe(false);
    const misplaced = { ...intl, entries: [{ ...intl.entries[0], region: "US" }] };
    expect(ReferralDirectorySchema.safeParse(misplaced).success).toBe(false);
  });
});

describe("ZCTA centroid table (server-side geocoding for ZIPs)", () => {
  it("has governance, the documented format and plausible coordinates", () => {
    expect(zcta.sources.length).toBeGreaterThanOrEqual(1);
    expect(zcta.license).toMatch(/public domain/i);
    expect(zcta.count).toBe(33791);
    const recs = zcta.data.split(";");
    expect(recs).toHaveLength(zcta.count);
    for (const r of recs.slice(0, 500)) {
      expect(r).toMatch(/^\d{5}:-?\d{1,2}(\.\d{1,2})?,-?\d{1,3}(\.\d{1,2})?$/);
    }
    expect(recs).toContain("20877:39.14,-77.19");
    expect(recs).toContain("10001:40.75,-74");
  });
});
