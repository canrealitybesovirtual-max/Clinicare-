// @vitest-environment jsdom
/**
 * Governance screens in jsdom: the report form has no free-text field and its link carries only the chosen item and
 * reason, the report and changelog pages render with axe structural checks, and the quick exit clears the session,
 * leaves without a history entry and gives the tab a neutral title (en/es).
 */
import * as React from "react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider, useLang } from "@/lib/i18n/core";
import { SessionProvider, useSession } from "@/state/session";
import { ReportForm, type ReportGroup } from "@/app/about/report/report-form";
import ReportPage from "@/app/about/report/page";
import ChangelogPage from "@/app/about/changelog/page";
import { CHANGELOG } from "@/app/about/changelog/entries";
import { DISCREET_TITLE, DiscreetBrowsingTips, QUICK_EXIT_URL, QuickExitButton } from "@/components/layout/quick-exit";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function axeViolations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const groups: ReportGroup[] = [
  { type: "handout", label: "Client handout", items: [{ ref: "handout/worry-log", title: "Worry log" }] },
  { type: "measure", label: "Built-in measure", items: [{ ref: "measure/phq-9", title: "PHQ-9" }] },
];

describe("report form", () => {
  it("has no text field and links with only the chosen item and reason", () => {
    const { container } = render(<ReportForm groups={groups} destination={{ kind: "email", address: "content@example.org" }} />);
    expect(container.querySelectorAll("textarea, input:not([type=radio])")).toHaveLength(0);
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.change(screen.getByLabelText("2. Item"), { target: { value: "handout/worry-log" } });
    fireEvent.click(screen.getByLabelText(/Out of date/));
    const link = screen.getByRole("link", { name: /Open an email with this report/ });
    const u = new URL(link.getAttribute("href")!);
    expect(u.searchParams.get("subject")).toBe("Content report: handout/worry-log");
    expect(u.searchParams.get("body")).toMatch(/^Item: handout\/worry-log\r\nReason: outdated\r\n/);
  });

  it("starts on the item a page linked with and clears the item when the kind changes", () => {
    render(<ReportForm groups={groups} destination={null} initialRef="measure/phq-9" />);
    expect((screen.getByLabelText("1. Kind of content") as HTMLSelectElement).value).toBe("measure");
    expect((screen.getByLabelText("2. Item") as HTMLSelectElement).value).toBe("measure/phq-9");
    fireEvent.change(screen.getByLabelText("1. Kind of content"), { target: { value: "handout" } });
    expect((screen.getByLabelText("2. Item") as HTMLSelectElement).value).toBe("");
  });

  it("explains where to send the reference when no destination is configured", () => {
    render(<ReportForm groups={groups} destination={null} />);
    expect(screen.getByText(/No report address is set up/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("report and changelog pages", () => {
  it("renders the report page, ignores an unknown ?item and uses the configured address", async () => {
    vi.stubEnv("CONTENT_REPORT_EMAIL", "content@example.org");
    const ui = await ReportPage({ searchParams: Promise.resolve({ item: "handout/<not-real>" }) });
    const { container } = render(ui);
    expect(screen.getByRole("heading", { level: 1, name: "Report a content problem" })).toBeTruthy();
    expect((screen.getByLabelText("2. Item") as HTMLSelectElement).value).toBe("");
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("renders every changelog entry under its date", async () => {
    const { container } = render(<ChangelogPage />);
    for (const e of CHANGELOG) expect(screen.getAllByRole("heading", { level: 3, name: e.title }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toContain("November 27, 2026");
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("quick exit", () => {
  function Probe() {
    const { state, set } = useSession();
    const { setLang } = useLang();
    return (
      <div>
        <p data-testid="text">{state.symptomText}</p>
        <button type="button" onClick={() => set({ symptomText: "worry most days" })}>
          seed
        </button>
        <button type="button" onClick={() => setLang("es")}>
          es
        </button>
      </div>
    );
  }

  it("is a real link to a neutral page that also clears the session, with a neutral tab title", () => {
    document.title = "Safety in relationships";
    render(
      <LangProvider>
        <SessionProvider>
          <Probe />
          <QuickExitButton />
          <DiscreetBrowsingTips />
        </SessionProvider>
      </LangProvider>,
    );
    expect(document.title).toBe(DISCREET_TITLE.en);
    fireEvent.click(screen.getByRole("button", { name: "seed" }));
    expect(screen.getByTestId("text").textContent).toBe("worry most days");

    const exit = screen.getByRole("link", { name: "Quick exit" });
    expect(exit.getAttribute("href")).toBe(QUICK_EXIT_URL);
    // jsdom does not navigate; it reports location.replace as not implemented.
    vi.spyOn(console, "error").mockImplementation(() => {});
    fireEvent.click(exit);
    expect(screen.getByTestId("text").textContent).toBe("");

    act(() => fireEvent.click(screen.getByRole("button", { name: "es" })));
    expect(document.title).toBe(DISCREET_TITLE.es);
    expect(screen.getByRole("link", { name: "Salida rápida" })).toBeTruthy();
    expect(screen.getByText(/911 en EE. UU./)).toBeTruthy();
  });
});
