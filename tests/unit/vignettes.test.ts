/**
 * End-to-end clinical vignettes over the REAL content: free text -> scrubPHI -> matchSymptoms ->
 * scoreConditions, with the toggles a clinician would set. All vignettes are fictional and
 * de-identified (the one with identifiers uses obviously fake values to prove they are scrubbed first).
 *
 * The assertions describe realistic, conservative behavior: a ranked list of possible considerations
 * for clinician review, never a diagnosis; no "strong" match from a thin picture; red flags always
 * surfaced; negated symptoms kept out; and "insufficient" instead of a forced match.
 */
import { describe, expect, it } from "vitest";
import { conditions, lexicon } from "@/lib/content";
import { matchSymptoms, type MatchResult } from "@/lib/matcher";
import { scrubPHI } from "@/lib/phi-scrubber";
import type { RedFlagType } from "@/lib/schemas";
import { scoreConditions } from "@/lib/scoring";
import type { ScoringInput, ScoringResult, ScrubResult, Suggestion, SuggestionFlagType } from "@/lib/types";

type Toggles = Partial<Omit<ScoringInput, "symptomIds">>;
type Strength = Suggestion["strength"];
type ConditionId = "panic-disorder" | "agoraphobia" | "generalized-anxiety-disorder" | "major-depressive-disorder" | "ptsd";

interface Expectation {
  status: ScoringResult["status"];
  /** Suggestions that must lead the list, in this order. */
  top?: ConditionId[];
  /** Suggestions that must be present (any position). */
  includes?: ConditionId[];
  /** Suggestions that must not appear at all. */
  excludes?: ConditionId[];
  /** Strength per suggestion: one value or the allowed set. */
  strength?: Partial<Record<ConditionId, Strength | Strength[]>>;
  /** No suggestion may be stronger than this. */
  maxStrength?: Strength;
  flags?: Partial<Record<ConditionId, SuggestionFlagType[]>>;
  noFlags?: Partial<Record<ConditionId, SuggestionFlagType[]>>;
  /** Pairs that must carry comorbidity notes naming each other. */
  comorbid?: [ConditionId, ConditionId][];
  matched?: string[];
  notMatched?: string[];
  negated?: string[];
  /** Exact set of red-flag types (sorted). Defaults to none. */
  redFlags?: RedFlagType[];
}

interface Vignette {
  name: string;
  text: string;
  toggles?: Toggles;
  expect: Expectation;
}

const DEFAULTS: Omit<ScoringInput, "symptomIds"> = {
  duration: "unknown",
  impairment: "yes",
  substancePossible: "no",
  medicalPossible: "no",
};

interface Analysis {
  scrub: ScrubResult;
  match: MatchResult;
  input: ScoringInput;
  result: ScoringResult;
}

function analyze(text: string, toggles: Toggles = {}): Analysis {
  const scrub = scrubPHI(text);
  const match = matchSymptoms(scrub.clean, lexicon.symptoms);
  const input: ScoringInput = { ...DEFAULTS, ...toggles, symptomIds: match.matches.map((m) => m.symptomId) };
  return { scrub, match, input, result: scoreConditions(input, conditions, lexicon.symptoms) };
}

const RANK: Record<Strength, number> = { possible: 0, moderate: 1, strong: 2 };
const ids = (list: { symptomId: string }[]) => list.map((m) => m.symptomId);
const suggestion = (r: ScoringResult, id: string) => r.suggestions.find((s) => s.conditionId === id);

const VIGNETTES: Vignette[] = [
  /* ------------------------------------------------------------- panic disorder */
  {
    name: "classic panic disorder: unexpected attacks, fear of dying, worry about the next attack",
    text:
      "34 yo F reports sudden panic attacks that come out of nowhere, 2-3x/week for the past 4 months. During attacks her heart races, she can't breathe, sweats and shakes, and she thought she was dying. Now constantly worried about the next attack and has stopped going to the gym so her heart won't race.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["panic-disorder"],
      strength: { "panic-disorder": "strong" },
      excludes: ["ptsd", "generalized-anxiety-disorder"],
      matched: [
        "panic-attacks-unexpected",
        "persistent-concern-future-attacks",
        "behavior-change-avoid-attacks",
        "fear-of-dying",
        "palpitations",
        "shortness-of-breath",
      ],
      noFlags: { "panic-disorder": ["partial-core", "duration", "substance", "medical", "breadth"] },
    },
  },
  {
    name: "panic + agoraphobia: both suggested with a comorbidity note",
    text:
      "Recurrent unexpected panic attacks for about a year; terrified of having another one. Now she can't leave the house alone, avoids buses and the mall, and only goes out with her husband. Afraid she won't be able to get out or get help if she panics.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      includes: ["panic-disorder", "agoraphobia"],
      strength: { "panic-disorder": ["moderate", "strong"], agoraphobia: ["moderate", "strong"] },
      comorbid: [["panic-disorder", "agoraphobia"]],
      matched: [
        "avoid-leaving-home-alone",
        "avoid-public-transport",
        "avoid-enclosed-spaces",
        "needs-companion",
        "fear-escape-help-unavailable",
      ],
    },
  },
  {
    name: "catastrophic misinterpretations after an attack ('heart attack', 'going crazy')",
    text:
      "Had a panic attack in the car last month. Thought I was having a heart attack and went to the ER, cardiac workup was negative. Now I'm scared I'm going crazy and keep worrying it will happen again.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["panic-disorder"],
      strength: { "panic-disorder": "moderate" },
      matched: ["fear-of-dying", "fear-losing-control", "persistent-concern-future-attacks"],
    },
  },
  {
    name: "catastrophic thoughts without any attack described: no forced match",
    text: "Thought i was having a heart attack. Scared im going crazy.",
    expect: { status: "insufficient", matched: ["fear-of-dying", "fear-losing-control"] },
  },
  {
    name: "panic with heavy caffeine use: substance flag, lower score",
    text:
      "Reports panic attacks out of the blue at work with racing heart, shaky hands and sweating. Worried about having another one. Drinks 6-8 cups of coffee and two energy drinks a day.",
    toggles: { duration: "1to6m", substancePossible: "yes" },
    expect: {
      status: "ok",
      top: ["panic-disorder"],
      maxStrength: "moderate",
      flags: { "panic-disorder": ["substance"] },
      noFlags: { "panic-disorder": ["medical"] },
    },
  },
  {
    name: "panic-like episodes with a possible thyroid cause: medical flag, lower score",
    text:
      "Episodes of sudden terror with palpitations, tremor and sweating, worried about the next attack. Heat intolerance and weight loss; labs pending for thyroid.",
    toggles: { duration: "1to6m", medicalPossible: "yes" },
    expect: {
      status: "ok",
      top: ["panic-disorder"],
      maxStrength: "moderate",
      flags: { "panic-disorder": ["medical"] },
      noFlags: { "panic-disorder": ["substance"] },
    },
  },
  {
    name: "client slang and spelling variants describing panic",
    text:
      "honestly i just cant breath when it happens, heart going crazy, feel like im gonna die, it just comes out of nowhere. scared itll happen again so i dont go to the gym no more",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["panic-disorder"],
      strength: { "panic-disorder": ["moderate", "strong"] },
      matched: [
        "shortness-of-breath",
        "palpitations",
        "fear-of-dying",
        "panic-attacks-unexpected",
        "persistent-concern-future-attacks",
        "behavior-change-avoid-attacks",
      ],
    },
  },

  /* ------------------------------------------------------------- agoraphobia */
  {
    name: "agoraphobia from a comma-separated list of avoided situations",
    text:
      "Avoids crowds, buses, trains and the mall for over a year; needs someone with her to go to the grocery store. Afraid she will pass out in public and no one will help.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["agoraphobia"],
      strength: { agoraphobia: "moderate" },
      excludes: ["panic-disorder"],
      matched: ["avoid-crowds-lines", "avoid-public-transport", "avoid-enclosed-spaces", "needs-companion", "fear-escape-help-unavailable"],
    },
  },
  {
    name: "situational avoidance for only a few weeks: duration flag on agoraphobia",
    text: "Since the move she avoids buses and crowded stores and won't go out alone; afraid she can't get out if she feels sick.",
    toggles: { duration: "2to4w" },
    expect: {
      status: "ok",
      top: ["agoraphobia"],
      maxStrength: "possible",
      flags: { agoraphobia: ["duration"] },
    },
  },

  /* ------------------------------------------------------------- GAD */
  {
    name: "classic GAD: chronic worry about everything, hard to control, tension, sleep, irritability",
    text:
      "Client worries about everything - finances, the kids, work - for over a year. She can't shut her mind off at night, has muscle tension in her shoulders, poor sleep, and is irritable with her family. Feels on edge most days.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["generalized-anxiety-disorder"],
      strength: { "generalized-anxiety-disorder": "strong" },
      excludes: ["major-depressive-disorder", "panic-disorder"],
      matched: ["worry-excessive", "worry-hard-to-control", "muscle-tension", "insomnia", "irritability", "restlessness"],
    },
  },
  {
    name: "GAD picture without uncontrollability: possible only, partial-core flag",
    text: "Chronic worry about everything for a year, tension, poor sleep, irritable.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["generalized-anxiety-disorder"],
      strength: { "generalized-anxiety-disorder": "possible" },
      flags: { "generalized-anxiety-disorder": ["partial-core"] },
    },
  },
  {
    name: "GAD + MDD: both suggested with a comorbidity note",
    text:
      "Long history of excessive worry that is hard to control, tense and restless, trouble sleeping. Over the past month also feeling down most days, lost interest in her hobbies, feels worthless and has no energy.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      includes: ["generalized-anxiety-disorder", "major-depressive-disorder"],
      strength: { "generalized-anxiety-disorder": "strong", "major-depressive-disorder": "strong" },
      comorbid: [["generalized-anxiety-disorder", "major-depressive-disorder"]],
      matched: ["worry-excessive", "worry-hard-to-control", "depressed-mood", "anhedonia"],
    },
  },
  {
    name: "worry and tension with the key features only: held at moderate until more is documented",
    text: "Denies panic attacks or flashbacks, but reports constant worry, can't stop worrying, and muscle tension.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["generalized-anxiety-disorder"],
      strength: { "generalized-anxiety-disorder": "moderate" },
      flags: { "generalized-anxiety-disorder": ["breadth"] },
      negated: ["panic-attacks-unexpected", "flashbacks"],
      notMatched: ["panic-attacks-unexpected", "flashbacks"],
      excludes: ["panic-disorder", "ptsd"],
    },
  },

  /* ------------------------------------------------------------- MDD */
  {
    name: "classic MDD: low mood, anhedonia, early waking, appetite loss, guilt, poor concentration",
    text:
      "Feeling down, no interest in anything, waking up at 4am and can't get back to sleep, no appetite, feels guilty all the time, can't concentrate at work.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong" },
      matched: ["depressed-mood", "anhedonia", "insomnia", "appetite-change", "worthlessness-guilt", "concentration-difficulty"],
    },
  },
  {
    name: "clinician note style: 'pt reports anhedonia, low mood x 3 wks, denies si'",
    text: "pt reports anhedonia, low mood x 3 wks, denies si",
    toggles: { duration: "2to4w" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "moderate" },
      flags: { "major-depressive-disorder": ["breadth"] },
      noFlags: { "major-depressive-disorder": ["duration"] },
      negated: ["suicidal-ideation-active"],
      notMatched: ["suicidal-ideation-active"],
    },
  },
  {
    name: "low mood for only 5 days: duration flag",
    text: "Low mood and tearful for the past 5 days since an argument with her partner, not enjoying things this week.",
    toggles: { duration: "lt2w" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      maxStrength: "moderate",
      flags: { "major-depressive-disorder": ["duration"] },
      matched: ["depressed-mood", "anhedonia"],
    },
  },
  {
    name: "MDD with passive death wish: suicidality red flag, active SI negated",
    text:
      "Depressed for 2 months, lost interest in everything, sleeping all day, eating more, feels like a burden. Denies active SI but endorses passive death wish, no plan or intent.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong" },
      redFlags: ["suicidality"],
      matched: ["passive-death-wish", "hypersomnia", "appetite-change", "worthlessness-guilt"],
      negated: ["suicidal-ideation-active"],
    },
  },
  {
    name: "depression in client slang",
    text: "been in a funk for like a month, no motivation, cant be bothered with anything, sleeping all day, feel like a failure, cant focus",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong" },
      matched: ["depressed-mood", "anhedonia", "hypersomnia", "worthlessness-guilt", "concentration-difficulty"],
    },
  },

  /* ------------------------------------------------------------- PTSD */
  {
    name: "classic PTSD: assault 6 months ago, nightmares, flashbacks, avoidance, jumpy, hypervigilant, self-blame",
    text:
      "Assaulted 6 months ago. Nightmares most nights, flashbacks, avoids the area where it happened, jumpy, always on guard. Blames herself and feels numb.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["ptsd"],
      strength: { ptsd: "strong" },
      matched: ["traumatic-event-exposure", "nightmares", "flashbacks", "avoidance-trauma-reminders", "startle", "hypervigilance"],
    },
  },
  {
    name: "PTSD without the mood/cognition features documented: moderate",
    text: "assaulted 6 months ago. nightmares most nights, flashbacks, avoids the area where it happened, jumpy, always on guard",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["ptsd"], strength: { ptsd: "moderate" } },
  },
  {
    name: "trauma symptoms 2 weeks after the event: duration flag (acute stress reaction territory)",
    text: "Car accident 2 weeks ago. Since the accident she has nightmares, flashbacks, won't drive, and is jumpy and on guard.",
    toggles: { duration: "2to4w" },
    expect: {
      status: "ok",
      top: ["ptsd"],
      maxStrength: "possible",
      flags: { ptsd: ["duration"] },
    },
  },
  {
    name: "PTSD in client slang and spelling variants",
    text: "since the mva i get flash backs and night mares, cant stop thinking about the accident, wont drive, super jumpy",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["ptsd"],
      strength: { ptsd: "moderate" },
      matched: ["traumatic-event-exposure", "flashbacks", "nightmares", "intrusive-memories", "avoidance-trauma-reminders", "startle"],
    },
  },

  /* ------------------------------------------------------------- negation */
  {
    name: "negation only: 'denies panic attacks, no nightmares, denies SI/HI'",
    text: "Denies panic attacks. No nightmares. Denies SI/HI. No history of trauma.",
    expect: {
      status: "empty",
      negated: ["panic-attacks-unexpected", "nightmares", "suicidal-ideation-active", "traumatic-event-exposure"],
    },
  },

  /* ------------------------------------------------------------- red flags */
  {
    name: "red flags: passive death wish, voices, no sleep with high energy, withdrawal shakes",
    text:
      "Pt states she sometimes wishes she wouldn't wake up. Hearing voices at night. Hasn't slept in 3 days but full of energy. Gets the shakes when stopping drinking.",
    expect: {
      status: "insufficient",
      redFlags: ["mania", "psychosis", "suicidality", "withdrawal"],
      matched: ["passive-death-wish", "hallucinations", "decreased-need-for-sleep", "alcohol-benzo-withdrawal"],
    },
  },
  {
    name: "self-harm red flag without false positives from everyday wording",
    text: "Cut back on coffee and kept busy. She cuts herself on her arms when overwhelmed.",
    expect: { status: "insufficient", redFlags: ["suicidality"], matched: ["self-harm"] },
  },
  {
    name: "homicidal thoughts flagged; SI negated",
    text: "Endorses thoughts of hurting her ex-partner; denies plan or intent. Denies SI.",
    expect: { status: "insufficient", redFlags: ["homicidality"], negated: ["suicidal-ideation-active"] },
  },
  {
    name: "eating-disorder medical warning signs",
    text: "Restricting to 500 calories a day, lost 20 lb in two months, fainted at work twice.",
    expect: { status: "insufficient", redFlags: ["eating-disorder-medical"], matched: ["severe-food-restriction", "purging-or-fainting"] },
  },
  {
    name: "mania signs on their own: red flag, no forced match",
    text: "Talking a mile a minute, spending sprees, only sleeps 2 hours a night and feels rested.",
    expect: { status: "insufficient", redFlags: ["mania"], matched: ["grandiosity-elevated-mood", "decreased-need-for-sleep"] },
  },
  {
    name: "alcohol withdrawal signs: withdrawal red flag",
    text: "Drinks a fifth daily; gets tremors and sweats when she stops drinking, history of withdrawal seizures.",
    expect: { status: "insufficient", redFlags: ["withdrawal"], matched: ["alcohol-benzo-withdrawal"] },
  },

  /* ------------------------------------------------------------- insufficient / out of scope */
  {
    name: "vague stress: insufficient, no forced match",
    text: "Feels stressed. Trouble at work.",
    expect: { status: "insufficient", matched: ["subjective-anxiety-stress"] },
  },
  {
    name: "vague stress, tiredness and sleep complaints: insufficient",
    text: "Feeling stressed and tired lately, trouble at work, not sleeping well.",
    expect: { status: "insufficient", matched: ["subjective-anxiety-stress", "fatigue", "insomnia"] },
  },
  {
    name: "OCD-like checking (out of scope): low strength only",
    text:
      "Checks the stove 20 times before leaving and washes hands until raw. Gets anxious if she can't finish the ritual and can't stop thinking about germs.",
    expect: { status: "ok", maxStrength: "possible", excludes: ["panic-disorder", "agoraphobia", "ptsd", "major-depressive-disorder"] },
  },
  {
    name: "social fear of judgment (out of scope): insufficient",
    text: "Afraid people will judge her, avoids parties and speaking up in meetings, blushes and gets sweaty when talking to people.",
    expect: { status: "insufficient" },
  },
  {
    name: "racing mind at night with poor sleep: GAD possible only",
    text: "Mind racing at night, can't sleep, tired during the day.",
    expect: {
      status: "ok",
      top: ["generalized-anxiety-disorder"],
      maxStrength: "possible",
      flags: { "generalized-anxiety-disorder": ["partial-core"] },
    },
  },
  {
    name: "everyday wording that must not match anything",
    text:
      "Follow up in 2 weeks. After the session she felt better. My back hurts. I'm starving after work. Took the bus to the appointment. Being followed up by her PCP.",
    expect: { status: "empty" },
  },

  /* ------------------------------------------------------------- PHI first */
  {
    name: "identifiers are scrubbed before matching and do not change the result",
    text:
      "Patient: Jane Smith, DOB 03/14/1988, MRN 4471923, cell 555-201-7788, email jane.smith@example.com. Reports feeling down most days for 2 months, lost interest in everything, no appetite, feels worthless, can't concentrate, sleeping too much.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong" },
    },
  },
];

describe("clinical vignettes (real content)", () => {
  it("has at least 25 vignettes", () => {
    expect(VIGNETTES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(VIGNETTES.map((v) => v.name)).size).toBe(VIGNETTES.length);
  });

  it.each(VIGNETTES)("$name", ({ text, toggles, expect: e }) => {
    const { match, result } = analyze(text, toggles);
    const matchedIds = ids(match.matches);
    const shown = result.suggestions.map((s) => s.conditionId);

    expect(result.status).toBe(e.status);
    if (e.status !== "ok") expect(result.suggestions).toEqual([]);
    if (e.top) expect(shown.slice(0, e.top.length)).toEqual(e.top);
    for (const id of e.includes ?? []) expect(shown).toContain(id);
    for (const id of e.excludes ?? []) expect(shown).not.toContain(id);

    for (const [id, want] of Object.entries(e.strength ?? {})) {
      const s = suggestion(result, id);
      expect(s, `${id} suggested`).toBeDefined();
      const allowed = Array.isArray(want) ? want : [want];
      expect(allowed, `${id} strength ${s?.strength} (score ${s?.score})`).toContain(s?.strength);
    }
    if (e.maxStrength) {
      const cap = RANK[e.maxStrength];
      for (const s of result.suggestions) expect(RANK[s.strength], `${s.conditionId} is ${s.strength}`).toBeLessThanOrEqual(cap);
    }

    for (const [id, types] of Object.entries(e.flags ?? {})) {
      const got = (suggestion(result, id)?.flags ?? []).map((f) => f.type);
      for (const t of types) expect(got, `${id} flags`).toContain(t);
    }
    for (const [id, types] of Object.entries(e.noFlags ?? {})) {
      const got = (suggestion(result, id)?.flags ?? []).map((f) => f.type);
      for (const t of types) expect(got, `${id} flags`).not.toContain(t);
    }

    for (const [a, b] of e.comorbid ?? []) {
      const sa = suggestion(result, a);
      const sb = suggestion(result, b);
      expect(sa?.comorbidityNotes.some((n) => n.startsWith(`${sb?.name} is also suggested`))).toBe(true);
      expect(sb?.comorbidityNotes.some((n) => n.startsWith(`${sa?.name} is also suggested`))).toBe(true);
    }

    for (const id of e.matched ?? []) expect(matchedIds, `matched ${id}`).toContain(id);
    for (const id of e.notMatched ?? []) expect(matchedIds, `not matched ${id}`).not.toContain(id);
    for (const id of e.negated ?? []) expect(ids(match.negated), `negated ${id}`).toContain(id);

    const flagTypes = [...new Set(result.redFlags.map((f) => f.type))].sort();
    expect(flagTypes).toEqual(e.redFlags ?? []);
  });
});

describe("vignettes: properties that hold across every case", () => {
  const BANNED = /\b(diagnosed|diagnosis is|meets|confirmed|definitely|certainly)\b/i;

  it.each(VIGNETTES)("never states a diagnosis and always explains itself: $name", ({ text, toggles }) => {
    const { result } = analyze(text, toggles);
    if (result.message) expect(result.message).not.toMatch(BANNED);
    for (const s of result.suggestions) {
      expect(s.matched.length).toBeGreaterThan(0);
      expect(s.matched.some((m) => m.kind === "core")).toBe(true);
      expect(s.dsmPointer).toContain("See DSM-5-TR");
      expect(s.icd10cm.length).toBeGreaterThan(0);
      expect(s.icd11.length).toBeGreaterThan(0);
      for (const t of [...s.flags.map((f) => f.message), ...s.comorbidityNotes]) expect(t).not.toMatch(BANNED);
      if (s.strength === "strong") expect(s.matched.length).toBeGreaterThanOrEqual(4);
    }
  });

  it.each(VIGNETTES)("is deterministic and order-independent: $name", ({ text, toggles }) => {
    const a = analyze(text, toggles);
    const shuffled = scoreConditions(
      { ...a.input, symptomIds: [...a.input.symptomIds].reverse() },
      [...conditions].reverse(),
      lexicon.symptoms,
    );
    expect(shuffled).toEqual(a.result);
    expect(analyze(text, toggles).result).toEqual(a.result);
  });

  it("never lets a negated symptom count toward a suggestion", () => {
    for (const v of VIGNETTES) {
      const { match, result } = analyze(v.text, v.toggles);
      const negated = new Set(ids(match.negated));
      for (const s of result.suggestions) for (const m of s.matched) expect(negated.has(m.symptomId), `${v.name}: ${m.symptomId}`).toBe(false);
    }
  });
});

describe("vignettes: gates lower the score and say why", () => {
  const PANIC =
    "Reports panic attacks out of the blue at work with racing heart, shaky hands and sweating. Worried about having another one.";

  const panicScore = (t: Toggles) => suggestion(analyze(PANIC, { duration: "1to6m", ...t }).result, "panic-disorder");

  it("heavy caffeine (substance possible) lowers the panic score and lists caffeine as a rule-out", () => {
    const base = panicScore({});
    const withCaffeine = panicScore({ substancePossible: "yes" });
    expect(base && withCaffeine).toBeTruthy();
    expect(withCaffeine?.score).toBeLessThan(base?.score ?? 0);
    const msg = withCaffeine?.flags.find((f) => f.type === "substance")?.message ?? "";
    expect(msg).toMatch(/caffeine/i);
    expect(msg).toMatch(/score reduced/);
  });

  it("a possible medical cause lowers the panic score and lists thyroid and cardiac rule-outs", () => {
    const base = panicScore({});
    const medical = panicScore({ medicalPossible: "yes" });
    expect(medical?.score).toBeLessThan(base?.score ?? 0);
    const msg = medical?.flags.find((f) => f.type === "medical")?.message ?? "";
    expect(msg).toMatch(/hyperthyroidism/i);
    expect(msg).toMatch(/cardiac|heart/i);
  });

  it("a short duration lowers the score and points to the duration note", () => {
    const long = suggestion(analyze("pt reports anhedonia, low mood, no energy, cant sleep, feels worthless", { duration: "1to6m" }).result, "major-depressive-disorder");
    const short = suggestion(analyze("pt reports anhedonia, low mood, no energy, cant sleep, feels worthless", { duration: "lt2w" }).result, "major-depressive-disorder");
    expect(short?.score).toBeLessThan(long?.score ?? 0);
    expect(short?.flags.find((f) => f.type === "duration")?.message).toMatch(/shorter than this pattern usually requires/);
  });

  it("no distress or impairment lowers the score", () => {
    const yes = panicScore({ impairment: "yes" });
    const no = panicScore({ impairment: "no" });
    expect(no?.score).toBeLessThan(yes?.score ?? 0);
    expect(no?.flags.map((f) => f.type)).toContain("impairment");
  });
});

describe("vignettes: PHI is scrubbed first", () => {
  it("removes planted identifiers before matching", () => {
    const v = VIGNETTES.find((x) => x.name.startsWith("identifiers are scrubbed"));
    expect(v).toBeDefined();
    const { scrub } = analyze(v?.text ?? "", v?.toggles);
    const types = new Set(scrub.findings.map((f) => f.type));
    for (const t of ["NAME", "DATE", "MRN", "PHONE", "EMAIL"] as const) expect(types.has(t), t).toBe(true);
    for (const leaked of ["Jane", "Smith", "4471923", "555-201-7788", "jane.smith@example.com", "03/14/1988"])
      expect(scrub.clean).not.toContain(leaked);
  });

  it("gives the same suggestions with or without the identifiers", () => {
    const clinical =
      "Reports feeling down most days for 2 months, lost interest in everything, no appetite, feels worthless, can't concentrate, sleeping too much.";
    const withIds = analyze(`Patient: Jane Smith, DOB 03/14/1988, MRN 4471923. ${clinical}`, { duration: "1to6m" }).result;
    const without = analyze(clinical, { duration: "1to6m" }).result;
    expect(withIds.suggestions.map((s) => [s.conditionId, s.score])).toEqual(without.suggestions.map((s) => [s.conditionId, s.score]));
  });
});

describe("phrase-level behavior on the real lexicon", () => {
  it.each([
    // Word-for-word phrases: never collapse into one generic word.
    ["During attacks her heart races.", ["palpitations"], []],
    ["She was attacked last year.", ["traumatic-event-exposure"], []],
    ["The edge of the bed.", [], []],
    ["Feels on edge.", ["restlessness"], []],
    ["Lost it at work.", [], []],
    ["Afraid of losing it in public.", ["fear-losing-control"], []],
    ["Gets the shakes in the morning.", ["alcohol-benzo-withdrawal"], []],
    ["Shaking hands.", ["trembling"], []],
    // Reflexive pronouns: "cut myself" ~ "cuts himself", but never "cut back".
    ["He cuts himself when upset.", ["self-harm"], []],
    ["Cut back on coffee.", [], []],
    ["Keeps thinking he wants to kill himself.", ["suicidal-ideation-active"], []],
    // Third-person and contracted forms.
    ["Doesn't enjoy anything anymore.", ["anhedonia"], []],
    ["She only goes out with her husband.", ["needs-companion"], []],
    // Gap patterns: lists across commas, no crossing a sentence or a contrast word.
    ["Avoids buses, trains, and the mall.", ["avoid-public-transport", "avoid-enclosed-spaces"], []],
    ["Avoids alcohol. Takes the bus to work.", [], []],
    ["Avoids crowds but takes the bus every day.", ["avoid-crowds-lines"], []],
    ["Pt is not afraid of elevators.", [], ["avoid-enclosed-spaces"]],
    // Non-consuming: one mention supports situational panic AND dread of the place.
    ["Panic attacks in stores.", ["panic-attack-cued", "avoid-enclosed-spaces"], []],
    // Safety-relevant near-collisions stay apart.
    ["Has thoughts of dying.", ["passive-death-wish"], []],
    ["Thought she was dying during the attack.", ["fear-of-dying"], []],
  ] as [string, string[], string[]][])("%s", (text, positive, negated) => {
    const m = matchSymptoms(text, lexicon.symptoms);
    expect(ids(m.matches)).toEqual(positive);
    expect(ids(m.negated)).toEqual(negated);
  });
});
