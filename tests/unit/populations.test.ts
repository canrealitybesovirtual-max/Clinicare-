/**
 * Population adaptation profiles (content/populations): every planned profile loads with governance and original
 * wording; profiles ask rather than assume (questions, a stereotype caution, no sweeping claims about a group);
 * every profile carries safety notes for the always-visible crisis panel; substance-use wording carries the Part 2
 * flag; other measures are link-outs registered in licenses.json; links into the library, referral directory and
 * client topics resolve; and the population referral kinds and their client help lines are wired up.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { helpRegions } from "@/components/client/help-directory";
import { directoryGroups } from "@/components/referrals/directory-data";
import { KIND_LABELS, KIND_ORDER } from "@/components/referrals/referral-format";
import { formulations } from "@/lib/formulations";
import { orientations } from "@/lib/orientations";
import {
  getPopulation,
  loadedPopulationRefs,
  populationLinks,
  populationNotesFor,
  populationProblems,
  populations,
  populationsByGroup,
} from "@/lib/populations";
import { practiceGuides } from "@/lib/practice";
import { GENERALIZATION, POPULATION_GROUPS, PopulationSchema, type Population } from "@/lib/schemas-populations";
import { CRISIS_LIKE_KINDS, REFERRAL_KINDS, ReferralDirectorySchema } from "@/lib/schemas-referrals";
import usJson from "@content/referrals/us.json";

const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(ROOT, "content/populations");

/** The profiles this section owns (fill plan ids.populations). */
const POPULATION_IDS = [
  "cultural-adaptation",
  "lgbtq-affirmative",
  "spiritually-integrated",
  "perinatal",
  "older-adults",
  "autistic-adults",
  "intellectual-disability",
  "deaf-and-hard-of-hearing",
  "disability-affirming",
  "traumatic-brain-injury",
  "military-and-veterans",
  "first-responders-and-health-workers",
  "refugees-and-asylum-seekers",
  "indigenous-peoples",
  "men-and-masculinity",
  "college-students",
  "rural-and-agricultural",
  "justice-involved",
  "housing-instability",
  "serious-medical-illness",
  "post-exertional-malaise",
  "sexual-violence-and-trafficking-survivors",
  "sexual-health-in-therapy",
];

/** Words that mean a profile's own wording touches substance use (G6). */
const SUBSTANCE_WORDS = /\b(alcohol|substance|drug use|drugs|opioids?|cannabis|overdose|naloxone|drinking)\b/i;

const base = (): Population => structuredClone(getPopulation("perinatal")!);

describe("population profiles: content", () => {
  it("loads every planned profile, one file per id, in the generated index", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
    expect([...files].sort()).toEqual([...POPULATION_IDS].sort());
    expect(populations.map((p) => p.id).sort()).toEqual([...POPULATION_IDS].sort());
    for (const id of files) {
      const raw = JSON.parse(readFileSync(path.join(DIR, `${id}.json`), "utf8")) as { id: string };
      expect(raw.id).toBe(id);
      expect(PopulationSchema.safeParse(raw).success, id).toBe(true);
    }
  });

  it("carries governance on every profile (G10): sources, original license, verified today, pending review", () => {
    for (const p of populations) {
      expect(p.sources.length, p.id).toBeGreaterThan(0);
      expect(p.license).toBe("original");
      expect(p.lastVerified).toBe("2026-11-27");
      expect(p.reviewedBy).toBe("PENDING");
      for (const s of p.sources) expect(s.url, p.id).toMatch(/^https:\/\//);
      for (const l of p.linkOuts) expect(l.lastVerified, `${p.id} ${l.url}`).toBe("2026-11-27");
    }
  });

  it("asks rather than assumes: questions, a stereotype caution and adult scope on every profile", () => {
    for (const p of populations) {
      expect(p.askAbout.length, p.id).toBeGreaterThanOrEqual(3);
      for (const q of p.askAbout) expect(q.trim().endsWith("?"), `${p.id}: ${q}`).toBe(true);
      expect(p.stereotypeCaution.length, p.id).toBeGreaterThan(40);
      expect(p.scopeNote, p.id).toMatch(/adult/i);
      expect(p.scopeNote, p.id).toMatch(/never (asks for|saves)|never asks/i);
    }
  });

  it("puts safety notes on every profile (the page always shows the crisis resources next to them)", () => {
    for (const p of populations) expect(p.safetyNotes.length, p.id).toBeGreaterThan(0);
  });

  it("flags Part 2 on every profile whose wording touches substance use (G6)", () => {
    for (const p of populations) {
      const { sources: _s, linkOuts: _l, ...rest } = p;
      if (SUBSTANCE_WORDS.test(JSON.stringify(rest))) expect(p.sud, p.id).toBe(true);
    }
  });

  it("lists only link-out measures, never the built-in GAD-7 or PHQ-9, with PubMed or official URLs (G7)", () => {
    for (const p of populations)
      for (const m of p.measuresPending) {
        expect(m.licenseKey, p.id).not.toMatch(/^(PHQ-9|GAD-7)$/);
        expect(m.url, p.id).toMatch(/^https:\/\/(pubmed\.ncbi\.nlm\.nih\.gov|www\.ptsd\.va\.gov)\//);
      }
  });

  it("keeps contested practices to cautions: conversion efforts, graded exercise and debriefing appear only as warnings", () => {
    const contested = /conversion (efforts|therapy)|change (sexual )?orientation|graded exercise|debriefing|facilitated communication|recover memories/i;
    for (const p of populations) {
      const recommended = [...p.keyConsiderations, ...p.sessionAdaptations, ...p.interventionNotes.map((n) => n.note)];
      for (const text of recommended) {
        if (!contested.test(text)) continue;
        expect(text, `${p.id}: ${text}`).toMatch(/\b(do not|never|not recommended|not a|avoid|harm|unsupported)\b/i);
      }
    }
  });
});

describe("population profiles: links into the library", () => {
  const nonLicense = (problems: string[]) => problems.filter((p) => !/has no licenses\.json entry/.test(p));

  it("resolves every intervention, orientation, handout, topic, guide, framework, legal topic, code and referral", () => {
    expect(nonLicense(populationProblems())).toEqual([]);
  });

  it("registers every link-out measure in licenses.json as pending (G7)", () => {
    expect(populationProblems().filter((p) => /has no licenses\.json entry/.test(p))).toEqual([]);
  });

  it("is the target of every population id used by orientations, practice guides and formulations", () => {
    const ids = new Set(populations.map((p) => p.id));
    const used = [
      ...orientations.flatMap((o) => o.relatedPopulationIds),
      ...practiceGuides.flatMap((g) => g.relatedPopulationIds),
      ...formulations.flatMap((f) => f.populationIds),
    ];
    expect(used.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("shows reverse links from practice guides and frameworks that point at a profile", () => {
    const links = populationLinks(getPopulation("perinatal")!);
    expect(links.practice.map((g) => g.id)).toContain("postpartum-psychosis-vs-intrusive-thoughts");
    const military = populationLinks(getPopulation("military-and-veterans")!);
    expect(military.formulations.map((f) => f.id)).toContain("moral-injury");
    expect(military.referrals.map((r) => r.id)).toContain("veterans-crisis-line");
  });

  it("finds the notes for one intervention or orientation, for the adaptations panel", () => {
    const sleep = populationNotesFor({ interventionId: "cbti-sleep-restriction" }).map((n) => n.population.id);
    expect(sleep).toEqual(expect.arrayContaining(["perinatal", "older-adults", "first-responders-and-health-workers", "traumatic-brain-injury"]));
    const trauma = populationNotesFor({ orientationId: "trauma-focused-therapies" }).map((n) => n.population.id);
    expect(trauma).toContain("military-and-veterans");
    expect(populationNotesFor({ interventionId: "not-an-intervention" })).toEqual([]);
  });

  it("groups profiles in the fixed group order, each profile once", () => {
    const groups = populationsByGroup();
    expect(groups.map((g) => g.group)).toEqual(POPULATION_GROUPS.filter((g) => groups.some((x) => x.group === g)));
    const placed = groups.flatMap((g) => g.items.map((p) => p.id));
    expect([...placed].sort()).toEqual(populations.map((p) => p.id).sort());
  });
});

describe("population profiles: schema and cross-file guards", () => {
  it("refuses quoted passages and sweeping claims about a group", () => {
    expect(PopulationSchema.safeParse({ ...base(), summary: `${base().summary} "quoted manual text"` }).success).toBe(false);
    const claim = "Most veterans are reluctant to talk about feelings, so keep sessions practical.";
    expect(GENERALIZATION.test(claim)).toBe(true);
    expect(PopulationSchema.safeParse({ ...base(), keyConsiderations: [...base().keyConsiderations, claim] }).success).toBe(false);
    expect(GENERALIZATION.test("Ask how the person prefers to be addressed.")).toBe(false);
  });

  it("requires questions in askAbout and exactly one target per adaptation note", () => {
    expect(PopulationSchema.safeParse({ ...base(), askAbout: ["Tell me about your sleep.", ...base().askAbout] }).success).toBe(false);
    const both = { interventionId: "behavioral-activation", orientationId: "behavior-therapy", note: "A note long enough to pass the length rule." };
    expect(PopulationSchema.safeParse({ ...base(), interventionNotes: [both] }).success).toBe(false);
    const none = { note: "A note long enough to pass the length rule." };
    expect(PopulationSchema.safeParse({ ...base(), interventionNotes: [none] }).success).toBe(false);
  });

  it("reports unknown links, unregistered or confirmed measures, Part 2 gaps and empty referral kinds", () => {
    const refs = loadedPopulationRefs();
    const bad: Population = {
      ...base(),
      id: "test-profile",
      sud: false,
      handoutIds: ["drinking-diary", "no-such-handout"],
      referralIds: ["no-such-entry"],
      measuresPending: [
        { name: "Unregistered scale", url: "https://pubmed.ncbi.nlm.nih.gov/1/", licenseKey: "NOT-A-KEY" },
        { name: "Confirmed scale", url: "https://pubmed.ncbi.nlm.nih.gov/2/", licenseKey: "PHQ-9" },
      ],
    };
    const problems = populationProblems([bad], { ...refs, referralKinds: new Set() }, "2026-11-27");
    expect(problems).toEqual(
      expect.arrayContaining([
        "populations/test-profile: unknown handout no-such-handout",
        "populations/test-profile: unknown referral entry no-such-entry",
        "populations/test-profile: pending measure Unregistered scale has no licenses.json entry NOT-A-KEY (G7)",
        "populations/test-profile: Confirmed scale is confirmed in licenses.json; build it in or drop it from measuresPending",
        "populations/test-profile: links a substance-use handout but sud is false (G6)",
        "populations/test-profile: referral kind perinatal has no directory entry",
      ]),
    );
  });
});

describe("population referral kinds", () => {
  const us = ReferralDirectorySchema.parse(usJson);
  const byId = new Map(us.entries.map((e) => [e.id, e]));

  it("orders and labels every kind, and every kind has at least one directory entry", () => {
    expect([...KIND_ORDER].sort()).toEqual([...REFERRAL_KINDS].sort());
    for (const k of REFERRAL_KINDS) expect(KIND_LABELS[k].length, k).toBeGreaterThan(3);
    const grouped = new Set(directoryGroups().map((g) => g.kind));
    for (const k of REFERRAL_KINDS) expect(grouped.has(k), k).toBe(true);
  });

  it("lists the verified population services with their official contact routes", () => {
    expect(byId.get("national-domestic-violence-hotline")).toMatchObject({ phone: "1-800-799-7233", text: "Text START to 88788", kind: "violence-and-abuse" });
    expect(byId.get("rainn-sexual-assault-hotline")).toMatchObject({ phone: "1-800-656-4673", kind: "violence-and-abuse" });
    expect(byId.get("national-maternal-mental-health-hotline")).toMatchObject({ phone: "1-833-852-6262", kind: "perinatal", hours: "24/7" });
    expect(byId.get("va-caregiver-support-line")).toMatchObject({ phone: "855-260-3274", kind: "older-adults-and-caregivers" });
    expect(byId.get("va-homeless-veterans-call-center")).toMatchObject({ phone: "877-424-3838", kind: "basic-needs", hours: "24/7" });
    for (const e of us.entries) if (e.lastVerified !== "unverified") expect(e.verification, e.id).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("gives violence and abuse hotlines the crisis colour and shows them in client help", () => {
    expect(CRISIS_LIKE_KINDS.has("violence-and-abuse")).toBe(true);
    const usHelp = helpRegions().find((r) => r.region === "US")!.entries;
    const dv = usHelp.find((e) => e.id === "national-domestic-violence-hotline");
    expect(dv).toMatchObject({ crisis: true, tel: "18007997233" });
    expect(usHelp.some((e) => e.id === "national-maternal-mental-health-hotline")).toBe(true);
    // Directories and URL-only services are not phone lines, so client help leaves them out.
    expect(usHelp.some((e) => e.id === "postpartum-support-international" || e.id === "job-accommodation-network")).toBe(false);
  });
});
