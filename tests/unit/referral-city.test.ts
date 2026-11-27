// @vitest-environment jsdom
/**
 * Referral City field: cities that are also first names (Austin, Charlotte, Madison, Jackson) pass when the whole
 * field is exactly a city in the bundled gazetteer for the chosen state, and the canonical spelling is what gets
 * sent. Anything else the scrubber flags (a name plus a city, a phone number, a placeholder) still never leaves.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { scrubPHI } from "@/lib/phi-scrubber";
import { SessionProvider } from "@/state/session";
import { ReferralSearchProvider } from "@/components/referrals/search-context";
import { ReferralSearch } from "@/components/referrals/referral-search";
import {
  IDENTIFIER_MESSAGE,
  buildPlaceIndex,
  checkLocation,
  gazetteerCity,
  loadPlaceIndex,
  type PlaceIndex,
} from "@/components/referrals/location-check";

const city = (name: string, state: string, places: PlaceIndex | null) => checkLocation("city", { zip: "", city: name, state }, places);

describe("gazetteer index", () => {
  it("indexes names only, per state and across states", () => {
    const idx = buildPlaceIndex({ TX: "Austin:30.27,-97.74;San Antonio:29.42,-98.49", NC: "Charlotte:35.23,-80.84" });
    expect(gazetteerCity("austin", idx, "TX")).toBe("Austin");
    expect(gazetteerCity("  san   antonio ", idx, "TX")).toBe("San Antonio");
    expect(gazetteerCity("Charlotte", idx)).toBe("Charlotte");
    expect(gazetteerCity("Charlotte", idx, "TX")).toBeNull();
    expect(gazetteerCity("Austin Smith", idx, "TX")).toBeNull();
    expect(gazetteerCity("30.27", idx)).toBeNull();
  });

  it("loads the real gazetteer once", async () => {
    const a = await loadPlaceIndex();
    expect(a).toBe(await loadPlaceIndex());
    for (const [name, state] of [["Austin", "TX"], ["Charlotte", "NC"], ["Madison", "WI"], ["Jackson", "MS"]] as const) {
      expect(gazetteerCity(name, a, state), `${name}, ${state}`).toBe(name);
    }
  });
});

describe("checkLocation with the gazetteer", () => {
  let places: PlaceIndex;
  beforeEach(async () => {
    places = await loadPlaceIndex();
  });

  it("these cities are read as first names by the scrubber (why the exception exists)", () => {
    for (const name of ["Austin", "Charlotte", "Madison", "Jackson"]) expect(scrubPHI(name).findings.length, name).toBeGreaterThan(0);
  });

  it("accepts an exact gazetteer city in the chosen state and sends the canonical spelling", () => {
    expect(city("Austin", "TX", places)).toEqual({ ok: true, location: { city: "Austin", state: "TX" } });
    expect(city("  Charlotte ", "NC", places)).toEqual({ ok: true, location: { city: "Charlotte", state: "NC" } });
    expect(city("Madison", "WI", places)).toEqual({ ok: true, location: { city: "Madison", state: "WI" } });
    expect(city("Jackson", "MS", places)).toEqual({ ok: true, location: { city: "Jackson", state: "MS" } });
  });

  it("asks for the state, or says the city is not in that state", () => {
    expect(city("Charlotte", "", places)).toMatchObject({ ok: false, field: "state" });
    const r = city("Charlotte", "AK", places);
    expect(r).toMatchObject({ ok: false, field: "city" });
    expect(r.ok ? "" : r.message).toMatch(/not listed as a city in that state/);
  });

  it("still refuses anything else the scrubber flags", () => {
    for (const raw of ["Austin Smith", "Charlotte 555-867-5309", "John Smith", "[NAME]", "Madison W", "jane.doe@example.com"]) {
      expect(city(raw, "TX", places), raw).toMatchObject({ ok: false, field: "city", identifier: true, message: IDENTIFIER_MESSAGE });
    }
  });

  it("without the gazetteer, a flagged city is refused as before", () => {
    expect(city("Austin", "TX", null)).toMatchObject({ ok: false, identifier: true });
  });

  it("an unflagged city is unchanged (the server checks it against the same gazetteer)", () => {
    expect(city("Gaithersburg", "MD", places)).toEqual({ ok: true, location: { city: "Gaithersburg", state: "MD" } });
  });
});

/* ------------------------------------------------------------------ the search form */

let calls: { url: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  calls = [];
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ ok: false, error: "no reply", code: "upstream" }), { status: 502 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSearch() {
  render(
    React.createElement(
      SessionProvider,
      null,
      React.createElement(ReferralSearchProvider, null, React.createElement(ReferralSearch, { sudPrompt: null })),
    ),
  );
  fireEvent.click(screen.getByLabelText("By city and state"));
}

describe("referral search form", () => {
  it("keeps Austin in the field on blur and sends it with its state", async () => {
    renderSearch();
    const input = screen.getByLabelText("City") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Austin" } });
    fireEvent.blur(input);
    fireEvent.change(screen.getByLabelText("State or territory"), { target: { value: "TX" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body.location).toEqual({ city: "Austin", state: "TX" });
    expect(input.value).toBe("Austin");
  });

  it("scrubs a name typed with the city and sends nothing", async () => {
    renderSearch();
    const input = screen.getByLabelText("City") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Austin Smith" } });
    fireEvent.change(screen.getByLabelText("State or territory"), { target: { value: "TX" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(IDENTIFIER_MESSAGE)).toBeTruthy();
    await waitFor(() => expect(input.value).not.toMatch(/Austin|Smith/));
    expect(calls).toHaveLength(0);
  });

  it("shows the removed-identifier notice below both location fields after blur", async () => {
    renderSearch();
    const input = screen.getByLabelText("City") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Call 555-867-5309" } });
    fireEvent.blur(input);
    const notice = await screen.findByText(/Possible identifier removed from the city/);
    expect(notice.closest('[role="alert"]')).not.toBeNull();
    // The notice comes after the State select in the document, so it cannot push the select down.
    const select = screen.getByLabelText("State or territory");
    expect(select.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.value).not.toMatch(/555/);
  });
});
