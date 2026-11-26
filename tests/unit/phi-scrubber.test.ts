import { describe, expect, it } from "vitest";
import { PHI_TYPE_LABELS, containsPHI, scrubPHI, summarizeFindings } from "@/lib/phi-scrubber";
import type { PhiType, ScrubResult } from "@/lib/types";

/** Asserts `secret` is fully covered by a finding of `type` and no longer appears in `clean`. */
function expectRedacted(text: string, secret: string, type: PhiType): ScrubResult {
  const r = scrubPHI(text);
  const idx = text.indexOf(secret);
  expect(idx, `test bug: "${secret}" not in "${text}"`).toBeGreaterThanOrEqual(0);
  const hit = r.findings.find((f) => f.start <= idx && f.end >= idx + secret.length);
  expect(hit, `"${secret}" should be redacted in: ${text}\n -> ${r.clean}`).toBeDefined();
  expect(hit!.type, `type for "${secret}" in: ${text}`).toBe(type);
  expect(r.clean).not.toContain(secret);
  expect(r.clean).toContain(`[${type}]`);
  return r;
}

function expectClean(text: string): void {
  const r = scrubPHI(text);
  expect(r.findings, `expected no findings in: ${text}\n -> ${r.clean}`).toEqual([]);
  expect(r.clean).toBe(text);
}

/** Findings are sorted, non-overlapping, and rebuilding `clean` from them matches exactly. */
function expectConsistent(text: string, r: ScrubResult): void {
  let last = 0;
  let rebuilt = "";
  for (const f of r.findings) {
    expect(f.start).toBeGreaterThanOrEqual(last);
    expect(f.end).toBeGreaterThan(f.start);
    expect(f.end).toBeLessThanOrEqual(text.length);
    rebuilt += text.slice(last, f.start) + `[${f.type}]`;
    last = f.end;
  }
  rebuilt += text.slice(last);
  expect(rebuilt).toBe(r.clean);
}

/* ------------------------------------------------------------------ */
/* Positives: every Safe Harbor type, several formats each             */
/* ------------------------------------------------------------------ */

const POSITIVES: [PhiType, string, string][] = [
  // NAME
  ["NAME", "Client John reports constant worry.", "John"],
  ["NAME", "Mr. Kowalski arrived late to session.", "Kowalski"],
  ["NAME", "Referred by Dr. Jane Okafor last month.", "Jane Okafor"],
  ["NAME", "She said my name is Zephyrine and laughed.", "Zephyrine"],
  ["NAME", "He goes by Tito at work.", "Tito"],
  ["NAME", "Her husband Tom works nights.", "Tom"],
  ["NAME", "His daughter, Emma, is doing well.", "Emma"],
  ["NAME", "Conflict with her boss Grace this week.", "Grace"],
  ["NAME", "my wife sarah is supportive", "sarah"],
  ["NAME", "Sarah Thompson presented today.", "Sarah Thompson"],
  ["NAME", "Grace Smith attended the group.", "Grace Smith"],
  ["NAME", "Grace Brown attended the group.", "Grace Brown"],
  ["NAME", "Xiomara Rodriguez attended the group.", "Xiomara Rodriguez"],
  ["NAME", "Worried about what Rodriguez will say.", "Rodriguez"],
  ["NAME", "pt Jose missed his appointment", "Jose"],
  ["NAME", "Spoke with John Q. Public by phone.", "John Q. Public"],
  ["NAME", "Ms. O'Brien-Walsh reports insomnia.", "O'Brien-Walsh"],
  // ADDRESS
  ["ADDRESS", "Lives at 1600 Pennsylvania Ave NW with family.", "1600 Pennsylvania Ave NW"],
  ["ADDRESS", "Send mail to PO Box 4521 instead.", "PO Box 4521"],
  ["ADDRESS", "She moved into Apt 12C recently.", "Apt 12C"],
  ["ADDRESS", "Address is 123 Main Street, Springfield now.", "123 Main Street, Springfield"],
  ["ADDRESS", "She lives in Dayton with her kids.", "Dayton"],
  ["ADDRESS", "He moved to Fort Collins last spring.", "Fort Collins"],
  ["ADDRESS", "Originally from Toledo, came here for work.", "Toledo"],
  ["ADDRESS", "Grew up in Franklin County.", "Franklin County"],
  ["ADDRESS", "Seen in Boise, ID 83702 last year.", "Boise"],
  ["ADDRESS", "Family came from Austin, Texas.", "Austin"],
  // ZIP
  ["ZIP", "ZIP code 90210 area.", "90210"],
  ["ZIP", "Mailing ZIP 62704-1234 on file.", "62704-1234"],
  // DATE
  ["DATE", "Last seen 03/14/2024 for follow-up.", "03/14/2024"],
  ["DATE", "Accident happened 3-4-85 per client.", "3-4-85"],
  ["DATE", "Intake was 2024-03-15.", "2024-03-15"],
  ["DATE", "Symptoms began March 3rd after the move.", "March 3rd"],
  ["DATE", "Hospitalized Sept. 15, 2023 briefly.", "Sept. 15, 2023"],
  ["DATE", "Hospitalized 15 March 2023 briefly.", "15 March 2023"],
  ["DATE", "It started on the 3rd of May.", "3rd of May"],
  ["DATE", "Divorce finalized in March 2019.", "March 2019"],
  ["DATE", "DOB: 030485 per intake sheet.", "030485"],
  ["DATE", "She was born 4/2 and dreads birthdays.", "4/2"],
  ["DATE", "Sober since 8/10 this year.", "8/10"],
  ["DATE", "Her birthday is July 4 and it is hard.", "July 4"],
  ["DATE", "Discharged 12.01.2023 from inpatient.", "12.01.2023"],
  // AGE_OVER_89
  ["AGE_OVER_89", "Her mother is 92 years old.", "92"],
  ["AGE_OVER_89", "Cares for a 95-year-old grandparent.", "95"],
  ["AGE_OVER_89", "Father, age 101, lives nearby.", "101"],
  ["AGE_OVER_89", "Grandmother 93 yo with dementia.", "93"],
  ["AGE_OVER_89", "Neighbor 91 y/o checks in.", "91"],
  ["AGE_OVER_89", "Her aunt is in her late 90s.", "late 90s"],
  ["AGE_OVER_89", "He turned 90 last week.", "90"],
  // PHONE
  ["PHONE", "Call (555) 123-4567 after 5.", "(555) 123-4567"],
  ["PHONE", "Cell 555-123-4567 is best.", "555-123-4567"],
  ["PHONE", "Cell 555.123.4567 is best.", "555.123.4567"],
  ["PHONE", "Cell +1 555 123 4567 is best.", "+1 555 123 4567"],
  ["PHONE", "Office 1-800-555-0199 line.", "1-800-555-0199"],
  ["PHONE", "Text 5551234567 anytime.", "5551234567"],
  ["PHONE", "UK number +44 20 7946 0958 for relatives.", "+44 20 7946 0958"],
  ["PHONE", "Local 555-0199 only.", "555-0199"],
  ["PHONE", "Work 555-123-4567 ext. 22 desk.", "555-123-4567 ext. 22"],
  // FAX
  ["FAX", "Fax: (555) 765-4321 for records.", "(555) 765-4321"],
  ["FAX", "Send by fax 555.765.4321 today.", "555.765.4321"],
  // EMAIL
  ["EMAIL", "Email jane.doe+test@mail.example.co.uk later.", "jane.doe+test@mail.example.co.uk"],
  ["EMAIL", "Contact J_Smith@clinic.org about forms.", "J_Smith@clinic.org"],
  // SSN
  ["SSN", "SSN on file 123-45-6789.", "123-45-6789"],
  ["SSN", "SSN 123456789 was written down.", "123456789"],
  ["SSN", "social security number: 123 45 6789", "123 45 6789"],
  ["SSN", "Last four of SSN 6789 given.", "6789"],
  // MRN
  ["MRN", "MRN: A1234567 at the hospital.", "A1234567"],
  ["MRN", "medical record # 448812 copied.", "448812"],
  ["MRN", "chart # 77-12345 noted.", "77-12345"],
  ["MRN", "Pt ID 4471234 on wristband.", "4471234"],
  // HEALTH_PLAN_ID
  ["HEALTH_PLAN_ID", "Medicaid ID 98765432A is active.", "98765432A"],
  ["HEALTH_PLAN_ID", "member ID XYZ123456789 on the card.", "XYZ123456789"],
  ["HEALTH_PLAN_ID", "policy number: AB-1234567 lapsed.", "AB-1234567"],
  ["HEALTH_PLAN_ID", "Medicare 1EG4-TE5-MK73 confirmed.", "1EG4-TE5-MK73"],
  ["HEALTH_PLAN_ID", "Card shows 1EG4TE5MK73 only.", "1EG4TE5MK73"],
  ["HEALTH_PLAN_ID", "group number 004512 on file.", "004512"],
  // ACCOUNT
  ["ACCOUNT", "Account # 001234567 overdue.", "001234567"],
  ["ACCOUNT", "acct 99812345 billing issue.", "99812345"],
  ["ACCOUNT", "Paid with 4111 1111 1111 1111 yesterday.", "4111 1111 1111 1111"],
  ["ACCOUNT", "Paid with 4111111111111111 yesterday.", "4111111111111111"],
  ["ACCOUNT", "Amex 3782-822463-10005 declined.", "3782-822463-10005"],
  // LICENSE
  ["LICENSE", "DL# D1234567 suspended.", "D1234567"],
  ["LICENSE", "driver's license number S530-4417-9921 seized.", "S530-4417-9921"],
  ["LICENSE", "Nursing license no. RN-123456 at risk.", "RN-123456"],
  ["LICENSE", "certificate 2023-0456 issued.", "2023-0456"],
  // VEHICLE
  ["VEHICLE", "Car plate ABC 1234 was towed.", "ABC 1234"],
  ["VEHICLE", "license plate 7XYZ123 reported.", "7XYZ123"],
  ["VEHICLE", "VIN 1HGCM82633A004352 on title.", "1HGCM82633A004352"],
  ["VEHICLE", "Title lists 1HGCM82633A004352 only.", "1HGCM82633A004352"],
  // DEVICE
  ["DEVICE", "serial number SN-88812345 on pump.", "SN-88812345"],
  ["DEVICE", "S/N: X9Y8Z7001 recorded.", "X9Y8Z7001"],
  ["DEVICE", "Phone IMEI 490154203237518 logged.", "490154203237518"],
  ["DEVICE", "Router MAC 00:1A:2B:3C:4D:5E seen.", "00:1A:2B:3C:4D:5E"],
  ["DEVICE", "pacemaker serial PM448812 checked.", "PM448812"],
  // URL
  ["URL", "Blog at https://example.com/my-story?id=7 shared.", "https://example.com/my-story?id=7"],
  ["URL", "See www.example.org for her page.", "www.example.org"],
  ["URL", "Profile facebook.com/jane.doe posted.", "facebook.com/jane.doe"],
  ["URL", "Follows @jdoe_88 online.", "@jdoe_88"],
  // IP
  ["IP", "Login from 192.168.1.10 flagged.", "192.168.1.10"],
  ["IP", "Gateway 10.0.0.255 used.", "10.0.0.255"],
  ["IP", "IPv6 2001:db8::8a2e:370:7334 seen.", "2001:db8::8a2e:370:7334"],
  ["IP", "Full 2001:0db8:85a3:0000:0000:8a2e:0370:7334 address.", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"],
  // BIOMETRIC
  ["BIOMETRIC", "fingerprint ID FP-20391 enrolled.", "FP-20391"],
  ["BIOMETRIC", "voiceprint 77A1B2C3 stored.", "77A1B2C3"],
  ["BIOMETRIC", "retina scan RS-44812 on badge.", "RS-44812"],
  ["BIOMETRIC", "iris scan code IR99812 used.", "IR99812"],
  // OTHER_ID
  ["OTHER_ID", "Ticket #12345 opened.", "#12345"],
  ["OTHER_ID", "Code AB12345 given.", "AB12345"],
  ["OTHER_ID", "Number 84719265 written.", "84719265"],
  ["OTHER_ID", "passport X12345678 expired.", "X12345678"],
];

describe("scrubPHI positives", () => {
  it.each(POSITIVES)("%s: %s", (type, text, secret) => {
    const r = expectRedacted(text, secret, type);
    expectConsistent(text, r);
  });

  it("covers every PhiType in the positive table", () => {
    const covered = new Set(POSITIVES.map(([t]) => t));
    for (const t of Object.keys(PHI_TYPE_LABELS) as PhiType[]) expect(covered.has(t), t).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Negatives: ordinary clinical text must not be redacted              */
/* ------------------------------------------------------------------ */

const NEGATIVES: [string, string][] = [
  ["measure score", "PHQ-9 of 14 indicates moderate symptoms."],
  ["measure equals", "GAD-7 = 12 today, PCL-5 score 41."],
  ["ICD codes", "Codes considered: F41.1, F43.10, 6B00, F32.A, F41.0, F40.00, 6A70.3."],
  ["durations", "Symptoms for 6 months, worse over the last 2 weeks."],
  ["counts", "Reports 3 panic attacks a week, 3-4 times on bad weeks."],
  ["ages 0-89", "A 45-year-old adult; her sister is 34 yo; father age 89; 89 years old uncle."],
  ["ratings", "Anxiety rated 8/10, sometimes 10/10 anxiety, drinks on 3/7 days."],
  ["years", "Symptoms since 2019, worse in 2021, stable 2019-2021."],
  ["meds and doses", "Taking sertraline 50 mg daily, Xanax as needed, previously Zoloft 100mg, range 100-200 mg."],
  ["abbreviations", "Denies SI, HI. History of PTSD; CBT with PCP referral; MDD, GAD; seen in ER and ED."],
  ["sentence start", "Panic attacks started after a car accident. Worry is constant."],
  ["weekdays", "Worse on Monday and Friday, better by Sunday."],
  ["religious words", "Finds comfort in God, the Bible, and Allah; prays to the Lord."],
  ["scripture refs", "Reads Psalm 23 and John 3:16 when anxious."],
  ["states and countries", "Moved here from Texas; family in Mexico; lives in Ohio; grew up in North Carolina."],
  ["state only after city cue", "Lives in New York and visits Georgia."],
  ["breathing techniques", "Practiced 4-7-8 breathing and 5-4-3-2-1 grounding."],
  ["genes", "CYP2C19 poor metabolizer per testing."],
  ["named scales", "Hamilton Anxiety Rating Scale, Beck Depression Inventory, Patient Health Questionnaire."],
  ["theorists", "Uses Clark's cognitive model of panic."],
  ["ambiguous names as words", "Will she improve? May be related to stress. Grace under pressure. Hope remains."],
  ["month alone", "She feels hopeful in March and dreads December."],
  ["medication switch", "Switched from Lexapro to Zoloft last spring."],
  ["vitals", "BMI 27.5, BP 120/80, HR 72 bpm, temp 98.6."],
  ["statistics", "About 19.1% of adults, roughly 40 million people, 1,000,000 visits."],
  ["at shorthand", "Stress @work and @home is high."],
  ["faith-based care", "Prefers Christian counseling with prayer."],
  ["session counts", "Session 4 of 12 on Tuesday."],
  ["modalities", "Trauma-focused CBT (TF-CBT), EMDR, DBT, ACT, and IPT."],
  ["crisis line", "Gave 988 and findahelpline.com as crisis resources."],
];

describe("scrubPHI negatives (must not redact clinical text)", () => {
  it.each(NEGATIVES)("%s", (_label, text) => expectClean(text));

  it("leaves an empty string alone", () => {
    expect(scrubPHI("")).toEqual({ clean: "", findings: [] });
  });
});

/* ------------------------------------------------------------------ */
/* Realistic mixed paragraph                                           */
/* ------------------------------------------------------------------ */

const PARAGRAPH =
  "Client Maria Gonzalez (DOB 04/12/1961), MRN 00482913, lives at 742 Evergreen Terrace, Springfield, IL 62704. " +
  "Reached at (217) 555-0142 or maria.g@example.com. Her husband Tom drove her to the ER on 3/2. " +
  "She reports panic attacks 3-4 times a week for 6 months, rated 8/10. PHQ-9 of 14 and GAD-7 = 15. " +
  "Sertraline 50 mg started in 2019. Denies SI/HI. Medicaid ID 98765432A. " +
  "Prefers prayer and reading the Bible on Sunday. Plan: CBT for panic, F41.0 for clinician review.";

const PLANTED: [string, PhiType][] = [
  ["Maria Gonzalez", "NAME"],
  ["04/12/1961", "DATE"],
  ["00482913", "MRN"],
  ["742 Evergreen Terrace", "ADDRESS"],
  ["Springfield", "ADDRESS"],
  ["62704", "ZIP"],
  ["(217) 555-0142", "PHONE"],
  ["maria.g@example.com", "EMAIL"],
  ["Tom", "NAME"],
  ["3/2", "DATE"],
  ["98765432A", "HEALTH_PLAN_ID"],
];

const KEPT = [
  "panic attacks 3-4 times a week for 6 months",
  "rated 8/10",
  "PHQ-9 of 14",
  "GAD-7 = 15",
  "Sertraline 50 mg started in 2019",
  "Denies SI/HI",
  "Bible on Sunday",
  ", IL ",
  "the ER on",
  "CBT for panic, F41.0 for clinician review",
];

describe("realistic clinical paragraph", () => {
  const r = scrubPHI(PARAGRAPH);

  it.each(PLANTED)("redacts planted %s as %s", (secret, type) => {
    expectRedacted(PARAGRAPH, secret, type);
  });

  it("keeps the clinical content", () => {
    for (const k of KEPT) expect(r.clean, k).toContain(k);
  });

  it("produces consistent findings", () => expectConsistent(PARAGRAPH, r));

  it("summarizes by type in order of first appearance", () => {
    const s = summarizeFindings(r.findings);
    expect(s[0]).toEqual({ type: "NAME", label: "Name", count: 2 });
    // "742 Evergreen Terrace, Springfield" is one span (street line + city).
    expect(s.find((x) => x.type === "ADDRESS")?.count).toBe(1);
    expect(s.map((x) => x.type)).toEqual([...new Set(r.findings.map((f) => f.type))]);
    expect(s.reduce((n, x) => n + x.count, 0)).toBe(r.findings.length);
  });
});

/* ------------------------------------------------------------------ */
/* Idempotency, indices, purity, performance                           */
/* ------------------------------------------------------------------ */

describe("idempotency", () => {
  const texts = [...POSITIVES.map(([, t]) => t), PARAGRAPH, ...NEGATIVES.map(([, t]) => t)];
  it.each(texts.map((t) => [t]))("scrubbing clean output finds nothing new: %s", (text) => {
    const once = scrubPHI(text).clean;
    const twice = scrubPHI(once);
    expect(twice.findings, `${once} -> ${twice.clean}`).toEqual([]);
    expect(twice.clean).toBe(once);
  });
});

describe("index correctness", () => {
  it("findings point at the original text", () => {
    const text = "Call 555-123-4567, email a.b@example.com, ZIP 90210.";
    const r = scrubPHI(text);
    expect(r.findings.map((f) => [f.type, text.slice(f.start, f.end)])).toEqual([
      ["PHONE", "555-123-4567"],
      ["EMAIL", "a.b@example.com"],
      ["ZIP", "90210"],
    ]);
    expect(r.clean).toBe("Call [PHONE], email [EMAIL], ZIP [ZIP].");
  });

  it("prefers the higher-priority, longer span on overlap", () => {
    const text = "Paid at 456 John Street yesterday.";
    const r = scrubPHI(text);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.type).toBe("ADDRESS");
    expect(text.slice(r.findings[0]!.start, r.findings[0]!.end)).toBe("456 John Street");
  });

  it("cued identifiers beat bare formats", () => {
    expect(scrubPHI("MRN 5551234567").findings[0]!.type).toBe("MRN");
  });

  it("is consistent across all positives", () => {
    for (const [, text] of POSITIVES) expectConsistent(text, scrubPHI(text));
  });
});

describe("purity and helpers", () => {
  it("is deterministic", () => {
    expect(scrubPHI(PARAGRAPH)).toEqual(scrubPHI(PARAGRAPH));
  });

  it("containsPHI", () => {
    expect(containsPHI("Client John is anxious.")).toBe(true);
    expect(containsPHI("PHQ-9 of 14; anxiety 8/10 for 6 months.")).toBe(false);
  });

  it("labels every type with readable text", () => {
    const types = Object.keys(PHI_TYPE_LABELS) as PhiType[];
    expect(types).toHaveLength(19);
    for (const t of types) expect(PHI_TYPE_LABELS[t].length).toBeGreaterThan(2);
  });

  it("summarizeFindings of nothing is empty", () => {
    expect(summarizeFindings([])).toEqual([]);
  });
});

describe("performance", () => {
  const big = (PARAGRAPH + " ").repeat(Math.ceil(5000 / PARAGRAPH.length)).slice(0, 5000);

  it("scrubs 5,000 characters in under 20 ms", () => {
    scrubPHI(big); // warm up the JIT
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      scrubPHI(big);
      times.push(performance.now() - t0);
    }
    expect(Math.min(...times)).toBeLessThan(20);
  });

  it.each([
    ["dotted run", "a.".repeat(2500)],
    ["dashed digits", "1-".repeat(2500)],
    ["at signs", "a@".repeat(2500)],
    ["colons", "a:".repeat(2500)],
    ["capitalized words", "Word ".repeat(1000)],
    ["digits", "9".repeat(5000)],
  ])("no catastrophic backtracking: %s", (_label, text) => {
    const t0 = performance.now();
    scrubPHI(text);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
