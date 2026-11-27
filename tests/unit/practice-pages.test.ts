// @vitest-environment jsdom
/**
 * Practice guide screens and the two practice tools in jsdom: axe structural checks (colour contrast is covered by
 * the e2e suite), the on-device guide search, the crisis panel and Part 2 notice on a guide that needs them, the goal
 * writer's preview and scrubbing, and the option grid's client view, which never names the condition.
 */
import * as React from "react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LangProvider } from "@/lib/i18n/core";
import { SessionProvider } from "@/state/session";
import { getCondition } from "@/lib/content";
import { PART2_NOTICE } from "@/lib/practice";
import PracticeGuidesPage from "@/app/(clinician)/practice/page";
import PracticeGuidePage from "@/app/(clinician)/practice/[id]/page";
import GoalsToolPage from "@/app/(clinician)/tools/goals/page";
import OptionGridPage from "@/app/(clinician)/tools/option-grid/page";
import { SCRUB_DEBOUNCE_MS } from "@/components/symptoms/use-scrubbed-field";

vi.mock("next/navigation", () => ({
  usePathname: () => "/practice",
  useSearchParams: () => new URLSearchParams(""),
  notFound: () => {
    throw new Error("not found");
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const h = React.createElement;
const renderPage = (page: React.ReactElement) => render(h(LangProvider, null, h(SessionProvider, null, h("main", null, page))));
const detail = (id: string) => PracticeGuidePage({ params: Promise.resolve({ id }) });

async function axeViolations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("axe structural checks", () => {
  it.each([
    ["practice index", () => Promise.resolve(h(PracticeGuidesPage))],
    ["practice guide", () => detail("intake-assessment")],
    ["goal writer", () => Promise.resolve(h(GoalsToolPage))],
    ["option grid", () => Promise.resolve(h(OptionGridPage))],
  ])("%s has no structural violations", async (_name, make) => {
    const { container } = renderPage(await make());
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("practice index", () => {
  it("filters guides on this device as you type", () => {
    vi.useFakeTimers();
    renderPage(h(PracticeGuidesPage));
    const search = screen.getByLabelText("Search the guides");
    fireEvent.change(search, { target: { value: "interpreter" } });
    act(() => vi.advanceTimersByTime(SCRUB_DEBOUNCE_MS + 50));
    expect(screen.getByRole("link", { name: /Working with interpreters/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Goal attainment scaling/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/of \d+ guides match/);
  });
});

describe("practice guide page", () => {
  it("shows the clinician review label, the crisis resources and the Part 2 notice when the guide needs them", async () => {
    renderPage(await detail("intake-assessment"));
    expect(screen.getAllByText("For clinician review").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "If safety is a concern now" })).toBeTruthy();
    expect(screen.getByText(PART2_NOTICE)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Example wording" })).toBeTruthy();
  });

  it("links to its tool and leaves out the crisis panel and Part 2 notice when not needed", async () => {
    renderPage(await detail("goals-by-orientation"));
    expect(screen.getByRole("link", { name: /Open the goal writer/ }).getAttribute("href")).toBe("/tools/goals");
    expect(screen.queryByRole("heading", { name: "If safety is a concern now" })).toBeNull();
    expect(screen.queryByText(PART2_NOTICE)).toBeNull();
  });

  it("refuses an unknown guide", async () => {
    await expect(detail("not-a-guide")).rejects.toThrow("not found");
  });
});

describe("goal writer", () => {
  it("builds the goal sentence from the boxes and scrubs identifiers", () => {
    vi.useFakeTimers();
    renderPage(h(GoalsToolPage));
    fireEvent.change(screen.getByLabelText("Behavior"), { target: { value: "walk with Dr. Smith, call 555-123-4567" } });
    act(() => vi.advanceTimersByTime(SCRUB_DEBOUNCE_MS + 50));
    expect(screen.getByText("Possible identifiers removed")).toBeTruthy();
    const preview = screen.getByRole("heading", { name: "Preview" }).parentElement!;
    expect(preview.textContent).not.toMatch(/555-123-4567/);
    fireEvent.change(screen.getByLabelText("Review at session number"), { target: { value: "8" } });
    expect(preview.textContent).toMatch(/reviewed at session 8\./);
    expect(within(screen.getByRole("list", { name: "SMART check" })).getByText(/Time-bound/).textContent).toMatch(/present/);
    fireEvent.click(screen.getByRole("button", { name: /Add to the goal list/ }));
    expect(screen.getByText(/Goal 1\./)).toBeTruthy();
  });

  it("shows how the chosen orientation writes goals", () => {
    renderPage(h(GoalsToolPage));
    fireEvent.change(screen.getByLabelText("How goals are written"), { target: { value: "act" } });
    expect(screen.getByText(/^ACT:/)).toBeTruthy();
    expect(screen.getByLabelText("Committed action")).toBeTruthy();
  });
});

describe("option grid", () => {
  it("compares library options and the client view never names the condition", () => {
    renderPage(h(OptionGridPage));
    const condition = getCondition("major-depressive-disorder")!;
    fireEvent.change(screen.getByLabelText("Possible condition under discussion"), { target: { value: condition.id } });
    const options = screen.getByRole("group", { name: "Options from the library" });
    const boxes = within(options).getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    expect(screen.getByRole("heading", { name: /Compare/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Client view" }));
    const main = document.querySelector("main")!;
    expect(screen.getByRole("heading", { name: "Comparing your options" })).toBeTruthy();
    expect(main.textContent).not.toContain(condition.name);
    expect(main.textContent).not.toMatch(/F3\d|6A7\d|depress/i);
  });
});
