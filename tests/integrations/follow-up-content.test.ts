/**
 * Follow-up content (content/follow-ups/*.json, content/trigger-objects.json): governance, cross-references
 * against the CURRENT lexicon and condition files on disk, coverage of the required topics, guardrails.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { measures } from "@/lib/content";
import { allHandouts, interventions } from "@/lib/library";
import { REFERRAL_KINDS } from "@/lib/schemas-referrals";
import { SymptomLexiconSchema } from "@/lib/schemas";
import {
  FOLLOW_UP_REFERRAL_KINDS,
  FollowUpBankFileSchema,
  NPPES_REFERRAL_KINDS,
  SURFACES,
  TriggerObjectsFileSchema,
} from "@/lib/schemas-follow-up";
import { PROVIDER_TYPES } from "@/server/integrations/nppes";
import { bankProblems, followUpBank, followUpFiles, referencedSymptomIds } from "@/lib/follow-up/bank";
import { SURFACE_INFO } from "@/lib/follow-up/surfaces";
import { resourceHints } from "@/lib/follow-up/catalog";
import { extractTriggers } from "@/lib/follow-up/triggers";
import { scoreConditions } from "@/lib/scoring";
import { conditions, lexicon } from "@/lib/content";

const ROOT = path.resolve(__dirname, "../..");
const CONTENT = path.join(ROOT, "content");
const TODAY = new Date().toISOString().slice(0, 10);
const json = (rel: string) => JSON.parse(readFileSync(path.join(CONTENT, rel), "utf8")) as unknown;
const slugsIn = (dir: string, key = "id") =>
  new Set(
    readdirSync(path.join(CONTENT, dir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => (json(`${dir}/${f}`) as Record<string, string>)[key] as string),
  );

describe("governance (G10) on every follow-up file, read from disk", () => {
  const files = readdirSync(path.join(CONTENT, "follow-ups")).filter((f) => f.endsWith(".json")).sort();

  it("loads every bank file in bank.ts (none left out)", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(followUpFiles.map((f) => f.id).sort());
  });

  it.each(files)("%s parses, id matches the file name, license original, sources https, lastVerified not in the future", (f) => {
    const bank = FollowUpBankFileSchema.parse(json(`follow-ups/${f}`));
    expect(bank.id).toBe(f.replace(/\.json$/, ""));
    expect(bank.license).toBe("original");
    expect(bank.reviewedBy).toBe("PENDING");
    expect(bank.lastVerified <= TODAY).toBe(true);
    for (const s of bank.sources) expect(s.url).toMatch(/^https:\/\//);
  });

  it("trigger-objects.json parses with governance", () => {
    const t = TriggerObjectsFileSchema.parse(json("trigger-objects.json"));
    expect(t.lastVerified <= TODAY).toBe(true);
    expect(t.reviewedBy).toBe("PENDING");
  });
});

describe("cross-references", () => {
  it("every symptom id the banks use exists in content/symptoms.json as it is on disk now", () => {
    const lex = SymptomLexiconSchema.parse(json("symptoms.json"));
    const known = new Set(lex.symptoms.map((s) => s.id));
    expect(referencedSymptomIds().filter((id) => !known.has(id))).toEqual([]);
    expect(bankProblems({ symptoms: lex.symptoms })).toEqual([]);
  });

  it("condition ids are existing conditions or conditions with a plan library (being added)", () => {
    const allowed = new Set([...slugsIn("conditions"), ...slugsIn("plans", "conditionId")]);
    const used = new Set<string>();
    for (const q of followUpBank) {
      for (const id of q.discriminates) used.add(id);
      for (const id of q.showWhen.conditionIds ?? []) used.add(id);
      for (const id of q.alsoRequires?.conditionIds ?? []) used.add(id);
    }
    const dict = TriggerObjectsFileSchema.parse(json("trigger-objects.json"));
    for (const info of Object.values(dict.categories)) for (const id of info.conditionHints) used.add(id);
    expect([...used].filter((id) => !allowed.has(id))).toEqual([]);
  });

  it("referral kinds stay in sync with the NPPES provider types and the directory kinds", () => {
    expect([...NPPES_REFERRAL_KINDS].sort()).toEqual([...PROVIDER_TYPES].sort());
    for (const k of ["crisis", "substance-use", "peer-support"] as const) {
      expect(FOLLOW_UP_REFERRAL_KINDS).toContain(k);
      expect(REFERRAL_KINDS).toContain(k);
    }
  });

  it("every surface has display info, and in-app links point at routes and content that exist", () => {
    for (const s of SURFACES) expect(SURFACE_INFO[s].label.length).toBeGreaterThan(3);
    const app = path.join(ROOT, "src/app/(clinician)");
    expect(existsSync(path.join(app, "handouts/[id]/page.tsx"))).toBe(true);
    expect(existsSync(path.join(app, "interventions/[id]/page.tsx"))).toBe(true);
    expect(existsSync(path.join(app, "referrals/page.tsx"))).toBe(true);
    expect(allHandouts.some((h) => h.id === "safety-plan")).toBe(true);
    expect(interventions.some((i) => i.id === "lethal-means-counseling")).toBe(true);
    expect(SURFACE_INFO["part2-notice"].description).toMatch(/42 CFR Part 2/);
  });

  it("resource hints only ever return ids that exist, and license-confirmed measures only (G7)", () => {
    const iv = new Set(interventions.map((i) => i.id));
    const ho = new Set(allHandouts.map((h) => h.id));
    const me = new Set(measures.map((m) => m.id));
    const inputs: [string[], string][] = [
      [["depressed-mood", "anhedonia", "suicidal-ideation-active"], "panic from dogs"],
      [["worry-excessive", "worry-hard-to-control", "insomnia"], "worries about germs"],
      [["traumatic-event-exposure", "nightmares", "flashbacks", "avoidance-trauma-reminders"], "afraid of driving since the crash"],
      [["alcohol-benzo-withdrawal"], "anxious about parties"],
    ];
    for (const [symptomIds, text] of inputs) {
      const r = scoreConditions({ symptomIds, duration: "gte6m", impairment: "yes", substancePossible: "unknown", medicalPossible: "unknown" }, conditions, lexicon.symptoms);
      const h = resourceHints(r, extractTriggers(text), { surfaces: ["safety-plan", "medical-referral"] });
      for (const id of h.interventionIds) expect(iv.has(id), id).toBe(true);
      for (const id of h.handoutIds) expect(ho.has(id), id).toBe(true);
      for (const id of h.measureIds) expect(me.has(id), id).toBe(true);
      for (const k of h.referralKinds) expect(FOLLOW_UP_REFERRAL_KINDS).toContain(k);
      expect(h).toEqual(resourceHints(r, extractTriggers(text), { surfaces: ["safety-plan", "medical-referral"] }));
    }
  });

  it("puts safety first in hints and flags substance-use content for the Part 2 notice (G6)", () => {
    const r = scoreConditions({ symptomIds: ["depressed-mood", "suicidal-ideation-active"], duration: "1to6m", impairment: "yes", substancePossible: "unknown", medicalPossible: "unknown" }, conditions, lexicon.symptoms);
    const h = resourceHints(r, []);
    expect(h.referralKinds[0]).toBe("crisis");
    expect(h.interventionIds.slice(0, 2)).toEqual(["collaborative-safety-planning", "lethal-means-counseling"]);
    expect(h.handoutIds[0]).toBe("safety-plan");
    expect(h.part2).toBe(false);
    const w = scoreConditions({ symptomIds: ["alcohol-benzo-withdrawal"], duration: "unknown", impairment: "unknown", substancePossible: "yes", medicalPossible: "unknown" }, conditions, lexicon.symptoms);
    const hw = resourceHints(w, []);
    expect(hw.referralKinds).toEqual(expect.arrayContaining(["urgent-medical", "addiction-counselor"]));
    expect(hw.part2).toBe(true);
    expect(hw.part2Notice).toMatch(/42 CFR Part 2/);
  });
});

describe("coverage of the required topics", () => {
  const byId = new Map(followUpBank.map((q) => [q.id, q] as const));
  const text = (id: string) => {
    const q = byId.get(id);
    return q ? [q.text, q.textNoTrigger ?? "", q.why, ...q.options.map((o) => o.label)].join(" ") : "";
  };

  it.each([
    ["panic vs cued fear", "fear-cued-or-unexpected", /out of the blue/],
    ["avoidance of the trigger", "fear-avoids-trigger", /steer clear of <trigger>/],
    ["fear bigger than the real danger", "fear-out-of-proportion", /much bigger than the real danger/],
    ["how the fear began (event, panic, long-standing)", "fear-onset", /begin/],
    ["agoraphobia vs situational phobia", "fear-escape-several-places", /trapped or cut off from help/],
    ["social anxiety", "fear-social-scrutiny", /watched, judged or embarrassed/],
    ["GAD vs OCD vs illness anxiety", "worry-scope", /serious illness/],
    ["OCD rituals", "ocd-rituals", /checking/],
    ["anhedonia", "mood-interest", /interest or pleasure/],
    ["depression course", "mood-course", /years/],
    ["bipolar rule-out", "mood-elevated-history", /little need for sleep/],
    ["trauma exposure", "trauma-event", /terrifying or dangerous/],
    ["trauma timing under a month", "trauma-timing", /first month/],
    ["insomnia primary vs secondary", "sleep-main-driver", /in its own right/],
    ["alcohol pattern", "alcohol-pattern", /heavy-drinking days/],
    ["alcohol withdrawal", "alcohol-withdrawal", /urgent medical assessment/],
    ["grief time since loss", "grief-time-since", /How long ago did the death happen/],
    ["duration gate", "gate-duration", /how long/i],
    ["impairment gate", "gate-impairment", /get in the way/],
    ["caffeine and substances", "ruleout-substances", /[Cc]affeine/],
    ["thyroid and cardiac", "ruleout-medical-anxiety", /thyroid.*heart rhythm/],
    ["asking directly about suicide", "safety-ask-directly", /suicide or self-harm/],
  ])("%s (%s)", (_label, id, re) => {
    expect(byId.has(id), id).toBe(true);
    expect(text(id)).toMatch(re);
  });

  it("marks every alcohol and substance question for the Part 2 notice", () => {
    for (const q of followUpBank.filter((x) => x.domain === "alcohol" || x.id === "ruleout-substances")) expect(q.sud, q.id).toBe(true);
  });

  it("gives every safety question a 'not asked yet' option that keeps it open, and a recorded 'yes' surfaces crisis resources", () => {
    const safety = followUpBank.filter((q) => q.kind === "safety");
    expect(safety.length).toBeGreaterThanOrEqual(4);
    for (const q of safety) expect(q.options.some((o) => o.keepOpen), q.id).toBe(true);
    const ask = byId.get("safety-ask-directly");
    for (const o of ask?.options.filter((x) => x.effects.addSymptomIds?.length) ?? [])
      expect(o.surfaces, o.id).toEqual(expect.arrayContaining(["crisis-resources", "safety-plan"]));
  });
});

describe("guardrails on wording (G1, G2, G4, G15)", () => {
  const files = ["trigger-objects.json", ...readdirSync(path.join(CONTENT, "follow-ups")).map((f) => `follow-ups/${f}`)];

  it.each(files)("%s has no DSM criteria structure, Wiley wording, homeopathy or certification claims", (f) => {
    const raw = readFileSync(path.join(CONTENT, f), "utf8");
    expect(raw).not.toMatch(/Criterion [A-H]\b|[Cc]riteria [A-H]\b|DSM-5-TR [Cc]riteria/);
    expect(raw).not.toMatch(/PracticePlanners|Wiley/);
    expect(raw).not.toMatch(/[Hh]omeopath/);
    expect(raw).not.toMatch(/HIPAA[ -](certified|approved|certification)/);
    // Any mention of DSM-5-TR is a pointer, never quoted text.
    for (const m of raw.matchAll(/DSM-5-TR[^"]{0,40}/g)) expect(m[0]).toMatch(/see DSM-5-TR|DSM-5-TR, see|DSM-5-TR\)/i);
  });

  it("keeps original wording: no stock criteria phrasing (frequency qualifiers and adjective triads of the manual)", () => {
    for (const q of followUpBank) {
      const all = [q.text, q.textNoTrigger ?? "", q.why, ...q.options.flatMap((o) => [o.label, o.note ?? ""])].join(" ");
      expect(all, q.id).not.toMatch(/nearly every day|more days than not|almost always|almost every time|\bexpansive\b|more than an hour a day|out of proportion/i);
    }
  });

  it("never states a diagnosis or a risk level in question text", () => {
    for (const q of followUpBank) {
      const all = [q.text, q.why, ...q.options.flatMap((o) => [o.label, o.note ?? ""])].join(" ");
      expect(all, q.id).not.toMatch(/\b(the client has|diagnosis is|diagnosed with)\b/i);
      expect(all, q.id).not.toMatch(/\b(high|low|moderate|imminent) risk\b/i);
    }
  });
});
