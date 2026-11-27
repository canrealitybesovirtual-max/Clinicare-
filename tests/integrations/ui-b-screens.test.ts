// @vitest-environment jsdom
/**
 * UI-B screens, round 3 (jsdom):
 * - Interventions: ?condition=<id> pre-filters the library (curated ids only), with a "Show all conditions" reset;
 *   list review badges are neutral; the phone filter toggle reports how many filters are on.
 * - Ethics & Legal Hub: card bodies render only once their disclosure is opened, every #id anchor and the exact
 *   Part 2 wording are in the server HTML, and the page stays light.
 * - Plan builder: a friendly empty state, the step list with progress, and no change of step on select input.
 * - Measures: the "track over sessions" link to /tools/trend appears only once a score is complete.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

import { SessionProvider } from "@/state/session";
import { ethicsCodes, legalTopics } from "@/lib/library";
import { measures } from "@/lib/content";
import { PART2_NOTICE } from "@/lib/referral-links";
import InterventionsPage from "@/app/(clinician)/interventions/page";
import EthicsPage from "@/app/(clinician)/ethics/page";
import PlanPage from "@/app/(clinician)/plan/page";
import { EthicsCodeCard, LegalTopicCard } from "@/components/ethics/hub-cards";
import { MeasureForm } from "@/components/measures/measure-form";

const h = React.createElement;
const inSession = (el: React.ReactElement) => h(SessionProvider, null, el);

beforeEach(() => {
  search = "";
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

/* ------------------------------------------------------------------ interventions */

describe("/interventions", () => {
  const resultCount = () => screen.getByRole("status").textContent ?? "";

  it("pre-filters by a curated ?condition= id and offers a reset", async () => {
    search = "condition=generalized-anxiety-disorder";
    render(inSession(h(InterventionsPage)));
    const select = screen.getByLabelText("Condition") as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("generalized-anxiety-disorder"));
    const [shown, total] = resultCount().match(/\d+/g)!.map(Number);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total!);
    expect(screen.getByText(/^For$/, { exact: false }).textContent).toMatch(/Generalized anxiety disorder/i);
    // Phones: the folded filter panel says one filter is on.
    expect(screen.getByRole("button", { name: /Filters/ }).textContent).toMatch(/1 on/);

    fireEvent.click(screen.getByRole("button", { name: "Show all conditions" }));
    expect(select.value).toBe("");
    expect(resultCount()).toMatch(new RegExp(`Showing ${total} of ${total}`));
    expect(document.activeElement?.id).toBe("results-heading");
  });

  it("ignores an unknown or free-text condition", async () => {
    search = "condition=jane%20doe";
    render(inSession(h(InterventionsPage)));
    await act(async () => {});
    expect((screen.getByLabelText("Condition") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Show all conditions" })).toBeNull();
  });

  it("shows review status as a neutral badge in the list, with one page-level summary", () => {
    render(inSession(h(InterventionsPage)));
    const badges = screen.getAllByText("Not yet clinically reviewed");
    expect(badges.length).toBeGreaterThan(0);
    for (const b of badges) expect(b.className).not.toMatch(/warn/);
    expect(screen.getByText(/interventions are awaiting licensed clinical review/)).toBeTruthy();
  });

  it("has a friendly empty state whose reset puts focus back in the search box", async () => {
    render(inSession(h(InterventionsPage)));
    const box = screen.getByLabelText("Search by name or purpose");
    fireEvent.change(box, { target: { value: "zzzz qqqq" } });
    fireEvent.blur(box);
    await screen.findByText("No interventions match yet.");
    const clear = screen.getAllByRole("button", { name: "Clear search and filters" });
    fireEvent.click(clear[clear.length - 1]!);
    expect(document.activeElement).toBe(box);
    expect(resultCount()).toMatch(/Showing (\d+) of \1/);
  });
});

/* ------------------------------------------------------------------ ethics */

describe("/ethics", () => {
  const page = renderToString(inSession(h(EthicsPage)));

  it("keeps every anchor and the exact Part 2 wording in the server HTML, without the card bodies", () => {
    for (const c of ethicsCodes) expect(page, c.id).toContain(`id="${c.id}"`);
    for (const t of legalTopics) expect(page, t.id).toContain(`id="${t.id}"`);
    expect(page.toLowerCase()).toContain(PART2_NOTICE.toLowerCase());
    const reminder = ethicsCodes[0]!.keyReminders[0]!.text;
    expect(page).not.toContain(reminder);
    expect(page.length).toBeLessThan(320_000);
  });

  it("renders a code's reminders only after its disclosure opens", async () => {
    const code = ethicsCodes.find((c) => c.keyReminders.length > 0)!;
    render(h(EthicsCodeCard, { code }));
    const reminder = code.keyReminders[0]!.text;
    expect(screen.queryByText(reminder, { exact: false })).toBeNull();
    const details = screen.getByText("Key reminders and your regulator").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText(reminder, { exact: false })).toBeTruthy();
    expect(screen.getByText(code.regulatorNote, { exact: false })).toBeTruthy();
  });

  it("renders a legal topic's key points and sources on demand", async () => {
    const topic = legalTopics[0]!;
    render(h(LegalTopicCard, { topic }));
    expect(screen.queryByText(topic.keyPoints[0]!)).toBeNull();
    for (const title of ["Key points, what to do and official sources", "Sources and review"]) {
      const details = screen.getByText(title).closest("details")!;
      details.open = true;
      fireEvent(details, new Event("toggle"));
    }
    expect(await screen.findByText(topic.keyPoints[0]!)).toBeTruthy();
    expect(screen.getByText(topic.sources[0]!.title)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ plan builder */

describe("/plan", () => {
  it("starts with a short guide and moves one step at a time", async () => {
    render(inSession(h(PlanPage)));
    expect(screen.getByText("How the builder works")).toBeTruthy();
    expect(screen.queryByLabelText("Go to step")).toBeNull();
    const step = screen.getByRole("region", { name: /^Step 1 of 8/ });
    fireEvent.change(screen.getByLabelText("Plan library"), { target: { value: "generalized-anxiety-disorder" } });
    await screen.findByText(/Plan library: /);
    fireEvent.click(within(step).getByRole("button", { name: /^Next: Problems/ }));
    expect(screen.getByRole("region", { name: /^Step 2 of 8/ })).toBeTruthy();
    // The current step is marked in both step lists (wide row and the phone disclosure).
    const current = screen.getAllByRole("button", { current: "step" });
    expect(current.length).toBe(2);
    for (const b of current) expect(b.textContent).toMatch(/Problems/);
  });
});

/* ------------------------------------------------------------------ measures */

describe("measure form", () => {
  it("links to the trend tool once every item is answered", () => {
    const m = measures.find((x) => x.id === "gad-7")!;
    render(inSession(h(MeasureForm, { measure: m, cssrsUrl: "https://cssrs.columbia.edu" })));
    expect(screen.queryByRole("link", { name: /over sessions/ })).toBeNull();
    m.items.forEach((item, i) => {
      const group = screen.getByRole("group", { name: new RegExp(`^Item ${i + 1} of`) });
      fireEvent.click(within(group).getAllByRole("radio")[0]!);
    });
    const link = screen.getByRole("link", { name: `Track the ${m.shortName} over sessions` });
    expect(link.getAttribute("href")).toBe(`/tools/trend?measure=${m.id}`);
  });
});
