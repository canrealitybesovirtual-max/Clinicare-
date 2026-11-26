import { describe, expect, it } from "vitest";
import { matchSymptoms, normalizeText, searchSymptoms, stem } from "@/lib/matcher";
import type { Symptom } from "@/lib/schemas";
import { fxSymptoms } from "../fixtures";

const ids = (list: { symptomId: string }[]) => list.map((m) => m.symptomId);
const run = (text: string, symptoms: Symptom[] = fxSymptoms) => matchSymptoms(text, symptoms);

describe("normalizeText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeText("Panic ATTACKS!!! (daily)")).toBe("panic attacks daily");
  });

  it("unifies apostrophes so contractions collapse (can't -> cant, i'm -> im)", () => {
    expect(normalizeText("I can't sleep")).toBe("i cant sleep");
    expect(normalizeText("I'm worried")).toBe("im worried");
    expect(normalizeText("I’m sure I can’t")).toBe("im sure i cant");
    expect(normalizeText("doesn`t")).toBe("doesnt");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeText("  heart \t\n racing   ")).toBe("heart racing");
  });

  it("turns hyphens and slashes into spaces", () => {
    expect(normalizeText("self-harm SI/HI")).toBe("self harm si hi");
  });

  it("strips accents and handles empty input", () => {
    expect(normalizeText("Café naïve")).toBe("cafe naive");
    expect(normalizeText("")).toBe("");
    expect(normalizeText("...!?")).toBe("");
  });
});

describe("stem", () => {
  it("maps worry / worries / worried / worrying to one stem", () => {
    const s = stem("worry");
    expect([stem("worries"), stem("worried"), stem("worrying")]).toEqual([s, s, s]);
  });

  it("maps panic / panics / panicked / panicking to one stem", () => {
    const s = stem("panic");
    expect([stem("panics"), stem("panicked"), stem("panicking")]).toEqual([s, s, s]);
  });

  it("handles -ing on e-final words, plurals and doubled consonants", () => {
    expect(stem("racing")).toBe(stem("race"));
    expect(stem("nightmares")).toBe(stem("nightmare"));
    expect(stem("sleeping")).toBe(stem("sleeps"));
    expect(stem("stopped")).toBe(stem("stop"));
    expect(stem("stresses")).toBe(stem("stress"));
    expect(stem("constantly")).toBe("constant");
  });

  it("leaves short words and -is / -us / -ss endings alone", () => {
    expect(stem("is")).toBe("is");
    expect(stem("sad")).toBe("sad");
    expect(stem("crisis")).toBe("crisis");
    expect(stem("anxious")).toBe("anxious");
    expect(stem("thing")).toBe("thing");
  });
});

describe("matchSymptoms: phrases, stemming, stopwords", () => {
  it("returns nothing for empty text or an empty lexicon", () => {
    expect(run("")).toEqual({ matches: [], negated: [], attributed: [] });
    expect(run("panic attacks", [])).toEqual({ matches: [], negated: [], attributed: [] });
  });

  it("matches a synonym through stemming (worrying ~ worry)", () => {
    expect(ids(run("Client reports worrying all the time").matches)).toEqual(["worry-excessive"]);
  });

  it("matches panicked ~ panic", () => {
    const r = run("She panicked out of nowhere at work");
    expect(r.matches).toEqual([{ symptomId: "panic-attacks", phrase: "panic out of nowhere" }]);
  });

  it("ignores stopwords on both sides (cant leave my house ~ cant leave the house)", () => {
    const r = run("I can't leave my house anymore");
    expect(r.matches).toEqual([{ symptomId: "avoid-leaving-home", phrase: "cant leave the house" }]);
  });

  it("is stopword-insensitive in the middle of a phrase (trouble with sleep ~ trouble sleeping)", () => {
    expect(ids(run("Lots of trouble with sleep").matches)).toEqual(["insomnia"]);
  });

  it("skips copulas and possessives (my heart was racing ~ heart racing)", () => {
    expect(ids(run("my heart was racing").matches)).toEqual(["palpitations"]);
  });

  it("matches the clinician label and the client label, reporting the lexicon phrase", () => {
    expect(run("Notes racing or pounding heartbeat").matches).toEqual([
      { symptomId: "palpitations", phrase: "Racing or pounding heartbeat" },
    ]);
    expect(run("feeling on edge lately").matches).toEqual([{ symptomId: "restlessness", phrase: "Feeling on edge" }]);
  });

  it("never matches inside a word", () => {
    expect(run("went hiking this weekend, thinking about this").matches).toEqual([]);
  });

  it("does not match a phrase across a sentence break", () => {
    expect(ids(run("Her heart. Racing around all day").matches)).toEqual([]);
  });

  it("returns matches in order of first mention", () => {
    expect(ids(run("can't sleep and heart racing").matches)).toEqual(["insomnia", "palpitations"]);
    expect(ids(run("heart racing, can't sleep").matches)).toEqual(["palpitations", "insomnia"]);
  });

  it("reports each symptomId once", () => {
    const r = run("Panic attacks on Monday. Another panic attack today, sudden panic again.");
    expect(ids(r.matches)).toEqual(["panic-attacks"]);
  });

  it("lets the longest phrase win on overlap", () => {
    const r = run("worried about having another panic attack");
    expect(ids(r.matches)).toEqual(["fear-of-attacks"]);
  });

  it("matches several symptoms in one note", () => {
    const r = run("Feeling down, lost interest, exhausted and can't concentrate.");
    expect(ids(r.matches)).toEqual(["depressed-mood", "anhedonia", "fatigue", "concentration"]);
    expect(r.negated).toEqual([]);
  });
});

describe("matchSymptoms: negation", () => {
  it("negates after 'denies'", () => {
    const r = run("Denies nightmares.");
    expect(r.matches).toEqual([]);
    expect(r.negated).toEqual([{ symptomId: "nightmares", phrase: "nightmares" }]);
  });

  it("negates with bare 'no' immediately before the phrase", () => {
    const r = run("No nightmares");
    expect(ids(r.negated)).toEqual(["nightmares"]);
    expect(r.matches).toEqual([]);
  });

  it("keeps 'no interest in anything' positive (phrase begins with a negation)", () => {
    const r = run("She has no interest in anything");
    expect(ids(r.matches)).toEqual(["anhedonia"]);
    expect(r.negated).toEqual([]);
  });

  it("keeps 'not sleeping' positive (phrase begins with a negation)", () => {
    expect(ids(run("He is not sleeping").matches)).toEqual(["insomnia"]);
  });

  it("negates every phrase in the clause after a strong cue: 'denies SI or HI'", () => {
    const r = run("Pt denies SI or HI");
    expect(r.matches).toEqual([]);
    expect(ids(r.negated)).toEqual(["suicidal-ideation", "homicidal-ideation"]);
  });

  it("handles 'denies SI/HI'", () => {
    expect(ids(run("Denies SI/HI").negated)).toEqual(["suicidal-ideation", "homicidal-ideation"]);
  });

  it("bare 'no' covers a plain list of phrases: 'no SI or HI' negates both", () => {
    const r = run("no SI or HI");
    expect(ids(r.negated)).toEqual(["suicidal-ideation", "homicidal-ideation"]);
    expect(r.matches).toEqual([]);
  });

  it("a list stops at a new predicate: 'no SI and hears voices' keeps the voices positive", () => {
    for (const text of ["no SI and hears voices", "No SI and has been hearing voices at night", "no SI, hearing voices"]) {
      const r = run(text);
      expect(ids(r.negated), text).toEqual(["suicidal-ideation"]);
      expect(ids(r.matches), text).toEqual(["hearing-voices"]);
    }
  });

  it("a comma list carries a leading negation only across short abbreviations ('No SI, HI, or AVH')", () => {
    const r = run("No SI, HI, or AVH.");
    expect(ids(r.negated)).toEqual(["suicidal-ideation", "homicidal-ideation", "hearing-voices"]);
    expect(r.matches).toEqual([]);
    // A whole phrase after a comma is a new statement, not a list item.
    expect(ids(run("Denied nightmares, hearing voices at night").matches)).toEqual(["hearing-voices"]);
  });

  it("bare 'no' does not reach past a content word ('no recent nightmares' stays positive)", () => {
    expect(ids(run("no recent nightmares").matches)).toEqual(["nightmares"]);
  });

  it("bare 'not' skips stopwords ('not really worrying all the time')", () => {
    expect(ids(run("not really worrying all the time").negated)).toEqual(["worry-excessive"]);
  });

  it("bare 'never' negates ('never had a panic attack')", () => {
    expect(ids(run("never had a panic attack").negated)).toEqual(["panic-attacks"]);
  });

  it("stops negation at a comma", () => {
    const r = run("Denies SI, reports panic attacks");
    expect(ids(r.negated)).toEqual(["suicidal-ideation"]);
    expect(ids(r.matches)).toEqual(["panic-attacks"]);
  });

  it("stops negation at a period", () => {
    const r = run("Denies nightmares. Can't sleep.");
    expect(ids(r.negated)).toEqual(["nightmares"]);
    expect(ids(r.matches)).toEqual(["insomnia"]);
  });

  it("stops negation at 'but' / 'however' / 'although'", () => {
    expect(ids(run("denies si but hearing voices").matches)).toEqual(["hearing-voices"]);
    expect(ids(run("denies nightmares however can't sleep").matches)).toEqual(["insomnia"]);
    expect(ids(run("denies panic attacks although heart racing").matches)).toEqual(["palpitations"]);
  });

  it("ends a strong cue's scope at an affirming verb ('denies SI and reports hearing voices')", () => {
    const r = run("Denies SI and reports hearing voices");
    expect(ids(r.negated)).toEqual(["suicidal-ideation"]);
    expect(ids(r.matches)).toEqual(["hearing-voices"]);
  });

  it.each([
    ["denied nightmares", "nightmares"],
    ["denying panic attacks", "panic-attacks"],
    ["negative for hearing voices", "hearing-voices"],
    ["no history of panic attacks", "panic-attacks"],
    ["no evidence of AVH", "hearing-voices"],
    ["does not report nightmares", "nightmares"],
    ["doesn't report nightmares", "nightmares"],
    ["not experiencing panic attacks", "panic-attacks"],
    ["absence of nightmares", "nightmares"],
    ["ruled out hearing voices", "hearing-voices"],
  ])("negates with strong cue: %s", (text, id) => {
    const r = run(text);
    expect(ids(r.negated)).toEqual([id]);
    expect(r.matches).toEqual([]);
  });

  it("a strong cue covers several phrases in its clause", () => {
    const r = run("No history of panic attacks or nightmares");
    expect(ids(r.negated)).toEqual(["panic-attacks", "nightmares"]);
  });

  it("does not negate when the cue comes after the phrase", () => {
    expect(ids(run("hearing voices ruled out by").matches)).toEqual(["hearing-voices"]);
  });

  it("a positive mention wins over a negated one for the same symptom", () => {
    const r = run("Denied nightmares last year, nightmares started again this month");
    expect(ids(r.matches)).toEqual(["nightmares"]);
    expect(r.negated).toEqual([]);
  });

  it("ignores a cue that is part of a matched phrase", () => {
    const lex: Symptom[] = [
      { id: "numbing", label: "Emotional numbing", clientLabel: "Feeling numb", category: "trauma", synonyms: ["absence of feeling", "numb"] },
      { id: "dreams", label: "Recurrent distressing dreams", clientLabel: "Bad dreams", category: "trauma", synonyms: ["nightmares", "bad dreams"] },
    ];
    expect(ids(matchSymptoms("absence of feeling and nightmares", lex).matches)).toEqual(["numbing", "dreams"]);
  });
});

describe("matchSymptoms: caching", () => {
  it("is deterministic across repeated calls", () => {
    const text = "Denies SI. Panicked out of nowhere, can't sleep, worried about having another panic attack";
    const first = run(text);
    for (let i = 0; i < 25; i++) expect(run(text)).toEqual(first);
  });

  it("caches per symptoms array, so a different array gets its own index", () => {
    expect(run("totally wiped out").matches).toEqual([]);
    const extended = fxSymptoms.map((s) => (s.id === "fatigue" ? { ...s, synonyms: [...s.synonyms, "wiped out"] } : s));
    expect(ids(matchSymptoms("totally wiped out", extended).matches)).toEqual(["fatigue"]);
    expect(run("totally wiped out").matches).toEqual([]);
  });
});

describe("searchSymptoms", () => {
  it("returns [] for an empty or punctuation-only query", () => {
    expect(searchSymptoms("", fxSymptoms)).toEqual([]);
    expect(searchSymptoms("   ", fxSymptoms)).toEqual([]);
    expect(searchSymptoms("?!", fxSymptoms)).toEqual([]);
  });

  it("finds a symptom by synonym", () => {
    expect(searchSymptoms("panic", fxSymptoms)[0]?.id).toBe("panic-attacks");
    expect(searchSymptoms("nightmares", fxSymptoms)[0]?.id).toBe("nightmares");
  });

  it("finds a symptom by label or client label, case-insensitively", () => {
    expect(searchSymptoms("POUNDING HEARTBEAT", fxSymptoms)[0]?.id).toBe("palpitations");
    expect(searchSymptoms("hard to focus", fxSymptoms)[0]?.id).toBe("concentration");
  });

  it("tolerates typos and apostrophes", () => {
    expect(searchSymptoms("can't slep", fxSymptoms)[0]?.id).toBe("insomnia");
  });

  it("respects the limit and returns lexicon objects", () => {
    const all = searchSymptoms("thoughts", fxSymptoms);
    expect(all.length).toBeGreaterThan(1);
    const one = searchSymptoms("thoughts", fxSymptoms, 1);
    expect(one).toHaveLength(1);
    expect(one[0]).toBe(all[0]);
    expect(fxSymptoms).toContain(one[0]);
    expect(searchSymptoms("thoughts", fxSymptoms, 0)).toEqual([]);
    expect(searchSymptoms("e", fxSymptoms).length).toBeLessThanOrEqual(8);
  });

  it("returns [] when nothing is close", () => {
    expect(searchSymptoms("zzqxj", fxSymptoms)).toEqual([]);
  });
});
