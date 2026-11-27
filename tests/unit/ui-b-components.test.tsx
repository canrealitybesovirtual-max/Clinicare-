// @vitest-environment jsdom
/**
 * UI-B interaction tests (jsdom): referral location search (exact request bodies, PHI-scrubbed city, error, retry,
 * link-out and paging states), medication live panels (boxed warning first, attribution, disclaimer, 429 / not
 * configured / offline), the local medication search, and the show/hide facet filter.
 * Every request goes to our own /api routes and carries only curated values plus a ZIP or city/state.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionProvider } from "@/state/session";
import { ReferralSearchProvider, SearchPresetButton } from "@/components/referrals/search-context";
import { ReferralSearch } from "@/components/referrals/referral-search";
import { DrugLabelPanel, RxNormPanel } from "@/components/medications/live-panels";
import { MedicationBrowser } from "@/components/medications/medication-browser";
import { toListItem } from "@/components/medications/medication-labels";
import { MEDICATIONS, MEDICATION_CATEGORIES, MEDICATION_CATEGORY_LABELS } from "@/lib/schemas-medications";
import { FacetFilterProvider, FacetGate, FacetSelect } from "@/components/ethics/facet-filter";
import { ALL } from "@/components/ethics/facet-index";

type Reply = { status: number; body: unknown } | "offline";
let replies: Reply[] = [];
let calls: { url: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  replies = [];
  calls = [];
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      const next = replies.shift() ?? { status: 500, body: { ok: false, error: "no reply", code: "upstream" } };
      if (next === "offline") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const finder = {
  url: "https://npiregistry.cms.hhs.gov/search",
  label: "Search the NPI Registry (CMS)",
  instructions: "In the NPI Registry, enter a taxonomy.",
  publisher: "CMS",
};

function provider(npi: string, name: string) {
  return {
    npi,
    kind: "individual",
    displayName: name,
    credential: "MD",
    taxonomy: { code: "2084P0800X", description: "Psychiatry & Neurology, Psychiatry", primary: true, state: "MD" },
    address: { line: "1 Main St", city: "Gaithersburg", state: "MD", zip5: "20877" },
    phone: "301-555-0100",
    lastUpdated: "2026-01-02",
    registryUrl: `https://npiregistry.cms.hhs.gov/provider-view/${npi}`,
  };
}

function providersOk(results: unknown[], nextSkip: number | null, part2Notice: string | null = null) {
  return {
    status: 200,
    body: {
      ok: true,
      attribution: "Data: CMS NPPES NPI Registry. Listing is not an endorsement.",
      source: "https://npiregistry.cms.hhs.gov/",
      data: {
        providerType: "psychiatrist",
        providerLabel: "Psychiatrist (MD/DO)",
        taxonomyCodes: [],
        location: "ZIP 20877",
        results,
        nextSkip,
        notice: "Public NPI Registry records.",
        part2Notice,
        finder,
      },
    },
  };
}

function renderSearch() {
  return render(
    <SessionProvider>
      <ReferralSearchProvider>
        <ReferralSearch sudPrompt={<p>SUD HUB PROMPT</p>} />
        <SearchPresetButton preset={{ mode: "providers", providerType: "psychiatric-np" }} label="Providers: Psychiatric NP">
          Search psychiatric NPs
        </SearchPresetButton>
      </ReferralSearchProvider>
    </SessionProvider>,
  );
}

const zipInput = () => screen.getByLabelText("ZIP code");
const search = () => fireEvent.click(screen.getByRole("button", { name: "Search" }));

describe("referral location search", () => {
  it("sends exactly the curated provider type and the ZIP, and shows results with attribution", async () => {
    replies.push(providersOk([provider("1234567890", "Pat Example, MD")], null));
    renderSearch();
    fireEvent.change(zipInput(), { target: { value: "20877" } });
    search();
    await screen.findByText("Pat Example, MD");
    expect(calls).toEqual([{ url: "/api/providers", body: { providerType: "psychiatrist", location: { zip: "20877" }, limit: 20, skip: 0 } }]);
    expect(screen.getByText("Listing is not an endorsement — call to confirm.")).toBeTruthy();
    expect(screen.getByText("Data: CMS NPPES NPI Registry. Listing is not an endorsement.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /301-555-0100/ }).getAttribute("href")).toBe("tel:3015550100");
    expect(screen.getByRole("status").textContent).toMatch(/Showing 1 result/);
  });

  it("keeps the ZIP field to five digits and refuses an incomplete ZIP without calling the API", () => {
    renderSearch();
    fireEvent.change(zipInput(), { target: { value: "20a87-7" } });
    expect((zipInput() as HTMLInputElement).value).toBe("20877");
    fireEvent.change(zipInput(), { target: { value: "208" } });
    search();
    expect(calls).toHaveLength(0);
    expect(screen.getByText("Enter a 5-digit US ZIP code.")).toBeTruthy();
    expect(zipInput().getAttribute("aria-invalid")).toBe("true");
  });

  it("never sends a city the PHI scrubber flags (planted identifiers stay on the device)", async () => {
    renderSearch();
    fireEvent.click(screen.getByLabelText("By city and state"));
    const city = screen.getByLabelText("City");
    fireEvent.change(city, { target: { value: "John Smith 555-867-5309" } });
    fireEvent.change(screen.getByLabelText("State or territory"), { target: { value: "TX" } });
    search();
    expect(calls).toHaveLength(0);
    expect(await screen.findByText(/looked like it might be a name or other identifier/)).toBeTruthy();
    await waitFor(() => expect((city as HTMLInputElement).value).not.toMatch(/John|555/));
    expect(JSON.stringify(calls)).not.toMatch(/John|Smith|867/);
  });

  it("sends a valid city with its state", async () => {
    replies.push(providersOk([], null));
    renderSearch();
    fireEvent.click(screen.getByLabelText("By city and state"));
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Gaithersburg" } });
    fireEvent.change(screen.getByLabelText("State or territory"), { target: { value: "MD" } });
    search();
    await screen.findByText("No listings found");
    expect(calls[0]!.body.location).toEqual({ city: "Gaithersburg", state: "MD" });
  });

  it("pages with nextSkip and appends results", async () => {
    replies.push(providersOk([provider("1111111111", "First Provider, MD")], 20));
    replies.push(providersOk([provider("2222222222", "Second Provider, MD")], null));
    renderSearch();
    fireEvent.change(zipInput(), { target: { value: "20877" } });
    search();
    await screen.findByText("First Provider, MD");
    fireEvent.click(screen.getByRole("button", { name: "Show more results" }));
    await screen.findByText("Second Provider, MD");
    expect(screen.getByText("First Provider, MD")).toBeTruthy();
    expect(calls[1]!.body.skip).toBe(20);
    expect(screen.queryByRole("button", { name: "Show more results" })).toBeNull();
  });

  it("offers a retry after a rate limit", async () => {
    replies.push({ status: 429, body: { ok: false, error: "Rate limit reached, try again shortly", code: "rate-limited" } });
    replies.push(providersOk([provider("1234567890", "Pat Example, MD")], null));
    renderSearch();
    fireEvent.change(zipInput(), { target: { value: "20877" } });
    search();
    await screen.findByText("Too many searches in a short time");
    expect(screen.getByRole("link", { name: /Search the NPI Registry \(CMS\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Pat Example, MD");
    expect(calls).toHaveLength(2);
  });

  it("shows the official finder and the SAMHSA helpline when FindTreatment is not configured, with the SUD prompt", async () => {
    replies.push({ status: 503, body: { ok: false, error: "FindTreatment.gov facility search is not configured on this server", code: "not-configured" } });
    renderSearch();
    fireEvent.click(screen.getByLabelText("Treatment facilities"));
    fireEvent.change(screen.getByLabelText("Type of treatment"), { target: { value: "substance-use" } });
    expect(screen.getAllByText("SUD HUB PROMPT").length).toBeGreaterThan(0);
    fireEvent.change(zipInput(), { target: { value: "20877" } });
    search();
    await screen.findByText("Live search is not available on this server");
    expect(calls[0]).toEqual({
      url: "/api/treatment-facilities",
      body: { location: { zip: "20877" }, facilityType: "substance-use", radiusMiles: 25, page: 1, pageSize: 20 },
    });
    expect(screen.getByRole("link", { name: /Search FindTreatment.gov \(SAMHSA\)/ }).getAttribute("href")).toBe("https://findtreatment.gov/");
    expect(screen.getByRole("link", { name: "1-800-662-4357" }).getAttribute("href")).toBe("tel:18006624357");
    expect(screen.getAllByText("SUD HUB PROMPT").length).toBe(2);
  });

  it("explains offline state and suggests a ZIP for an unrecognized city", async () => {
    replies.push("offline");
    replies.push({ status: 400, body: { ok: false, error: "Invalid input", code: "invalid" } });
    renderSearch();
    fireEvent.change(zipInput(), { target: { value: "20877" } });
    search();
    await screen.findByText("You appear to be offline");
    fireEvent.click(screen.getByLabelText("By city and state"));
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Notaplace" } });
    fireEvent.change(screen.getByLabelText("State or territory"), { target: { value: "MD" } });
    search();
    await screen.findByText("That location was not recognized");
    expect(screen.getByText(/enter a 5-digit ZIP code instead/)).toBeTruthy();
  });

  it("presets the provider type from elsewhere on the page and moves focus to the location", async () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: /Search psychiatric NPs/ }));
    expect((screen.getByLabelText("Provider type") as HTMLSelectElement).value).toBe("psychiatric-np");
    await waitFor(() => expect(document.activeElement).toBe(zipInput()));
    expect(screen.getByRole("status").textContent).toMatch(/Search set to Providers: Psychiatric NP/);
  });
});

function labelOk(boxedWarning: string | null) {
  return {
    status: 200,
    body: {
      ok: true,
      attribution: "Data from openFDA (U.S. FDA). Not for prescribing decisions; consult the full prescribing information.",
      source: "https://open.fda.gov/apis/drug/label/",
      data: {
        drug: "fluoxetine",
        medicationId: "fluoxetine",
        found: true,
        matchedBy: "reference-brand",
        brandNames: ["Prozac"],
        genericName: "FLUOXETINE",
        routes: ["ORAL"],
        applicationNumber: "NDA018936",
        boxedWarning,
        indications: "Indicated for several conditions.",
        warningsAndCautions: "Serotonin syndrome.",
        contraindications: "MAOIs.",
        effectiveTime: "2025-03-01",
        setId: null,
        dailyMedUrl: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=fluoxetine",
        trimmed: true,
      },
    },
  };
}

describe("medication live panels", () => {
  const dm = "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=fluoxetine";

  it("loads the label for the curated id only and shows the boxed warning first, with date, attribution and disclaimer", async () => {
    replies.push(labelOk("SUICIDAL THOUGHTS AND BEHAVIORS"));
    const { container } = render(<DrugLabelPanel drug="fluoxetine" name="Fluoxetine" dailyMedSearchUrl={dm} />);
    await screen.findByText("SUICIDAL THOUGHTS AND BEHAVIORS");
    expect(calls).toEqual([{ url: "/api/drug-label", body: { drug: "fluoxetine" } }]);
    const text = container.textContent ?? "";
    expect(text.indexOf("Boxed warning")).toBeLessThan(text.indexOf("Indications and usage"));
    expect(text).toContain("2025-03-01");
    expect(text).toContain("Data from openFDA (U.S. FDA).");
    expect(screen.getAllByText("Not for prescribing decisions; consult the full prescribing information.").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Full prescribing information on DailyMed/ })).toBeTruthy();
    expect(text).toMatch(/shortened/);
  });

  it("retries after 429 and links out to DailyMed when not configured", async () => {
    replies.push({ status: 429, body: { ok: false, error: "Rate limit reached, try again shortly", code: "rate-limited" } });
    replies.push({ status: 503, body: { ok: false, error: "openFDA drug label lookup is not configured on this server", code: "not-configured" } });
    render(<DrugLabelPanel drug="fluoxetine" name="Fluoxetine" dailyMedSearchUrl={dm} />);
    await screen.findByText("Too many lookups right now");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Live lookup is not available on this server");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("link", { name: /Search DailyMed for Fluoxetine/ }).getAttribute("href")).toBe(dm);
  });

  it("shows RxNorm brands and classes, or the offline state with RxNav and DailyMed links", async () => {
    replies.push({
      status: 200,
      body: {
        ok: true,
        attribution: "This product uses publicly available data courtesy of the U.S. National Library of Medicine (NLM).",
        source: "https://lhncbc.nlm.nih.gov/RxNav/",
        data: {
          drug: "fluoxetine",
          medicationId: "fluoxetine",
          queryName: "fluoxetine",
          found: true,
          rxcui: "4493",
          matchesCurated: true,
          brands: [
            { name: "Prozac", combination: false },
            { name: "Symbyax", combination: true },
          ],
          classes: [{ id: "N06AB", name: "Selective serotonin reuptake inhibitors", type: "ATC", source: "ATC" }],
          links: { rxnav: "https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=4493", dailyMedSearch: dm, medlinePlus: [] },
        },
      },
    });
    const first = render(<RxNormPanel drug="fluoxetine" name="Fluoxetine" curatedRxcui="4493" rxNavUrl={null} dailyMedSearchUrl={dm} />);
    await screen.findByText("Prozac");
    expect(screen.getByText("Symbyax")).toBeTruthy();
    expect(screen.getByText(/Selective serotonin reuptake inhibitors/)).toBeTruthy();
    expect(screen.getByText(/courtesy of the U.S. National Library of Medicine/)).toBeTruthy();
    first.unmount();

    replies.push("offline");
    render(<RxNormPanel drug="fluoxetine" name="Fluoxetine" curatedRxcui="4493" rxNavUrl="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=4493" dailyMedSearchUrl={dm} />);
    await screen.findByText("You appear to be offline");
    expect(screen.getByRole("link", { name: /Open Fluoxetine in RxNav/ })).toBeTruthy();
  });
});

describe("medication browser (local search, scrubbed)", () => {
  it("filters by brand after the scrubber commits, and by category", async () => {
    render(
      <SessionProvider>
        <MedicationBrowser
          items={MEDICATIONS.map(toListItem)}
          categories={MEDICATION_CATEGORIES.map((id) => ({ id, label: MEDICATION_CATEGORY_LABELS[id] }))}
        />
      </SessionProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe(`Showing ${MEDICATIONS.length} of ${MEDICATIONS.length} medications`);
    fireEvent.change(screen.getByLabelText("Search by generic or brand name"), { target: { value: "zoloft" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(`Showing 1 of ${MEDICATIONS.length} medications`));
    expect(screen.getByRole("link", { name: /Sertraline/ }).getAttribute("href")).toBe("/medications/sertraline");
    expect(calls).toHaveLength(0); // nothing typed is sent anywhere
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "aud" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(`Showing 5 of ${MEDICATIONS.length} medications`));
  });
});

describe("facet filter", () => {
  const index = { g: { color: { red: ["a"], blue: ["b"] } } };
  function Harness() {
    return (
      <FacetFilterProvider index={index} items={{ g: ["a", "b"] }}>
        <FacetSelect
          facet="color"
          label="Color"
          options={[
            { value: ALL, label: "All" },
            { value: "red", label: "Red" },
            { value: "blue", label: "Blue" },
          ]}
        />
        <a href="#b">Go to B</a>
        <FacetGate group="g" id="a">
          <p id="a">Item A</p>
        </FacetGate>
        <FacetGate group="g" id="b">
          <p id="b">Item B</p>
        </FacetGate>
      </FacetFilterProvider>
    );
  }
  it("hides non-matching items and clears the filter when a link targets a hidden item", async () => {
    render(<Harness />);
    const parentOf = (t: string) => screen.getByText(t).parentElement!;
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "red" } });
    expect(parentOf("Item B").hidden).toBe(true);
    expect(parentOf("Item A").hidden).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Go to B" }));
    });
    expect(parentOf("Item B").hidden).toBe(false);
    expect((screen.getByLabelText("Color") as HTMLSelectElement).value).toBe(ALL);
  });
});
