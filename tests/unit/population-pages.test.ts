// @vitest-environment jsdom
/**
 * Population adaptation screens in jsdom: axe structural checks (colour contrast is covered by the e2e suite), the
 * index groups and links every profile, a profile page shows the ask-do-not-assume notice, the For clinician review
 * label, the crisis resources and, for substance-use wording, the 42 CFR Part 2 notice; and the adaptations panel
 * for /interventions/[id] renders only when a profile has a note for that intervention.
 */
import * as React from "react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { LangProvider } from "@/lib/i18n/core";
import { SessionProvider } from "@/state/session";
import { PART2_NOTICE, getPopulation, populations } from "@/lib/populations";
import PopulationsPage from "@/app/(clinician)/populations/page";
import PopulationPage from "@/app/(clinician)/populations/[id]/page";
import { PopulationNotesPanel } from "@/components/populations/population-notes-panel";

vi.mock("next/navigation", () => ({
  usePathname: () => "/populations",
  useSearchParams: () => new URLSearchParams(""),
  notFound: () => {
    throw new Error("not found");
  },
}));

afterEach(() => cleanup());

const h = React.createElement;
const renderPage = (page: React.ReactElement) => render(h(LangProvider, null, h(SessionProvider, null, h("main", null, page))));
const detail = (id: string) => PopulationPage({ params: Promise.resolve({ id }) });

async function axeViolations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("axe structural checks", () => {
  it.each([
    ["population index", () => Promise.resolve(h(PopulationsPage))],
    ["profile with Part 2 notice", () => detail("justice-involved")],
    ["profile with link-out measures", () => detail("older-adults")],
    ["adaptations panel", () => Promise.resolve(h(PopulationNotesPanel, { interventionId: "behavioral-activation" }))],
  ])("%s has no structural violations", async (_name, make) => {
    const { container } = renderPage(await make());
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("population index", () => {
  it("links every profile once, under its group heading", () => {
    renderPage(h(PopulationsPage));
    for (const p of populations) expect(screen.getAllByRole("link", { name: p.name }).length, p.id).toBe(1);
    expect(screen.getByText("Ask, do not assume")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Life stages" })).toBeTruthy();
  });
});

describe("population profile page", () => {
  it("shows the questions, review label, scope note and crisis resources", async () => {
    renderPage(await detail("perinatal"));
    const p = getPopulation("perinatal")!;
    expect(screen.getByRole("heading", { level: 1, name: p.name })).toBeTruthy();
    expect(screen.getAllByText("For clinician review").length).toBeGreaterThan(0);
    expect(screen.getByText(p.askAbout[0]!)).toBeTruthy();
    expect(screen.getByText(p.scopeNote)).toBeTruthy();
    const safety = screen.getByRole("heading", { level: 2, name: "Safety" }).closest("section")!;
    expect(within(safety).getAllByText(/988|emergency/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(PART2_NOTICE)).toBeNull();
    // The link-out measure is a plain external link, never a built-in form.
    expect(screen.getByRole("link", { name: /Edinburgh Postnatal Depression Scale/ }).getAttribute("href")).toMatch(/^https:\/\/pubmed/);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
  });

  it("shows the Part 2 notice when the wording touches substance use", async () => {
    renderPage(await detail("justice-involved"));
    const notice = screen.getByText("Substance-use content").closest("div")!.parentElement!;
    expect(within(notice).getByText(PART2_NOTICE)).toBeTruthy();
  });

  it("links each adaptation to its intervention or orientation page", async () => {
    renderPage(await detail("military-and-veterans"));
    const section = screen.getByRole("heading", { level: 2, name: "Adapting interventions" }).closest("section")!;
    expect(within(section).getByRole("link", { name: /Cognitive processing therapy/i }).getAttribute("href")).toBe("/interventions/cognitive-processing-therapy");
    expect(within(section).getByRole("link", { name: /\(orientation\)/ }).getAttribute("href")).toBe("/orientations/trauma-focused-therapies");
  });

  it("rejects unknown ids", async () => {
    await expect(detail("not-a-profile")).rejects.toThrow("not found");
  });
});

describe("adaptations panel", () => {
  it("lists the profiles with a note for the intervention, and renders nothing otherwise", () => {
    const { container } = renderPage(h(PopulationNotesPanel, { interventionId: "cbti-sleep-restriction" }));
    expect(within(container).getByRole("link", { name: getPopulation("perinatal")!.name }).getAttribute("href")).toBe("/populations/perinatal");
    cleanup();
    const empty = renderPage(h(PopulationNotesPanel, { interventionId: "not-an-intervention" }));
    expect(empty.container.querySelector("main")!.children.length).toBe(0);
  });
});
