/**
 * Trigger extraction (src/lib/follow-up/triggers.ts) and the curated dictionary (content/trigger-objects.json).
 */
import { describe, expect, it } from "vitest";
import { normalizeText, stem } from "@/lib/matcher";
import { scrubPHI } from "@/lib/phi-scrubber";
import { TRIGGER_CATEGORIES } from "@/lib/schemas-follow-up";
import { allHandouts, interventions } from "@/lib/library";
import { conditions, lexicon, measures } from "@/lib/content";
import { triggerDictionary } from "@/lib/follow-up/dictionary";
import { answerConfirmedSubtypes, extractTriggers, summarizeTriggers, triggerCategoriesOf } from "@/lib/follow-up/triggers";

const one = (text: string) => {
  const hits = extractTriggers(text);
  return hits.map((h) => `${h.category}:${h.objectId}`);
};

describe("extractTriggers: cue patterns", () => {
  it.each([
    ["panic from dogs", "animal:dog"],
    ["afraid of spiders", "animal:spider"],
    ["scared of snakes", "animal:snake"],
    ["fear of heights", "natural-environment:heights"],
    ["has a phobia of needles", "blood-injection-injury:needle"],
    ["terrified of flying", "situational:flying"],
    ["panic around birds", "animal:bird"],
    ["panic attacks near bridges", "situational:bridge"],
    ["panics with crowds", "situational:crowds"],
    ["panic when seeing blood", "blood-injection-injury:blood"],
    ["panics when she sees a big dog", "animal:dog"],
    ["freaks out around wasps", "animal:wasp"],
    ["freaked out at the dentist", "blood-injection-injury:dentist"],
    ["avoids elevators", "situational:elevator"],
    ["can't go near water", "natural-environment:water"],
    ["cannot go near hospitals", "blood-injection-injury:hospital"],
    ["anxious about speaking in public", "social:public-speaking"],
    ["worries about germs", "contamination:germs"],
    ["afraid of having a heart attack", "health:heart-attack"],
    ["scared of choking", "choking-vomiting:choking"],
    ["dogs scare her", "animal:dog"],
    ["crowds make him panic", "situational:crowds"],
    ["dog phobia", "animal:dog"],
    ["stopped driving", "situational:driving"],
    ["won't take the elevator", "situational:elevator"],
  ])("%s -> %s", (text, expected) => {
    expect(one(text)).toEqual([expected]);
  });

  it("returns category, phrase and offsets into the text it was given", () => {
    const text = "Client reports panic from dogs most days.";
    const [hit] = extractTriggers(text);
    expect(hit).toMatchObject({ category: "animal", objectId: "dog", phrase: "dogs", cue: "panic", cuePhrase: "panic from", negated: false });
    expect(text.slice(hit?.start, hit?.end)).toBe("dogs");
  });

  it("keeps lists after one cue and matches multi-word terms", () => {
    expect(one("afraid of the dark, thunder, and deep water")).toEqual([
      "natural-environment:dark",
      "natural-environment:thunder",
      "natural-environment:water",
    ]);
    expect(one("anxious about meeting new people and eating in front of others")).toEqual([
      "social:new-people",
      "social:eating-in-public",
    ]);
  });

  it("handles plurals, irregular plurals and inflections through the matcher's stemmer", () => {
    expect(one("scared of mice and geese")).toEqual(["animal:mouse", "animal:goose"]);
    expect(one("panicked around puppies")).toEqual(["animal:dog"]);
    expect(one("afraid of a dog")).toEqual(["animal:dog"]);
  });
});

describe("extractTriggers: negation, scope and false positives", () => {
  it("drops negated mentions by default and flags them when asked", () => {
    expect(extractTriggers("not afraid of dogs")).toEqual([]);
    expect(extractTriggers("denies fear of heights")).toEqual([]);
    expect(extractTriggers("doesn't avoid crowds")).toEqual([]);
    const all = extractTriggers("denies fear of heights", { includeNegated: true });
    expect(all).toHaveLength(1);
    expect(all[0]?.negated).toBe(true);
  });

  it("does not let a negation reach past a new subject or across a contrast", () => {
    expect(one("No, she is afraid of dogs")).toEqual(["animal:dog"]);
    expect(one("not afraid of dogs but panics around spiders")).toEqual(["animal:spider"]);
  });

  it("needs a cue: a bare object or a non-fear use of a word is not a trigger", () => {
    expect(extractTriggers("walks the dogs every morning")).toEqual([]);
    expect(extractTriggers("has a scar from surgery")).toEqual([]);
    expect(extractTriggers("stopped at the store on the way home")).toEqual([]);
    expect(extractTriggers("nervous system exam was normal")).toEqual([]);
    expect(extractTriggers("")).toEqual([]);
  });

  it("never matches PHI placeholders left by the scrubber", () => {
    expect(extractTriggers("afraid of [NAME]")).toEqual([]);
    const scrubbed = scrubPHI("Maria Lopez, DOB 03/04/1980, is afraid of dogs. Call 555-123-4567.").clean;
    const hits = extractTriggers(scrubbed);
    expect(hits.map((h) => h.objectId)).toEqual(["dog"]);
    for (const h of hits) expect(h.phrase).not.toMatch(/\[|Maria|Lopez|555/);
  });
});

describe("extractTriggers: trauma reminders", () => {
  it("re-labels a fear tied to an event as trauma-reminder and keeps the base category", () => {
    const [hit] = extractTriggers("She is terrified of needles since the accident");
    expect(hit).toMatchObject({ category: "trauma-reminder", baseCategory: "blood-injection-injury", objectId: "needle", traumaCue: "since the accident" });
    expect(extractTriggers("She is terrified of needles since the accident")).toHaveLength(1);
  });

  it("uses the previous sentence for the event ('was bitten') and ignores negated events", () => {
    const [hit] = extractTriggers("Was bitten by a dog last year. Now panics when she sees a dog.");
    expect(hit).toMatchObject({ category: "trauma-reminder", baseCategory: "animal", traumaCue: "was bitten" });
    expect(extractTriggers("Has never been attacked. Afraid of dogs.")[0]?.category).toBe("animal");
  });

  it("ties the event to the neighboring comma part but does not run down a list", () => {
    expect(extractTriggers("afraid of dogs, ever since being bitten")[0]?.category).toBe("trauma-reminder");
    const hits = extractTriggers("nightmares since the assault, unexpected panic attacks, avoids crowds");
    expect(hits.map((h) => h.category)).toEqual(["situational"]);
  });

  it("does not read a feared outcome as a past event, and respects a negated event", () => {
    expect(extractTriggers("afraid of being trapped in elevators")[0]?.category).toBe("situational");
    expect(extractTriggers("scared to get attacked by dogs")[0]?.category).toBe("animal");
    expect(extractTriggers("Was never attacked. Afraid of dogs.")[0]?.category).toBe("animal");
    expect(extractTriggers("Was trapped in a lift for hours. Now avoids elevators.")[0]?.category).toBe("trauma-reminder");
  });

  it("never returns overlapping spans", () => {
    const hits = extractTriggers("afraid of deep water, deep water scares her", { includeNegated: true });
    expect(hits.map((h) => h.phrase)).toEqual(["deep water", "deep water"]);
    for (let i = 1; i < hits.length; i++) expect((hits[i] as { start: number }).start).toBeGreaterThanOrEqual((hits[i - 1] as { end: number }).end);
  });

  it("maps event-reminder objects directly", () => {
    expect(one("avoids talking about what happened")).toEqual(["trauma-reminder:event-reminder"]);
  });

  it("triggerCategoriesOf includes base categories, in canonical order", () => {
    const hits = extractTriggers("afraid of crowds. Scared to drive since the crash.");
    expect(triggerCategoriesOf(hits)).toEqual(["situational", "trauma-reminder"]);
    const hits2 = extractTriggers("afraid of germs; panics around dogs since the attack");
    expect(triggerCategoriesOf(hits2)).toEqual(["animal", "contamination", "trauma-reminder"]);
  });
});

describe("summarizeTriggers", () => {
  it("groups by category with labels and distinct lowercase phrases", () => {
    const s = summarizeTriggers(extractTriggers("Afraid of Dogs and cats; avoids dogs; fear of flying"));
    expect(s.map((r) => r.category)).toEqual(["animal", "situational"]);
    expect(s[0]).toMatchObject({ label: "Animals or insects", objectIds: ["dog", "cat"], phrases: ["dogs", "cats"] });
  });
});

describe("trigger dictionary (content/trigger-objects.json)", () => {
  it("is large enough (about 250 objects, 1000+ variants) and covers every category", () => {
    expect(triggerDictionary.objects.length).toBeGreaterThanOrEqual(220);
    expect(triggerDictionary.objects.reduce((n, o) => n + o.terms.length, 0)).toBeGreaterThanOrEqual(1000);
    for (const c of TRIGGER_CATEGORIES) expect(triggerDictionary.objects.some((o) => o.category === c), c).toBe(true);
  });

  it("never gives the same normalized, stemmed term to two objects", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const o of triggerDictionary.objects)
      for (const t of o.terms) {
        const key = normalizeText(t).split(" ").map(stem).join(" ");
        const prev = owner.get(key);
        if (prev && prev !== o.id) clashes.push(`${t}: ${prev} / ${o.id}`);
        owner.set(key, o.id);
      }
    expect(clashes).toEqual([]);
  });

  it("points category hints only at existing interventions, handouts and license-confirmed measures", () => {
    const iv = new Set(interventions.map((i) => i.id));
    const ho = new Set(allHandouts.map((h) => h.id));
    const me = new Set(measures.map((m) => m.id));
    for (const [cat, info] of Object.entries(triggerDictionary.categories)) {
      for (const id of info.interventionIds) expect(iv.has(id), `${cat} -> intervention ${id}`).toBe(true);
      for (const id of info.handoutIds) expect(ho.has(id), `${cat} -> handout ${id}`).toBe(true);
      for (const id of info.measureIds) expect(me.has(id), `${cat} -> measure ${id}`).toBe(true);
    }
  });

  it("maps objects only to phobia-type symptoms of a pattern their category points to", () => {
    const lex = new Map(lexicon.symptoms.map((s) => [s.id, s] as const));
    for (const o of triggerDictionary.objects) {
      if (!o.symptomId) continue;
      const s = lex.get(o.symptomId);
      expect(s, `${o.id} -> ${o.symptomId}`).toBeDefined();
      expect(s?.redFlag, o.id).toBeUndefined();
      const hinted = triggerDictionary.categories[o.category].conditionHints;
      const owners = conditions.filter((c) => hinted.includes(c.id) && c.features.some((f) => f.symptomId === o.symptomId));
      expect(owners.length, `${o.id} -> ${o.symptomId} belongs to no hinted pattern`).toBeGreaterThan(0);
    }
    const of = (id: string) => triggerDictionary.objects.find((o) => o.id === id)?.symptomId;
    for (const o of triggerDictionary.objects.filter((x) => x.category === "animal")) expect(o.symptomId, o.id).toBe("fear-animals");
    expect([of("flying"), of("bridge"), of("elevator"), of("needle"), of("storm")]).toEqual([
      "fear-flying",
      "fear-heights",
      "fear-enclosed-spaces",
      "fear-blood-injection",
      "fear-natural-environment",
    ]);
    // Situations with no phobia-type symptom of their own stay unmapped (driving, crowds, leaving home).
    expect([of("driving"), of("crowds"), of("leaving-home")]).toEqual([undefined, undefined, undefined]);
  });

  it("carries governance: original license, sources, lastVerified and reviewedBy", () => {
    expect(triggerDictionary.license).toBe("original");
    expect(triggerDictionary.reviewedBy).toBe("PENDING");
    expect(triggerDictionary.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const s of triggerDictionary.sources) expect(s.url).toMatch(/^https:\/\//);
  });

  it("finds an example in every category through a real cue", () => {
    const text =
      "Afraid of dogs. Fear of heights. Panics at the dentist. Avoids tunnels. Scared of vomiting. " +
      "Anxious about parties. Worries about germs. Nervous about cancer. Avoids reminders of the war since the deployment.";
    expect(triggerCategoriesOf(extractTriggers(text))).toEqual([...TRIGGER_CATEGORIES]);
  });

  it("is deterministic", () => {
    const text = "panic from dogs, avoids bridges and tunnels, scared of needles since the crash";
    expect(extractTriggers(text)).toEqual(extractTriggers(text));
  });
});

describe("answerConfirmedSubtypes", () => {
  it("adds the object's phobia type once an answer ties the fear to it", () => {
    const hits = extractTriggers("panics around pit bulls");
    expect(answerConfirmedSubtypes(hits, ["circumscribed-fear"], { present: [], absent: [] })).toEqual(["fear-animals"]);
    expect(answerConfirmedSubtypes(hits, ["phobic-avoidance"], { present: [], absent: [] })).toEqual(["fear-animals"]);
  });

  it("adds nothing without such an answer, when already present, or when noted as absent", () => {
    const hits = extractTriggers("panics around pit bulls");
    expect(answerConfirmedSubtypes(hits, [], { present: [], absent: [] })).toEqual([]);
    expect(answerConfirmedSubtypes(hits, ["palpitations"], { present: [], absent: [] })).toEqual([]);
    expect(answerConfirmedSubtypes(hits, ["circumscribed-fear"], { present: ["fear-animals"], absent: [] })).toEqual([]);
    expect(answerConfirmedSubtypes(hits, ["circumscribed-fear"], { present: [], absent: ["fear-animals"] })).toEqual([]);
  });
});
