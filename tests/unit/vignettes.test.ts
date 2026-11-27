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
import { conditions, getCondition, lexicon } from "@/lib/content";
import { matchSymptoms, type MatchResult } from "@/lib/matcher";
import { scrubPHI } from "@/lib/phi-scrubber";
import type { RedFlagType } from "@/lib/schemas";
import { scoreConditions } from "@/lib/scoring";
import type { ScoringInput, ScoringResult, ScrubResult, Suggestion, SuggestionFlagType } from "@/lib/types";

type Toggles = Partial<Omit<ScoringInput, "symptomIds">>;
type Strength = Suggestion["strength"];
type ConditionId =
  | "panic-disorder"
  | "agoraphobia"
  | "generalized-anxiety-disorder"
  | "major-depressive-disorder"
  | "ptsd"
  | "social-anxiety-disorder"
  | "obsessive-compulsive-disorder"
  | "alcohol-use-disorder"
  | "insomnia-disorder"
  | "persistent-depressive-disorder"
  | "adjustment-disorder"
  | "prolonged-grief-disorder"
  | "specific-phobia"
  | "bipolar-i-disorder"
  | "bipolar-ii-disorder"
  | "cyclothymic-disorder"
  | "adult-adhd"
  | "borderline-personality-disorder"
  | "anorexia-nervosa"
  | "bulimia-nervosa"
  | "binge-eating-disorder"
  | "schizophrenia"
  | "illness-anxiety-disorder"
  | "somatic-symptom-disorder"
  | "hoarding-disorder"
  | "body-dysmorphic-disorder"
  | "cannabis-use-disorder"
  | "opioid-use-disorder"
  | "stimulant-use-disorder"
  | "acute-stress-disorder"
  | "sedative-hypnotic-use-disorder"
  | "gambling-disorder"
  | "tobacco-use-disorder"
  | "body-focused-repetitive-behaviors"
  | "premenstrual-dysphoric-disorder";

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
  /**
   * A substance-use suggestion is shown, so the 42 CFR Part 2 banner and export notice apply (G6).
   * Defaults to false: no other vignette may surface a substance-use condition.
   */
  part2?: boolean;
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
      negated: ["panic-attacks-unspecified", "flashbacks"],
      notMatched: ["panic-attacks-unexpected", "panic-attacks-unspecified", "flashbacks"],
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
    name: "trauma symptoms 2 weeks after the event: the acute stress pattern leads, PTSD carries the duration flag",
    text: "Car accident 2 weeks ago. Since the accident she has nightmares, flashbacks, won't drive, and is jumpy and on guard.",
    toggles: { duration: "2to4w" },
    expect: {
      status: "ok",
      top: ["acute-stress-disorder", "ptsd"],
      strength: { "acute-stress-disorder": "strong", ptsd: "possible" },
      flags: { ptsd: ["duration"] },
      matched: ["recent-trauma-past-month"],
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
      negated: ["panic-attacks-unspecified", "nightmares", "suicidal-ideation-active", "traumatic-event-exposure"],
    },
  },

  /* ------------------------------------------------------------- red flags */
  {
    name: "red flags: passive death wish, voices, no sleep with high energy, withdrawal shakes",
    text:
      "Pt states she sometimes wishes she wouldn't wake up. Hearing voices at night. Hasn't slept in 3 days but full of energy. Gets the shakes when stopping drinking.",
    expect: {
      // Each red flag touches a pattern (psychosis, bipolar), but one sign each is a thin picture: possible only.
      status: "ok",
      maxStrength: "possible",
      excludes: ["alcohol-use-disorder"],
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
    name: "eating-disorder medical warning signs: red flag, eating patterns held at possible",
    text: "Restricting to 500 calories a day, lost 20 lb in two months, fainted at work twice.",
    expect: {
      status: "ok",
      top: ["anorexia-nervosa"],
      maxStrength: "possible",
      flags: { "anorexia-nervosa": ["partial-core", "red-flag"] },
      redFlags: ["eating-disorder-medical"],
      matched: ["severe-food-restriction", "purging-or-fainting"],
    },
  },
  {
    name: "mania signs on their own: red flag, bipolar patterns held at moderate on a thin picture",
    text: "Talking a mile a minute, spending sprees, only sleeps 2 hours a night and feels rested.",
    expect: {
      status: "ok",
      top: ["bipolar-i-disorder"],
      includes: ["bipolar-ii-disorder"],
      maxStrength: "moderate",
      flags: { "bipolar-i-disorder": ["breadth"], "bipolar-ii-disorder": ["required"] },
      redFlags: ["mania"],
      matched: ["grandiosity-elevated-mood", "decreased-need-for-sleep"],
    },
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
  // These two were out of scope (5 conditions) and expected "possible" / "insufficient". OCD and social anxiety
  // are now in the knowledge base, so the same text suggests them, still held at moderate on a thin picture.
  {
    name: "OCD checking and washing with contamination thoughts: OCD only, held at moderate (few supporting features)",
    text:
      "Checks the stove 20 times before leaving and washes hands until raw. Gets anxious if she can't finish the ritual and can't stop thinking about germs.",
    expect: {
      status: "ok",
      top: ["obsessive-compulsive-disorder"],
      strength: { "obsessive-compulsive-disorder": "moderate" },
      flags: { "obsessive-compulsive-disorder": ["breadth"] },
      excludes: ["panic-disorder", "agoraphobia", "ptsd", "major-depressive-disorder", "generalized-anxiety-disorder"],
      matched: ["obsessions", "compulsions"],
      notMatched: ["worry-hard-to-control"],
    },
  },
  {
    name: "social fear of judgment with avoidance and blushing: social anxiety, held at moderate",
    text: "Afraid people will judge her, avoids parties and speaking up in meetings, blushes and gets sweaty when talking to people.",
    expect: {
      status: "ok",
      top: ["social-anxiety-disorder"],
      strength: { "social-anxiety-disorder": "moderate" },
      flags: { "social-anxiety-disorder": ["breadth", "duration"] },
      excludes: ["agoraphobia", "panic-disorder", "generalized-anxiety-disorder", "major-depressive-disorder"],
      matched: ["fear-social-scrutiny", "social-situation-avoidance", "blushing", "sweating"],
    },
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

  /* ------------------------------------------------------------- social anxiety disorder */
  {
    name: "classic social anxiety: fear of judgment, avoidance, blushing, shaking, post-event replay",
    text:
      "Since college she has been terrified of being judged. She avoids parties and work meetings, never speaks up in class, blushes and her hands shake when talking to people, and replays conversations for days afterwards.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["social-anxiety-disorder"],
      strength: { "social-anxiety-disorder": "strong" },
      excludes: ["agoraphobia", "panic-disorder", "generalized-anxiety-disorder"],
      matched: ["fear-social-scrutiny", "social-situation-avoidance", "blushing", "trembling", "post-event-rumination"],
      noFlags: { "social-anxiety-disorder": ["breadth", "duration", "partial-core"] },
    },
  },
  {
    name: "hard case, agoraphobia not social anxiety: avoidance driven by fear of panic and no escape, judgment denied",
    text:
      "Avoids crowds, buses and the mall because she is afraid she will have a panic attack and cannot get out; only goes out with her husband. Not worried about what people think of her.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["agoraphobia"],
      excludes: ["social-anxiety-disorder", "specific-phobia"],
      negated: ["fear-social-scrutiny"],
      notMatched: ["fear-social-scrutiny"],
      matched: ["fear-escape-help-unavailable", "needs-companion"],
    },
  },
  {
    name: "hard case, social anxiety AND agoraphobia: two reasons for avoidance, both suggested with a comorbidity note",
    text:
      "Avoids work events and phone calls because she is afraid of saying something stupid, rehearses what to say and avoids eye contact. Also avoids buses and crowded stores, afraid she cannot escape if she panics.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["social-anxiety-disorder", "agoraphobia"],
      strength: { "social-anxiety-disorder": "moderate", agoraphobia: "moderate" },
      comorbid: [["social-anxiety-disorder", "agoraphobia"]],
      matched: ["social-safety-behaviors", "fear-escape-help-unavailable", "avoid-public-transport"],
    },
  },
  {
    name: "social anxiety with a depressive episode on top: both suggested, comorbidity note",
    text:
      "Terrified of being judged for years; avoids social events and dating and replays every conversation afterwards. Over the past month she has been feeling down most days, lost interest in everything, has no energy, feels worthless and can't concentrate.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      includes: ["social-anxiety-disorder", "major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong", "social-anxiety-disorder": "moderate" },
      comorbid: [["social-anxiety-disorder", "major-depressive-disorder"]],
    },
  },

  /* ------------------------------------------------------------- OCD */
  {
    name: "classic contamination OCD: obsessions, washing, avoidance, reassurance seeking, time lost",
    text:
      "Intrusive thoughts about germs and contamination for two years. Washes her hands 50 times a day, avoids public restrooms, won't touch door handles, asks her husband for reassurance over and over, and rituals make her late for work.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["obsessive-compulsive-disorder"],
      strength: { "obsessive-compulsive-disorder": "strong" },
      excludes: ["generalized-anxiety-disorder", "specific-phobia", "ptsd"],
      matched: ["obsessions", "compulsions", "ocd-trigger-avoidance", "reassurance-seeking", "time-consuming-rituals"],
    },
  },
  {
    name: "hard case, GAD not OCD: realistic everyday worries, rituals denied",
    text:
      "Worries about everything - money, her kids' health, her job - and can't stop worrying. Tense, restless, poor sleep, irritable. No rituals or checking, the worries feel like realistic everyday concerns.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["generalized-anxiety-disorder"],
      strength: { "generalized-anxiety-disorder": "strong" },
      excludes: ["obsessive-compulsive-disorder"],
      negated: ["compulsions"],
      notMatched: ["compulsions", "obsessions"],
    },
  },
  {
    name: "hard case, OCD checking plus everyday worry: OCD leads, GAD possible only",
    text:
      "Constant worry that she left the stove on or the door unlocked; checks the locks over and over, takes hours to leave the house, also worries a lot about finances and her health, muscle tension.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["obsessive-compulsive-disorder"],
      strength: { "obsessive-compulsive-disorder": "moderate", "generalized-anxiety-disorder": "possible" },
      flags: { "generalized-anxiety-disorder": ["partial-core"] },
      matched: ["obsessions", "compulsions", "time-consuming-rituals", "worry-excessive"],
    },
  },
  {
    name: "harm obsessions: OCD suggested AND the homicidality red flag stays visible (the app never decides risk)",
    text:
      "Unwanted intrusive thoughts of harming her baby that horrify her; she hides the knives, won't be alone with the baby and asks her partner for reassurance. Afraid the thought means she wants to do it.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["obsessive-compulsive-disorder"],
      strength: { "obsessive-compulsive-disorder": "moderate" },
      flags: { "obsessive-compulsive-disorder": ["red-flag"] },
      matched: ["homicidal-ideation", "obsessions", "ocd-trigger-avoidance", "ocd-appraisals"],
      redFlags: ["homicidality"],
    },
  },
  {
    name: "scrupulosity: religious obsessions with prayer and confession rituals",
    text:
      "Scrupulosity: afraid of committing a sin, repeats prayers until they feel right, confesses over and over and spends hours on mental rituals. Her faith used to bring her peace.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["obsessive-compulsive-disorder"],
      strength: { "obsessive-compulsive-disorder": ["moderate", "strong"] },
      matched: ["obsessions", "compulsions", "time-consuming-rituals"],
    },
  },

  /* ------------------------------------------------------------- alcohol use disorder (Part 2) */
  {
    name: "AUD with withdrawal: strong match, withdrawal red flag and medical caution, Part 2 applies",
    text:
      "Drinking more than he intended most nights for the past year, tried to cut down on drinking several times without success, strong urges to drink after work, missed work because of hangovers, and keeps drinking despite his doctor's warning about his liver. Gets the shakes in the morning and needs a drink to stop shaking.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["alcohol-use-disorder"],
      strength: { "alcohol-use-disorder": "strong" },
      flags: { "alcohol-use-disorder": ["red-flag", "substance"] },
      matched: [
        "impaired-control-drinking",
        "unsuccessful-cut-down",
        "alcohol-craving",
        "drinking-role-impact",
        "drinking-despite-harm",
        "alcohol-benzo-withdrawal",
      ],
      redFlags: ["withdrawal"],
      part2: true,
    },
  },
  {
    name: "AUD without withdrawal: loss of control, failed cut-down, tolerance, drunk driving",
    text: "Binge drinks on weekends, got a DUI last month, can't stop once she starts drinking, wants to cut back on drinking, needs more to get drunk than before.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["alcohol-use-disorder"],
      strength: { "alcohol-use-disorder": "moderate" },
      matched: ["hazardous-drinking", "impaired-control-drinking", "unsuccessful-cut-down", "alcohol-tolerance"],
      part2: true,
    },
  },
  {
    name: "AUD with a depressive episode and a passive death wish: both suggested, suicidality red flag",
    text:
      "Drinking more than she planned most nights, tried to quit drinking twice, cravings for alcohol every afternoon. Down most days, lost interest in everything, feels worthless and sometimes wishes she wouldn't wake up.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      includes: ["alcohol-use-disorder", "major-depressive-disorder"],
      strength: { "alcohol-use-disorder": "moderate" },
      flags: { "alcohol-use-disorder": ["red-flag"] },
      comorbid: [["alcohol-use-disorder", "major-depressive-disorder"]],
      matched: ["passive-death-wish"],
      redFlags: ["suicidality"],
      part2: true,
    },
  },
  {
    name: "AUD and an adjustment reaction after a divorce: both moderate, comorbidity note",
    text:
      "Since the divorce he drinks every night, can't stop after one drink, has strong urges to drink in the evening and keeps drinking despite his doctor's warning. Can't stop thinking about the divorce and is struggling to cope.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      includes: ["adjustment-disorder", "alcohol-use-disorder"],
      strength: { "adjustment-disorder": "moderate", "alcohol-use-disorder": "moderate" },
      comorbid: [["adjustment-disorder", "alcohol-use-disorder"]],
      matched: ["identifiable-stressor", "stressor-preoccupation", "impaired-control-drinking", "alcohol-craving"],
      notMatched: ["worry-hard-to-control"],
      part2: true,
    },
  },
  {
    name: "low-risk drinking with loss of control denied: nothing to suggest, no Part 2 content",
    text: "Drinks 2 glasses of wine with dinner on weekends, no problems, never drinks more than she planned, denies cravings for alcohol.",
    expect: { status: "empty", negated: ["impaired-control-drinking", "alcohol-craving"] },
  },

  /* ------------------------------------------------------------- insomnia disorder */
  {
    name: "primary insomnia: chronic, sleep-focused worry and clock watching, napping, daytime fallout, mood fine",
    text:
      "Trouble falling asleep most nights for two years; lies awake for hours, watches the clock, dreads going to bed, naps to catch up on sleep, and is exhausted at work from not sleeping. Mood is fine and she still enjoys her hobbies.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["insomnia-disorder"],
      strength: { "insomnia-disorder": "strong" },
      excludes: ["major-depressive-disorder", "generalized-anxiety-disorder"],
      matched: ["insomnia", "insomnia-chronicity", "sleep-related-arousal", "sleep-compensatory-behaviors", "poor-sleep-daytime-impact"],
    },
  },
  {
    name: "hard case, insomnia as one symptom of depression: MDD only, no insomnia-disorder suggestion",
    text:
      "Waking up at 4am and can't get back to sleep for the past month, feeling down most days, lost interest in everything, no appetite, feels worthless, can't concentrate.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong" },
      excludes: ["insomnia-disorder", "persistent-depressive-disorder"],
      matched: ["insomnia"],
    },
  },
  {
    name: "hard case, insomnia disorder AND a depressive episode: both suggested, comorbidity note",
    text:
      "Insomnia most nights for a year, worries about not sleeping and is exhausted from poor sleep. For the past month she also feels depressed, has no interest in anything and feels worthless.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      includes: ["insomnia-disorder", "major-depressive-disorder"],
      comorbid: [["insomnia-disorder", "major-depressive-disorder"]],
    },
  },
  {
    name: "insomnia with snoring and breathing pauses: medical flag lists sleep apnea",
    text:
      "Insomnia for years, wide awake as soon as she gets into bed, takes sleeping pills most nights, low energy and irritable during the day, falling asleep at work. Snoring loudly, partner notices pauses in breathing.",
    toggles: { duration: "gte6m", medicalPossible: "yes" },
    expect: {
      status: "ok",
      top: ["insomnia-disorder"],
      flags: { "insomnia-disorder": ["medical"] },
      matched: ["sleep-compensatory-behaviors", "poor-sleep-daytime-impact"],
    },
  },
  {
    name: "sleep trouble for only three weeks: duration flag (short-term insomnia territory)",
    text: "Since starting a new job three weeks ago she has trouble falling asleep most nights, worries about sleep, and is exhausted from lack of sleep.",
    toggles: { duration: "2to4w" },
    expect: {
      status: "ok",
      top: ["insomnia-disorder"],
      maxStrength: "moderate",
      flags: { "insomnia-disorder": ["duration"] },
    },
  },
  {
    name: "hard case, mania not insomnia: little sleep with high energy, red flag, no insomnia suggestion",
    text: "Hasn't slept in 3 days but full of energy, racing thoughts, spending sprees, can't sleep.",
    expect: {
      status: "ok",
      top: ["bipolar-i-disorder"],
      excludes: ["insomnia-disorder"],
      maxStrength: "moderate",
      redFlags: ["mania"],
      matched: ["decreased-need-for-sleep", "grandiosity-elevated-mood"],
    },
  },
  {
    name: "insomnia with a nightly drink to fall asleep: insomnia disorder, alcohol use disorder not suggested",
    text:
      "Drinks wine every night to fall asleep, wakes up at 3am and can't get back to sleep, trouble sleeping most nights for a year, exhausted at work from poor sleep, worries about not sleeping.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["insomnia-disorder"],
      strength: { "insomnia-disorder": "strong" },
      excludes: ["alcohol-use-disorder"],
      matched: ["sleep-compensatory-behaviors", "insomnia-chronicity"],
    },
  },

  /* ------------------------------------------------------------- persistent depressive disorder */
  {
    name: "classic PDD: low mood for as long as she can remember, low energy, low self-esteem, indecision",
    text:
      "Has felt down for as long as she can remember, since her teens. Low energy, low self-esteem, hard to make decisions, poor appetite. Still works and has never had a two-week stretch of feeling okay.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["persistent-depressive-disorder", "major-depressive-disorder"],
      strength: { "persistent-depressive-disorder": "strong", "major-depressive-disorder": "moderate" },
      comorbid: [["persistent-depressive-disorder", "major-depressive-disorder"]],
      matched: ["longstanding-low-mood", "depressed-mood", "fatigue", "worthlessness-guilt", "concentration-difficulty"],
    },
  },
  {
    name: "double depression: years of low-grade depression with a recent full episode and thoughts of death",
    text:
      "Chronic low grade depression for years, and over the past month much worse: lost interest in everything, sleeping all day, feels worthless, can't concentrate, thoughts of death.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      includes: ["persistent-depressive-disorder", "major-depressive-disorder"],
      strength: { "persistent-depressive-disorder": "strong", "major-depressive-disorder": "strong" },
      comorbid: [["persistent-depressive-disorder", "major-depressive-disorder"]],
      redFlags: ["suicidality"],
    },
  },
  {
    name: "hard case, MDD not PDD: six weeks of low mood after a setback, well before",
    text:
      "Low mood for six weeks since her promotion fell through, no interest in anything, poor sleep, feels guilty, cannot concentrate. Felt well before this.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong" },
      excludes: ["persistent-depressive-disorder"],
      notMatched: ["longstanding-low-mood"],
    },
  },
  {
    name: "hard case, years of low mood but the duration toggle says 1-6 months: PDD duration flag",
    text: "Depressed for years, low energy, low self-esteem, poor concentration, poor appetite.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["persistent-depressive-disorder"],
      maxStrength: "moderate",
      flags: { "persistent-depressive-disorder": ["duration"] },
      noFlags: { "major-depressive-disorder": ["duration"] },
    },
  },

  /* ------------------------------------------------------------- adjustment disorder */
  {
    name: "classic adjustment reaction: job loss, preoccupation, trouble adjusting, still enjoys things",
    text:
      "Lost her job three weeks ago. Since then tearful and anxious, can't stop thinking about losing her job, trouble adjusting, sleeping poorly, but still enjoys time with her kids and her usual hobbies.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["adjustment-disorder"],
      strength: { "adjustment-disorder": "strong" },
      excludes: ["persistent-depressive-disorder", "generalized-anxiety-disorder"],
      matched: ["identifiable-stressor", "stressor-preoccupation", "difficulty-adjusting", "depressed-mood"],
      notMatched: ["anhedonia", "worry-hard-to-control"],
      noFlags: { "adjustment-disorder": ["required", "partial-core"] },
    },
  },
  {
    name: "hard case, MDD not adjustment: full depressive picture after a job loss, death wish",
    text:
      "Lost his job two months ago. Since then depressed most days, lost interest in everything, sleeping all day, feels worthless, can't concentrate, no appetite, wishes he were dead.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong", "adjustment-disorder": "possible" },
      flags: { "adjustment-disorder": ["partial-core", "red-flag"] },
      redFlags: ["suicidality"],
    },
  },
  {
    name: "adjustment reaction after a breakup: preoccupation, not coping, irritable and nervous",
    text: "Since the breakup she has been struggling to cope, cant stop thinking about the breakup, irritable and nervous, missing work.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["adjustment-disorder"],
      strength: { "adjustment-disorder": ["moderate", "strong"] },
      matched: ["identifiable-stressor", "difficulty-adjusting", "stressor-preoccupation"],
    },
  },
  {
    name: "a stressor on its own: adjustment possible only, gather more",
    text: "Recently retired.",
    expect: {
      status: "ok",
      top: ["adjustment-disorder"],
      maxStrength: "possible",
      flags: { "adjustment-disorder": ["partial-core"] },
    },
  },

  /* ------------------------------------------------------------- prolonged grief disorder */
  {
    name: "classic prolonged grief: 14 months after a death, yearning, disbelief, avoidance, identity loss",
    text:
      "Her husband died 14 months ago. She yearns for him every day, can't accept that he is gone, avoids his room, feels part of her died with him, and the grief is as raw as day one. She still enjoys her grandchildren and does not feel worthless.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["prolonged-grief-disorder"],
      strength: { "prolonged-grief-disorder": "strong" },
      excludes: ["major-depressive-disorder", "ptsd"],
      matched: ["bereavement", "grief-yearning", "grief-disbelief", "grief-avoidance-reminders", "grief-identity-meaning", "grief-intense-pain"],
      negated: ["worthlessness-guilt"],
      noFlags: { "prolonged-grief-disorder": ["required"] },
    },
  },
  {
    name: "hard case, MDD not prolonged grief: pervasive depression three months after a death",
    text:
      "Her mother died three months ago. Since then she is depressed most of the day, lost interest in everything, feels worthless, sleeping all day, can't concentrate, and wishes she were dead.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder"],
      strength: { "major-depressive-disorder": "strong" },
      excludes: ["prolonged-grief-disorder"],
      matched: ["bereavement", "passive-death-wish"],
      redFlags: ["suicidality"],
    },
  },
  {
    name: "traumatic loss with a wish to join the person and hearing his voice: suicidality and psychosis flags stay visible",
    text:
      "Lost my son two years ago to an overdose. I can't stop thinking about my son, the grief is unbearable, life has no meaning without him, I wish I could join him, and I avoid his room. I sometimes hear his voice at night.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["prolonged-grief-disorder"],
      flags: { "prolonged-grief-disorder": ["red-flag"] },
      matched: ["bereavement", "grief-preoccupation", "grief-intense-pain", "passive-death-wish", "hallucinations"],
      redFlags: ["psychosis", "suicidality"],
    },
  },
  {
    name: "expected grief: missing him but functioning, pain in waves: possible only",
    text: "Widowed last year; misses him terribly but is back at work, sees friends and the pain comes in waves around anniversaries.",
    toggles: { duration: "gte6m", impairment: "no" },
    expect: {
      status: "ok",
      top: ["prolonged-grief-disorder"],
      maxStrength: "possible",
      flags: { "prolonged-grief-disorder": ["partial-core", "impairment"] },
    },
  },

  /* ------------------------------------------------------------- specific phobia */
  {
    name: "blood-injection-injury phobia: needle fear, medical avoidance, fainting during a blood draw",
    text:
      "Terrified of needles since childhood; hasn't been to the doctor in years, skips blood work and refuses vaccines because of needles, and fainted during a blood draw.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["specific-phobia"],
      strength: { "specific-phobia": "strong" },
      excludes: ["panic-disorder", "agoraphobia"],
      matched: ["circumscribed-fear", "phobic-avoidance", "blood-injury-fainting"],
    },
  },
  {
    name: "fear of heights with avoidance only: specific phobia, held at moderate",
    text: "Afraid of heights; avoids balconies and high places, panics on ladders, turned down a job on the 30th floor.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["specific-phobia"],
      strength: { "specific-phobia": "moderate" },
      flags: { "specific-phobia": ["breadth"] },
    },
  },
  {
    name: "hard case, specific phobia not agoraphobia: fear of flying only, other transport fine",
    text:
      "Fear of flying for 10 years, drives instead of flying, cancels flights, heart pounds and hands shake the week before a trip. Fine on buses, trains, elevators and in crowds.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["specific-phobia"],
      excludes: ["agoraphobia", "panic-disorder"],
      matched: ["circumscribed-fear", "phobic-avoidance"],
    },
  },
  {
    name: "hard case, agoraphobia not specific phobia: several situations feared for panic and no escape",
    text: "Afraid of elevators, buses, crowds and the mall because she might panic and can't get out; only goes out with her sister.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["agoraphobia", "specific-phobia"],
      strength: { agoraphobia: "moderate", "specific-phobia": "possible" },
      matched: ["fear-escape-help-unavailable", "needs-companion", "circumscribed-fear"],
    },
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

  /* ------------------------------------------------------------- bipolar spectrum */
  {
    name: "bipolar I: a high with little sleep, big spending and a hospital stay, now depressed",
    text:
      "For a week last spring she barely slept but felt great, talked a mile a minute, started five new projects and maxed out her credit cards; she was hospitalized during that high. Now feels down most days, no interest in anything.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["bipolar-i-disorder"],
      includes: ["bipolar-ii-disorder"],
      strength: { "bipolar-i-disorder": "strong", "major-depressive-disorder": "moderate" },
      matched: ["mania-severe-impact", "decreased-need-for-sleep", "grandiosity-elevated-mood"],
      flags: { "major-depressive-disorder": ["red-flag"] },
      redFlags: ["mania"],
    },
  },
  {
    name: "bipolar I: current high with voices, psychosis flag on the mood pattern",
    text:
      "Feels on top of the world, needs only 2 hours of sleep and feels rested, racing thoughts, started five new projects, irritable when interrupted. Hearing voices telling him he is the chosen one.",
    expect: {
      status: "ok",
      top: ["bipolar-i-disorder"],
      strength: { "bipolar-i-disorder": "strong", schizophrenia: "possible" },
      flags: { "bipolar-i-disorder": ["red-flag"], "bipolar-ii-disorder": ["required"] },
      redFlags: ["mania", "psychosis"],
    },
  },
  {
    name: "bipolar I history only: past manic hospital stay, held at possible without current detail",
    text: "Was hospitalized while manic two years ago after not sleeping for days and spending all her savings. Now steady on treatment.",
    expect: {
      status: "ok",
      top: ["bipolar-i-disorder"],
      maxStrength: "moderate",
      flags: { "bipolar-i-disorder": ["partial-core"] },
      redFlags: ["mania"],
    },
  },
  {
    name: "bipolar II: recurrent depression with a hypomanic week that friends noticed",
    text:
      "Two years of depression on and off. Last summer had a week where he felt on top of the world, needed only 3 hours of sleep and felt rested, racing thoughts, started lots of projects. Friends noticed. No hospital. Now depressed again, no energy, feels worthless.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["bipolar-ii-disorder", "bipolar-i-disorder"],
      strength: { "bipolar-ii-disorder": "strong", "major-depressive-disorder": "moderate" },
      noFlags: { "bipolar-ii-disorder": ["required"] },
      redFlags: ["mania"],
    },
  },
  {
    name: "hard case, depression with hypomanic spells: depression held at moderate with a bipolar flag, bipolar II shown",
    text:
      "Recurrent depression since college, feeling down and no interest in hobbies now. Has had a few spells of a week or so feeling hypomanic, more productive than ever, talking fast. Never hospitalized.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["major-depressive-disorder", "bipolar-ii-disorder"],
      strength: { "bipolar-ii-disorder": "moderate", "major-depressive-disorder": "moderate" },
      flags: { "major-depressive-disorder": ["red-flag"] },
      redFlags: ["mania"],
    },
  },
  {
    name: "bipolar II: current low with an earlier hypomanic week",
    text: "Depressed for a month, no energy, feels worthless, sleeping too much. Two years ago had a hypomanic week where she barely slept but felt amazing.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      includes: ["bipolar-ii-disorder", "bipolar-i-disorder"],
      strength: { "major-depressive-disorder": "moderate" },
      maxStrength: "moderate",
      redFlags: ["mania"],
    },
  },
  {
    name: "cyclothymia: years of milder highs and lows, never a long depression",
    text: "Always been moody, moods have gone up and down for years with irritable high weeks and tired low weeks.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["cyclothymic-disorder"],
      strength: { "cyclothymic-disorder": "moderate" },
      flags: { "cyclothymic-disorder": ["breadth"] },
      notMatched: ["longstanding-low-mood"],
    },
  },
  {
    name: "cyclothymia: emotional rollercoaster for years with racing thoughts when up",
    text: "Emotional rollercoaster for years: highs and lows, never stable for long, mood shifts every week or two. Racing thoughts when up, tired when down.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["cyclothymic-disorder"], strength: { "cyclothymic-disorder": "moderate" } },
  },
  {
    name: "cyclothymia vs borderline pattern: mood swings alone stay thin for both",
    text: "Mood swings, highs and lows, never stable for long.",
    expect: {
      status: "ok",
      top: ["cyclothymic-disorder"],
      includes: ["borderline-personality-disorder"],
      strength: { "borderline-personality-disorder": "possible" },
      maxStrength: "moderate",
    },
  },

  /* ------------------------------------------------------------- adult ADHD */
  {
    name: "adult ADHD: lifelong disorganization and impulsivity, childhood evidence",
    text:
      "Always losing things, misses deadlines at work, disorganized, procrastinates until the last minute. Teachers said he couldn't sit still and he was easily distracted as a kid. Interrupts people in meetings.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["adult-adhd"], strength: { "adult-adhd": "strong" }, matched: ["childhood-onset-attention"] },
  },
  {
    name: "adult ADHD without childhood history: held at moderate with a required-feature flag",
    text: "Easily distracted at work, careless mistakes, loses my keys, can't follow through on tasks.",
    expect: { status: "ok", top: ["adult-adhd"], strength: { "adult-adhd": "moderate" }, flags: { "adult-adhd": ["required"] } },
  },
  {
    name: "adult ADHD: hyperactive-impulsive style since grade school",
    text: "Impulsive, interrupts people, can't wait my turn, always late and loses track of time. Since grade school he was hyper and fidgety.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["adult-adhd"], strength: { "adult-adhd": "moderate" }, noFlags: { "adult-adhd": ["required"] } },
  },
  {
    name: "hard case, ADHD vs a high: mania signs cap the attention pattern",
    text: "Can't stay organized, starts things and never finishes, since childhood. This week racing thoughts, talking a mile a minute and only sleeps 2 hours a night and feels rested.",
    expect: {
      status: "ok",
      includes: ["adult-adhd", "bipolar-i-disorder"],
      strength: { "adult-adhd": ["moderate", "possible"] },
      flags: { "adult-adhd": ["red-flag"] },
      redFlags: ["mania"],
    },
  },

  /* ------------------------------------------------------------- borderline pattern */
  {
    name: "borderline pattern: abandonment fear, stormy relationships, emptiness, rage and self-harm",
    text:
      "Terrified her partner will leave, panics when he doesn't text back. Unstable relationships, goes from loving to hating people. Empty inside, fits of rage, cuts herself when overwhelmed.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["borderline-personality-disorder"],
      strength: { "borderline-personality-disorder": "strong" },
      flags: { "borderline-personality-disorder": ["red-flag"] },
      redFlags: ["suicidality"],
    },
  },
  {
    name: "borderline pattern: mood shifts within hours after arguments, identity disturbance",
    text: "Mood swings within hours after arguments, fear of abandonment, rocky relationships, no sense of self, explosive anger.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["borderline-personality-disorder"], strength: { "borderline-personality-disorder": "strong" } },
  },
  {
    name: "borderline pattern with recent self-harm: suicidality red flag shown, never a risk rating",
    text: "Fear of abandonment, love hate relationships, identity keeps changing, chronic emptiness. Self-harm by cutting last week.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["borderline-personality-disorder"], matched: ["self-harm"], redFlags: ["suicidality"] },
  },

  /* ------------------------------------------------------------- eating disorders */
  {
    name: "anorexia: restriction, fear of weight gain, low BMI, medical red flag",
    text: "Restricting to 500 calories a day, terrified of gaining weight, underweight with a bmi of 16, exercises excessively, feels fat.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["anorexia-nervosa"],
      strength: { "anorexia-nervosa": "strong" },
      flags: { "anorexia-nervosa": ["red-flag"] },
      redFlags: ["eating-disorder-medical"],
    },
  },
  {
    name: "anorexia with fainting: medical warning signs, urgent medical assessment message",
    text: "Afraid of gaining weight, restricting calories, lost a lot of weight, dangerously thin, fainted at the gym.",
    toggles: { duration: "1to6m" },
    expect: { status: "ok", top: ["anorexia-nervosa"], flags: { "anorexia-nervosa": ["red-flag"] }, redFlags: ["eating-disorder-medical"] },
  },
  {
    name: "bulimia: binge-purge cycle with shape concern",
    text: "Binge eating several times a week, then makes herself throw up; obsessed with her weight and hates her body.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["bulimia-nervosa", "binge-eating-disorder"],
      strength: { "bulimia-nervosa": "moderate" },
      redFlags: ["eating-disorder-medical"],
    },
  },
  {
    name: "bulimia without purging: fasting and exercise after binges",
    text: "Fasting after a binge, binges on food twice a week, compulsive exercise, my worth depends on my weight.",
    toggles: { duration: "1to6m" },
    expect: { status: "ok", top: ["bulimia-nervosa"], strength: { "bulimia-nervosa": "moderate" } },
  },
  {
    name: "binge-eating disorder: secret binges with shame, no compensation",
    text: "Binge eating at night, eats until uncomfortably full, eats in secret and feels disgusted with herself after eating.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["binge-eating-disorder"],
      includes: ["bulimia-nervosa"],
      strength: { "binge-eating-disorder": "moderate", "bulimia-nervosa": "possible" },
    },
  },
  {
    name: "hard case, binge eating not bulimia: purging denied",
    text: "Binges on food three times a week, out of control eating, hides food, ashamed after eating. No purging.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["binge-eating-disorder"],
      strength: { "bulimia-nervosa": "possible" },
      negated: ["purging-or-fainting"],
    },
  },

  /* ------------------------------------------------------------- psychosis */
  {
    name: "schizophrenia pattern: voices, paranoia, disorganized speech and months of decline",
    text:
      "Hearing voices that comment on him, believes the neighbors are plotting against him, disorganized speech, stopped going to work and neglecting hygiene for 8 months.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["schizophrenia"],
      strength: { schizophrenia: "strong" },
      flags: { schizophrenia: ["red-flag"] },
      redFlags: ["psychosis"],
    },
  },
  {
    name: "first-episode psychosis with daily cannabis: psychosis pattern, cannabis context only",
    text: "Hearing voices for a few weeks, paranoid that cameras are watching him, word salad, smokes weed every day.",
    toggles: { duration: "2to4w" },
    expect: {
      status: "ok",
      top: ["schizophrenia"],
      strength: { schizophrenia: ["moderate", "possible"] },
      flags: { schizophrenia: ["duration", "red-flag"] },
      excludes: ["cannabis-use-disorder"],
      matched: ["cannabis-use-pattern"],
      redFlags: ["psychosis"],
    },
  },
  {
    name: "schizophrenia pattern: delusion with negative symptoms and dropping out of school",
    text: "Paranoid, believes he is being poisoned, flat affect, barely speaks anymore, dropped out of school six months ago.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["schizophrenia"], matched: ["negative-symptoms", "functional-decline"], redFlags: ["psychosis"] },
  },

  /* ------------------------------------------------------------- illness anxiety and bodily distress */
  {
    name: "illness anxiety: fear of serious illness despite normal tests, checking and searching",
    text: "Health anxiety: convinced she has a serious illness even though tests are normal, googling symptoms every day, asks for more tests.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["illness-anxiety-disorder"], strength: { "illness-anxiety-disorder": "moderate" } },
  },
  {
    name: "illness anxiety: reassurance and doctor shopping",
    text: "Hypochondriac, sure something is seriously wrong with me, doctor shopping, constant reassurance from family.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["illness-anxiety-disorder"], strength: { "illness-anxiety-disorder": "moderate" }, flags: { "illness-anxiety-disorder": ["breadth"] } },
  },
  {
    name: "hard case, health anxiety not GAD: health is the main focus",
    text: "Worried about my health all the time, afraid I have cancer, checks my body for lumps, dr google, worries about everything else too.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["illness-anxiety-disorder", "generalized-anxiety-disorder"], strength: { "generalized-anxiety-disorder": "possible" } },
  },
  {
    name: "somatic symptom pattern: pain and fatigue that take over daily life",
    text: "Chronic pain all over and fatigue, symptoms doctors can't explain, my life revolves around my symptoms, stopped working.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["somatic-symptom-disorder"], strength: { "somatic-symptom-disorder": "moderate" } },
  },
  {
    name: "somatic symptom pattern with health worry and low mood",
    text: "Constant pain and stomach problems, unexplained symptoms for two years, consumed by my symptoms, health anxiety, feeling down.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["somatic-symptom-disorder"], includes: ["illness-anxiety-disorder"] },
  },
  {
    name: "somatic symptom pattern: symptoms with no cause found, preoccupation",
    text: "So many physical symptoms, constant pain, consumed by my symptoms.",
    expect: { status: "ok", top: ["somatic-symptom-disorder"], maxStrength: "moderate" },
  },

  /* ------------------------------------------------------------- hoarding */
  {
    name: "hoarding: cannot discard, rooms unusable, acquiring, fire hazard",
    text: "Can't throw anything away, house is full of stuff, rooms filled to the ceiling, buys things he doesn't need; fire hazard per the landlord.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["hoarding-disorder"], strength: { "hoarding-disorder": "strong" }, matched: ["clutter-safety-hazard"] },
  },
  {
    name: "hoarding: saving and clutter only, held at moderate",
    text: "Saves everything, can't part with things, clutter everywhere, cant use the kitchen because of the clutter.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["hoarding-disorder"], strength: { "hoarding-disorder": "moderate" } },
  },
  {
    name: "hoarding with low mood and blocked exits",
    text: "Hoarder, piles of stuff everywhere, compulsive buying, blocked exits, depressed and isolating.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["hoarding-disorder"], includes: ["major-depressive-disorder"] },
  },

  /* ------------------------------------------------------------- body dysmorphic */
  {
    name: "body dysmorphic pattern: nose preoccupation, mirror rituals, surgery",
    text: "Hates her nose, convinced she is ugly, hours in front of the mirror, had plastic surgery twice.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["body-dysmorphic-disorder"], strength: { "body-dysmorphic-disorder": "moderate" } },
  },
  {
    name: "body dysmorphic pattern with a passive death wish: suicidality flag",
    text: "Obsessed with my skin, mirror checking for hours, cover my face with makeup, avoids parties, wishes she wouldn't wake up.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["body-dysmorphic-disorder"],
      flags: { "body-dysmorphic-disorder": ["red-flag"] },
      redFlags: ["suicidality"],
    },
  },
  {
    name: "body dysmorphic pattern: comparing and repeated dermatology visits",
    text: "Thinks I look ugly, flaw in my appearance, comparing my looks, seeing dermatologists over and over.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["body-dysmorphic-disorder"] },
  },

  /* ------------------------------------------------------------- cannabis, opioids, stimulants (Part 2) */
  {
    name: "cannabis use disorder: daily use, failed cut-down, withdrawal, harm",
    text: "Smokes weed every day, can't cut down on weed, irritable and can't sleep without weed, keeps using even though it is messing up his job.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["cannabis-use-disorder"], strength: { "cannabis-use-disorder": "strong" }, part2: true },
  },
  {
    name: "cannabis use disorder: cravings, failed quit attempts, driving high",
    text: "Uses cannabis daily, cravings for weed, tried to quit weed many times, drives high.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["cannabis-use-disorder"], strength: { "cannabis-use-disorder": "moderate" }, part2: true },
  },
  {
    name: "cannabis use alone is context, not a disorder",
    text: "Smokes weed on weekends with friends. Otherwise doing fine.",
    expect: { status: "insufficient", matched: ["cannabis-use-pattern"] },
  },
  {
    name: "cannabis use disorder with daily use and lost control only",
    text: "Weed every day, more than I planned, can't stop smoking weed even though my partner is upset.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["cannabis-use-disorder"], part2: true },
  },
  {
    name: "opioid use disorder: fentanyl, withdrawal, overdose and naloxone",
    text: "Uses fentanyl daily, dope sick in the mornings, can't stop using heroin, overdosed on fentanyl last month and needed narcan.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["opioid-use-disorder"], strength: { "opioid-use-disorder": "strong" }, matched: ["opioid-overdose-risk"], part2: true },
  },
  {
    name: "opioid use disorder: prescription pain pills beyond the prescription",
    text: "Takes more pain pills than prescribed, can't cut down on pain pills, opioid withdrawal when he runs out.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["opioid-use-disorder"], strength: { "opioid-use-disorder": "moderate" }, flags: { "opioid-use-disorder": ["breadth"] }, part2: true },
  },
  {
    name: "opioid use disorder: withdrawal and using alone",
    text: "Dopesick, uses heroin alone, revived with narcan twice.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["opioid-use-disorder"], strength: { "opioid-use-disorder": "moderate" }, part2: true },
  },
  {
    name: "stimulant use disorder: methamphetamine binges, crashes and job loss",
    text: "Smokes meth on weekends, binges on meth for days, crashes after meth, cravings for meth, lost his job because of it.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["stimulant-use-disorder"], strength: { "stimulant-use-disorder": "moderate" }, part2: true },
  },
  {
    name: "stimulant use disorder: cocaine binges with chest pain",
    text: "Uses cocaine on weekends, can't stop once he starts on coke, chest pain after coke, crashing after cocaine.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["stimulant-use-disorder"], matched: ["chest-pain"], part2: true },
  },
  {
    name: "stimulant use disorder: misused prescription stimulants and paranoia, psychosis flag",
    text: "Takes extra adderall, buys adderall, cravings for adderall, up for days on adderall, paranoid after meth.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["stimulant-use-disorder"],
      flags: { "stimulant-use-disorder": ["red-flag"] },
      redFlags: ["psychosis"],
      part2: true,
    },
  },
  /* ------------------------------------------------------------- acute stress (first month after a trauma) */
  {
    name: "acute stress: car crash 10 days ago with reliving, avoidance, numbing and feeling unreal",
    text: "Was in a car accident 10 days ago. Nightmares every night, flashbacks, avoids driving, jumpy, can't sleep, feels numb and unreal.",
    toggles: { duration: "2to4w" },
    expect: {
      status: "ok",
      top: ["acute-stress-disorder"],
      strength: { "acute-stress-disorder": "strong" },
      flags: { ptsd: ["duration"] },
      matched: ["recent-trauma-past-month", "derealization-depersonalization"],
    },
  },
  {
    name: "acute stress: assault last week, dissociation and poor sleep",
    text: "Was assaulted last week walking home. Since then she feels unreal and numb, has nightmares, avoids the street where it happened, can't sleep and is on edge.",
    toggles: { duration: "lt2w" },
    expect: { status: "ok", top: ["acute-stress-disorder"], strength: { "acute-stress-disorder": "strong" } },
  },
  {
    name: "acute stress: a recent event alone stays moderate until reactions are documented",
    text: "Car accident yesterday, otherwise doing ok.",
    toggles: { duration: "lt2w" },
    expect: {
      status: "ok",
      top: ["acute-stress-disorder"],
      strength: { "acute-stress-disorder": "moderate" },
      flags: { "acute-stress-disorder": ["breadth"] },
    },
  },
  {
    name: "acute stress: house fire three weeks ago with reliving and feeling unreal",
    text: "Was in a house fire three weeks ago. Keeps reliving it in flashbacks, avoids the kitchen, feels unreal, can't concentrate at work.",
    toggles: { duration: "2to4w" },
    expect: { status: "ok", top: ["acute-stress-disorder"], maxStrength: "moderate" },
  },
  {
    name: "chronic PTSD does not surface the first-month pattern",
    text: "Assaulted two years ago. Nightmares, flashbacks, avoids the area, jumpy, can't sleep, feels numb.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["ptsd"], excludes: ["acute-stress-disorder"] },
  },
  {
    name: "a recent non-traumatic stressor is not read as a recent trauma",
    text: "Lost my job last week and can't stop thinking about the layoff, feeling down.",
    toggles: { duration: "2to4w" },
    expect: { status: "ok", top: ["adjustment-disorder"], excludes: ["acute-stress-disorder", "ptsd"], notMatched: ["recent-trauma-past-month"] },
  },

  /* ------------------------------------------------------------- sedatives, hypnotics and anxiolytics (Part 2) */
  {
    name: "sedative use disorder: extra Xanax, early refills, mixing with alcohol and withdrawal between doses",
    text: "Takes more xanax than prescribed, runs out of xanax early, shaky when the xanax wears off, mixes xanax with alcohol.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["sedative-hypnotic-use-disorder"],
      strength: { "sedative-hypnotic-use-disorder": "moderate" },
      flags: { "sedative-hypnotic-use-disorder": ["red-flag", "substance"] },
      redFlags: ["withdrawal"],
      part2: true,
    },
  },
  {
    name: "sedative use disorder: nightly zolpidem with extra doses and sleep driving",
    text: "Ambien every night for years, takes extra ambien, sleep driving on ambien, can't remember things.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["sedative-hypnotic-use-disorder"], matched: ["sedative-despite-harm"], part2: true },
  },
  {
    name: "sedative use disorder: benzodiazepines from friends and failed tapers",
    text: "Xanax every day for panic, takes extra xanax, gets benzos from friends, tried to taper off xanax twice and could not.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["sedative-hypnotic-use-disorder"], matched: ["sedative-impaired-control", "sedative-use-pattern"], part2: true },
  },
  {
    name: "use as prescribed with rebound between doses: no use disorder suggested, the withdrawal flag stays visible",
    text: "On klonopin for years as prescribed, rebound anxiety between doses.",
    toggles: { duration: "gte6m" },
    expect: { status: "insufficient", matched: ["sedative-use-pattern", "sedative-withdrawal-signs"], redFlags: ["withdrawal"] },
  },

  /* ------------------------------------------------------------- gambling */
  {
    name: "gambling disorder: sports betting, chasing losses, borrowing and lying about it",
    text: "Sports betting every day on his phone, bets more to win it back, borrowed money to gamble, lied about gambling to his wife, irritable and can't sleep.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["gambling-disorder"], strength: { "gambling-disorder": "moderate" }, noFlags: { "gambling-disorder": ["red-flag"] } },
  },
  {
    name: "gambling disorder with thoughts of being better off dead: the suicide flag is raised, no Part 2 content",
    text: "Lost our savings gambling, chasing my losses, can't stop betting, thinks everyone would be better off without me.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["gambling-disorder"],
      flags: { "gambling-disorder": ["red-flag"] },
      redFlags: ["suicidality"],
    },
  },
  {
    name: "gambling only during a high: mood elevation leads and gambling stays low",
    text: "Not sleeping for days and feels on top of the world, betting is out of control, chasing losses.",
    toggles: { duration: "2to4w" },
    expect: {
      status: "ok",
      includes: ["gambling-disorder", "bipolar-i-disorder"],
      strength: { "gambling-disorder": "possible" },
      flags: { "gambling-disorder": ["red-flag"] },
      redFlags: ["mania"],
    },
  },

  /* ------------------------------------------------------------- tobacco and nicotine (Part 2 notice, conservative) */
  {
    name: "tobacco use disorder: a pack a day, cravings and failed quit attempts",
    text: "Smokes a pack a day, tried to quit cigarettes three times, craving cigarettes, irritable without a cigarette.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["tobacco-use-disorder"], strength: { "tobacco-use-disorder": "strong" }, part2: true },
  },
  {
    name: "tobacco use disorder: nicotine vaping with cravings and quit attempts",
    text: "Vapes nicotine all day since college, cravings for my vape, cranky without my vape, tried to quit nicotine twice.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["tobacco-use-disorder"], matched: ["tobacco-use-pattern", "tobacco-craving-withdrawal", "tobacco-unsuccessful-quit"], part2: true },
  },
  {
    name: "tobacco use disorder: smoking despite COPD",
    text: "Daily smoker, still smokes despite copd, tried the nicotine patch, craving a cigarette within minutes of waking.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["tobacco-use-disorder"], strength: { "tobacco-use-disorder": "moderate" }, part2: true },
  },
  {
    name: "cannabis smoking is not read as tobacco",
    text: "Smokes weed every day, can't quit smoking weed, irritable without weed.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["cannabis-use-disorder"],
      excludes: ["tobacco-use-disorder"],
      notMatched: ["tobacco-use-pattern", "tobacco-unsuccessful-quit", "tobacco-craving-withdrawal"],
      part2: true,
    },
  },

  /* ------------------------------------------------------------- hair pulling and skin picking */
  {
    name: "hair pulling with failed attempts to stop and hiding bald spots",
    text: "Pulls out her hair at night, bald spots from pulling, can't stop pulling, wears a hat to hide the bald spots, ashamed.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["body-focused-repetitive-behaviors"], matched: ["hair-pulling", "bfrb-attempts-to-stop"] },
  },
  {
    name: "eyelash pulling while studying, with low mood and anxiety",
    text: "Pulls out her eyelashes while studying, tried to stop pulling many times, fake eyelashes to hide them, feels down and anxious.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["body-focused-repetitive-behaviors"], strength: { "body-focused-repetitive-behaviors": "strong" } },
  },
  {
    name: "skin picking with sores, attempts to stop and covering scabs",
    text: "Picks at her skin until it bleeds, picks scabs, tried to stop picking, covers the scabs with makeup, anxious.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", top: ["body-focused-repetitive-behaviors"], matched: ["skin-picking", "bfrb-distress-concealment"] },
  },
  {
    name: "picking to fix a perceived flaw: body dysmorphic concerns lead",
    text: "Hates her nose, convinced she is ugly, hours in front of the mirror, picks at her skin to fix the flaws, had plastic surgery twice.",
    toggles: { duration: "gte6m" },
    expect: {
      status: "ok",
      top: ["body-dysmorphic-disorder"],
      strength: { "body-focused-repetitive-behaviors": "possible" },
      flags: { "body-focused-repetitive-behaviors": ["partial-core"] },
    },
  },

  /* ------------------------------------------------------------- premenstrual mood */
  {
    name: "PMDD pattern confirmed with daily ratings over two cycles",
    text: "Irritable and tearful the week before my period, fights with my partner before my period, better once my period starts, tracked over two cycles.",
    toggles: { duration: "1to6m" },
    expect: { status: "ok", top: ["premenstrual-dysphoric-disorder"], strength: { "premenstrual-dysphoric-disorder": "strong" } },
  },
  {
    name: "premenstrual symptoms by recall only: held at moderate until the cycle link is documented",
    text: "Irritable before my period and fights with my partner before my period.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["premenstrual-dysphoric-disorder"],
      strength: { "premenstrual-dysphoric-disorder": ["moderate", "possible"] },
      flags: { "premenstrual-dysphoric-disorder": ["required"] },
    },
  },
  {
    name: "premenstrual suicidal thoughts: the suicide flag is raised on the premenstrual pattern",
    text: "Hopeless and has thoughts of suicide the week before my period, gone once my period starts.",
    toggles: { duration: "1to6m" },
    expect: {
      status: "ok",
      top: ["premenstrual-dysphoric-disorder"],
      flags: { "premenstrual-dysphoric-disorder": ["red-flag"] },
      redFlags: ["suicidality"],
    },
  },
  {
    name: "low mood all month is not read as a premenstrual pattern",
    text: "Feels down most days all month, lost interest in everything, can't sleep, feels worthless, worse before my period.",
    toggles: { duration: "1to6m" },
    expect: { status: "ok", top: ["major-depressive-disorder"], excludes: ["premenstrual-dysphoric-disorder"] },
  },

  /* ------------------------------------------------------------- perinatal psychosis and complex trauma */
  {
    name: "voices after childbirth: psychosis red flag, no forced match",
    text: "Hearing voices since the baby was born, not sleeping.",
    toggles: { duration: "lt2w" },
    expect: { status: "insufficient", matched: ["postpartum-onset-psychosis"], redFlags: ["psychosis"] },
  },
  {
    name: "childhood abuse with reliving plus fear of abandonment: PTSD and borderline patterns both surface",
    text: "Abused throughout childhood. Flashbacks and nightmares, avoids reminders, terrified of being abandoned, unstable relationships, feels empty inside.",
    toggles: { duration: "gte6m" },
    expect: { status: "ok", includes: ["ptsd", "borderline-personality-disorder"], matched: ["traumatic-event-exposure"] },
  },
];

describe("clinical vignettes (real content)", () => {
  it("has at least 70 vignettes, with unique names", () => {
    expect(VIGNETTES.length).toBeGreaterThanOrEqual(70);
    expect(new Set(VIGNETTES.map((v) => v.name)).size).toBe(VIGNETTES.length);
  });

  it("covers every condition in the knowledge base with at least 3 vignettes that expect it", () => {
    for (const c of conditions) {
      const n = VIGNETTES.filter((v) => v.expect.top?.includes(c.id as ConditionId) || v.expect.includes?.includes(c.id as ConditionId)).length;
      expect(n, c.id).toBeGreaterThanOrEqual(3);
    }
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

    // G6: a substance-use suggestion means the Part 2 banner and export notice apply; nothing else may surface one.
    const sudShown = result.suggestions.filter((s) => getCondition(s.conditionId)?.sud).map((s) => s.conditionId);
    expect(sudShown.length > 0, `Part 2 content shown: [${sudShown.join(", ")}]`).toBe(e.part2 ?? false);
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

describe("vignettes: codes carried on round 4 suggestions", () => {
  it("PTSD carries both ICD-11 codes (6B40 and complex PTSD 6B41) and still only ICD-10-CM F43.1x", () => {
    const s = suggestion(analyze("assaulted 6 months ago. nightmares most nights, flashbacks, avoids the area where it happened, jumpy, always on guard", { duration: "gte6m" }).result, "ptsd");
    expect(s?.icd11.map((c) => c.code)).toEqual(["6B40", "6B41"]);
    for (const c of s?.icd10cm ?? []) expect(c.code).toMatch(/^F43\.1[012]$/);
  });

  it("the first-month pattern carries ICD-10-CM F43.0 and ICD-11 QE84", () => {
    const s = suggestion(analyze("Car accident 2 weeks ago, nightmares, flashbacks, won't drive, jumpy.", { duration: "2to4w" }).result, "acute-stress-disorder");
    expect(s?.icd10cm.map((c) => c.code)).toEqual(["F43.0"]);
    expect(s?.icd11.map((c) => c.code)).toEqual(["QE84"]);
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
    ["Pt is not afraid of elevators.", [], ["avoid-enclosed-spaces", "circumscribed-fear"]],
    // Non-consuming: one mention supports situational panic AND dread of the place.
    ["Panic attacks in stores.", ["panic-attack-cued", "avoid-enclosed-spaces"], []],
    // Safety-relevant near-collisions stay apart.
    ["Has thoughts of dying.", ["passive-death-wish"], []],
    ["Thought she was dying during the attack.", ["fear-of-dying"], []],
    // Expansion lexicon: a red flag is never swallowed by an overlapping OCD phrase.
    ["Intrusive thoughts of hurting someone.", ["homicidal-ideation", "obsessions"], []],
    // The same words can point to agoraphobia or social anxiety: both surface, the clinician clarifies.
    ["Afraid I will embarrass myself.", ["fear-escape-help-unavailable", "fear-social-scrutiny"], []],
    ["Not worried about what people think.", [], ["fear-social-scrutiny"]],
    // Everyday wording that must not trigger substance-use, OCD, grief or chronic-mood entries.
    ["Drinks too much coffee.", [], []],
    ["Checks her blood sugar 4 times a day.", [], []],
    ["Food cravings at night.", [], []],
    ["Low back pain for years.", [], []],
    ["Lost her temper with her husband.", [], []],
    ["Avoids AA meetings.", [], []],
    ["Denies cravings for alcohol.", [], ["alcohol-craving"]],
    // Preoccupation with a stressor also records the stressor itself.
    ["Can't stop thinking about the divorce.", ["stressor-preoccupation", "identifiable-stressor"], []],
    ["Her husband died last spring.", ["bereavement"], []],
    ["Faints at the sight of blood.", ["dizziness", "blood-injury-fainting"], []],
    // Round 4 lexicon: idioms and everyday wording that must not trigger the new patterns.
    ["I'm pulling my hair out over this project.", [], []],
    ["Plucks her eyebrows.", [], []],
    ["Picks her kids up from school.", [], []],
    ["Panic attack last week.", ["panic-attacks-unspecified"], []],
    ["Had an accident at work last week.", [], []],
    ["Two weeks ago she was in a car accident.", ["traumatic-event-exposure", "recent-trauma-past-month"], []],
    ["Non-smoker.", [], []],
    ["Quit smoking ten years ago.", [], []],
    ["Denies tobacco use.", [], ["tobacco-use-pattern"]],
    ["No hair pulling or skin picking.", [], ["hair-pulling", "skin-picking"]],
    ["Before my period I get cramps.", [], []],
    // Nightly sleeping pills document both the sedative pattern and the insomnia safety habit.
    ["Takes sleeping pills every night.", ["sleep-compensatory-behaviors", "sedative-use-pattern"], []],
    // A red flag after childbirth is never swallowed by the general hallucination entry.
    ["Hearing voices since the baby was born.", ["postpartum-onset-psychosis"], []],
  ] as [string, string[], string[]][])("%s", (text, positive, negated) => {
    const m = matchSymptoms(text, lexicon.symptoms);
    expect(ids(m.matches)).toEqual(positive);
    expect(ids(m.negated)).toEqual(negated);
  });
});
