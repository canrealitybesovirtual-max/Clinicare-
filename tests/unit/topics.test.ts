/**
 * content/topics.json for client mode: every topic's handoutIds (the "skills to try" on its page) are real library
 * handouts, listed once, with safety handouts on crisis topics; the schema rejects bad lists; the plain-language
 * groups place every topic exactly once, crisis topics first; client labels exist in English and Spanish and name
 * no diagnosis (G3).
 */
import { describe, expect, it } from "vitest";
import topicsJson from "@content/topics.json";
import { allConditions, allHandouts } from "@/lib/library";
import { HealthTopicSchema, HealthTopicsFileSchema } from "@/lib/schemas-topics";
import { CLIENT_TOPICS, groupClientTopics } from "@/components/client/topics";

const file = HealthTopicsFileSchema.parse(topicsJson);
const handoutIds = new Set(allHandouts.map((h) => h.id));

describe("topic handouts (content/topics.json handoutIds)", () => {
  it("lists only handouts that exist in content/handouts, at least one per topic", () => {
    for (const t of file.topics) {
      expect(t.handoutIds.length, t.id).toBeGreaterThan(0);
      for (const id of t.handoutIds) expect(handoutIds.has(id), `${t.id} -> ${id}`).toBe(true);
    }
  });

  it("offers the safety plan on every crisis topic", () => {
    const crisis = file.topics.filter((t) => t.crisis && t.id !== "relationship-safety");
    expect(crisis.length).toBeGreaterThan(0);
    for (const t of crisis) expect(t.handoutIds, t.id).toContain("safety-plan");
  });

  it("keeps the substance-use sheets on substance-use topics (tobacco may use the urge log and quit plan)", () => {
    const sudHandouts = new Set(allHandouts.filter((h) => h.sud).map((h) => h.id));
    // Tobacco is outside 42 CFR Part 2: any non-SUD topic may link the urge log, and the quitting topic its quit plan.
    const allowed = (topicId: string, id: string) => id === "urge-surfing-log" || (topicId === "quitting-smoking" && id === "my-quit-tobacco-plan");
    for (const t of file.topics) {
      if (t.sud) continue;
      const sud = t.handoutIds.filter((id) => sudHandouts.has(id) && !allowed(t.id, id));
      expect(sud, t.id).toEqual([]);
    }
  });

  it("offers only client handouts with a Spanish version, so every topic works in both languages", () => {
    const byId = new Map(allHandouts.map((h) => [h.id, h]));
    for (const t of file.topics)
      for (const id of t.handoutIds) {
        expect(byId.get(id)?.audience, `${t.id} -> ${id}`).toBe("client");
        expect(byId.get(id)?.es, `${t.id} -> ${id}`).toBeTruthy();
      }
  });

  it("includes the population topics (round 4) with plain MedlinePlus pages", () => {
    const ids = new Set(file.topics.map((t) => t.id));
    for (const id of ["racism-and-discrimination-stress", "work-stress", "living-with-pain", "college-life", "money-and-housing-stress", "sexual-health", "disability-and-wellbeing"])
      expect(ids.has(id), id).toBe(true);
    for (const t of file.topics) {
      expect(t.pages.en, t.id).toMatch(/^https:\/\/medlineplus\.gov\/[a-z]+\.html$/);
      expect(t.pages.es, t.id).toMatch(/^https:\/\/medlineplus\.gov\/spanish\/[a-z]+\.html$/);
    }
  });

  it("reaches the client topic model unchanged", () => {
    for (const t of file.topics) expect(CLIENT_TOPICS.find((c) => c.id === t.id)?.handoutIds).toEqual(t.handoutIds);
  });

  it("is checked by the schema: slugs only, no duplicates, at most 6, empty when absent", () => {
    const base = file.topics[0];
    if (!base) throw new Error("no topics");
    const raw = { ...base, handoutIds: undefined };
    expect(HealthTopicSchema.parse(raw).handoutIds).toEqual([]);
    for (const bad of [["pmr-homework", "pmr-homework"], ["Not A Slug"], ["a", "b", "c", "d", "e", "f", "g"], [""]]) {
      expect(HealthTopicSchema.safeParse({ ...base, handoutIds: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("client topic groups", () => {
  const { crisis, groups } = groupClientTopics();

  it("places every topic exactly once, crisis topics first and only there", () => {
    const placed = [...crisis, ...groups.flatMap((g) => g.topics)].map((t) => t.id);
    expect([...placed].sort()).toEqual(CLIENT_TOPICS.map((t) => t.id).sort());
    expect(new Set(placed).size).toBe(placed.length);
    expect(crisis.every((t) => t.crisis)).toBe(true);
    expect(groups.flatMap((g) => g.topics).some((t) => t.crisis)).toBe(false);
  });

  it("has English and Spanish group labels", () => {
    for (const g of groups) {
      expect(g.label.en.length, g.id).toBeGreaterThan(2);
      expect(g.label.es?.length, g.id).toBeGreaterThan(2);
    }
  });
});

describe("client topic labels (G3)", () => {
  // Labels name experiences ("Panic attacks", "Trouble sleeping"), never a condition, code or score.
  const forbidden = /disorder|trastorno|diagn[oó]s|\bscore|puntuaci|severity|gravedad|\bF\d\d|\b6[A-E]\d\d\b/i;
  const conditionNames = allConditions.map((c) => c.name.toLowerCase());

  it("exist in both languages and name no diagnosis", () => {
    for (const t of CLIENT_TOPICS) {
      expect(t.label.es, t.id).toBeTruthy();
      for (const label of [t.label.en, t.label.es ?? ""]) {
        expect(label, t.id).not.toMatch(forbidden);
        for (const name of conditionNames) expect(label.toLowerCase(), `${t.id}: ${name}`).not.toContain(name);
      }
    }
  });
});
