/**
 * The referral search UI keeps client-side copies of curated option lists that live in server-only modules.
 * These checks keep them in sync, and confirm every request body the UI builds passes the routes' strict schemas.
 */
import { describe, expect, it } from "vitest";
import { PROVIDER_TAXONOMIES, PROVIDER_TYPES, ProvidersInput } from "@/server/integrations/nppes";
import { FACILITY_TYPES, TreatmentFacilitiesInput } from "@/server/integrations/findtreatment";
import { HealthCentersInput } from "@/server/integrations/hrsa";
import { RADIUS_MILES } from "@/server/integrations/referral-common";
import { DrugLabelInput } from "@/server/integrations/openfda";
import { RxNormInput } from "@/server/integrations/rxnorm";
import { MEDICATIONS } from "@/lib/schemas-medications";
import { FACILITY_TYPE_OPTIONS, PROVIDER_TYPE_OPTIONS, RADIUS_OPTIONS } from "@/components/referrals/search-options";
import { requestBody } from "@/components/referrals/referral-search";

describe("referral search options match the server", () => {
  it("provider types, labels and the Part 2 flag", () => {
    expect(PROVIDER_TYPE_OPTIONS.map((p) => p.id)).toEqual([...PROVIDER_TYPES]);
    for (const p of PROVIDER_TYPE_OPTIONS) {
      expect(p.label, p.id).toBe(PROVIDER_TAXONOMIES[p.id].label);
      expect(p.sud, p.id).toBe(PROVIDER_TAXONOMIES[p.id].part2 === true);
    }
  });
  it("facility types and radii", () => {
    expect(FACILITY_TYPE_OPTIONS.map((f) => f.id)).toEqual([...FACILITY_TYPES]);
    expect([...RADIUS_OPTIONS]).toEqual([...RADIUS_MILES]);
  });
  it("every request body the UI builds passes the strict route schema", () => {
    const zip = { zip: "20877" };
    const city = { city: "Gaithersburg", state: "MD" as const };
    for (const location of [zip, city]) {
      for (const providerType of PROVIDER_TYPES) {
        expect(() => ProvidersInput.parse(requestBody({ mode: "providers", location, providerType }, 40))).not.toThrow();
      }
      for (const radiusMiles of RADIUS_OPTIONS) {
        expect(() => HealthCentersInput.parse(requestBody({ mode: "health-centers", location, radiusMiles }))).not.toThrow();
        for (const facilityType of FACILITY_TYPES) {
          expect(() =>
            TreatmentFacilitiesInput.parse(requestBody({ mode: "treatment-facilities", location, facilityType, radiusMiles }, 3)),
          ).not.toThrow();
        }
      }
    }
  });
  it("medication pages send only the curated id, which both drug routes accept", () => {
    for (const m of MEDICATIONS) {
      expect(DrugLabelInput.parse({ drug: m.id }).drug, m.id).toBe(m.id);
      expect(RxNormInput.parse({ drug: m.id }).drug, m.id).toBe(m.id);
    }
  });
});
