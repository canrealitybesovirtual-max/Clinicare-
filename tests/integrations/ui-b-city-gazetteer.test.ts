/**
 * The browser's exact-city exception and the server's gazetteer check agree. For every (state, city) pair in
 * content/referrals/us-places.json that the PHI scrubber reads as a name (Austin, Charlotte, Madison, Jackson...),
 * the browser check accepts it under the canonical spelling, and the server's StrictLocation and outbound-param
 * guard accept exactly that value. A name plus a city never passes either side.
 */
import { describe, expect, it } from "vitest";
import places from "@content/referrals/us-places.json";
import { scrubPHI } from "@/lib/phi-scrubber";
import { checkLocation, loadPlaceIndex } from "@/components/referrals/location-check";
import { StrictLocation, safeParams } from "@/server/integrations/referral-common";

const states = (places as { states: Record<string, string> }).states;
const flagged = Object.entries(states).flatMap(([state, data]) =>
  data
    .split(";")
    .map((rec) => rec.slice(0, rec.lastIndexOf(":")))
    .filter((name) => /^[A-Za-z][A-Za-z .'-]*$/.test(name) && scrubPHI(name).findings.length > 0)
    .map((name) => ({ state, name })),
);

describe("exact gazetteer cities that the scrubber flags", () => {
  it("there are such cities (the reason for the exception)", () => {
    expect(flagged.length).toBeGreaterThan(100);
    expect(flagged).toContainEqual({ state: "TX", name: "Austin" });
    expect(flagged).toContainEqual({ state: "NC", name: "Charlotte" });
  });

  it("are accepted in the browser and on the server under the same canonical name", async () => {
    const index = await loadPlaceIndex();
    const mismatches: string[] = [];
    for (const { state, name } of flagged) {
      const browser = checkLocation("city", { zip: "", city: name, state }, index);
      if (!browser.ok || !("city" in browser.location)) {
        mismatches.push(`${name}, ${state}: browser refused`);
        continue;
      }
      const server = StrictLocation.safeParse(browser.location);
      const serverCity = server.success && "city" in server.data ? server.data.city : null;
      if (serverCity !== browser.location.city) {
        mismatches.push(`${name}, ${state}: server disagreed`);
        continue;
      }
      expect(() => safeParams({ city: serverCity }, [], ["city"])).not.toThrow();
    }
    expect(mismatches).toEqual([]);
  });

  it("a name added to a city is refused in the browser and by the server's PHI guard", async () => {
    const index = await loadPlaceIndex();
    for (const raw of ["Austin Smith", "Charlotte Brown", "Jackson 555-0100"]) {
      expect(checkLocation("city", { zip: "", city: raw, state: "TX" }, index).ok, raw).toBe(false);
      expect(() => safeParams({ city: raw })).toThrow();
    }
  });
});
