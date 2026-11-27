// @vitest-environment jsdom
/**
 * Formulation screens in jsdom: axe structural checks (colour contrast is covered by the e2e suite), the worksheet
 * prefilled from the live session without writing back to it, scrubbed notes, ?template= preselection, linked
 * interventions labeled for clinician review, the Part 2 notice, and the copy with one blank Client line.
 */
import * as React from "react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider } from "@/lib/i18n/core";
import { SessionProvider, useSession, type SessionState } from "@/state/session";
import FormulationsPage from "@/app/(clinician)/formulations/page";
import FormulationPage from "@/app/(clinician)/formulations/[id]/page";
import FormulationBuilderPage from "@/app/(clinician)/formulations/builder/page";
import { SCRUB_DEBOUNCE_MS } from "@/components/symptoms/use-scrubbed-field";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";

let query = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/formulations",
  useSearchParams: () => new URLSearchParams(query),
  notFound: () => {
    throw new Error("not found");
  },
}));

afterEach(() => {
  cleanup();
  query = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const h = React.createElement;
let session: SessionState | null = null;

/** Records the live session and, when given a seed, fills it before the page mounts (as earlier screens would). */
function Seeded({ seed, children }: { seed?: (s: ReturnType<typeof useSession>) => void; children?: React.ReactNode }) {
  const ctx = useSession();
  session = ctx.state;
  const [ready, setReady] = React.useState(!seed);
  React.useEffect(() => {
    if (ready || !seed) return;
    seed(ctx);
    setReady(true);
  }, [ready, seed, ctx]);
  return ready ? h(React.Fragment, null, children) : null;
}

function renderPage(page: React.ReactElement, seed?: (s: ReturnType<typeof useSession>) => void) {
  return render(h(LangProvider, null, h(SessionProvider, null, h("main", null, h(Seeded, { seed }, page)))));
}

async function axeViolations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const detail = (id: string) => FormulationPage({ params: Promise.resolve({ id }) });

describe("axe structural checks", () => {
  it.each([
    ["index", async () => h(FormulationsPage)],
    ["5 Ps detail", () => detail("five-ps-biopsychosocial-spiritual")],
    ["process map detail", () => detail("transdiagnostic-process-map")],
    ["co-occurring detail", () => detail("co-occurring-and-level-of-care")],
    ["dimensional personality detail", () => detail("dimensional-personality")],
    ["worksheet", async () => h(FormulationBuilderPage)],
  ])("%s has no violations and one h1", async (_name, make) => {
    const { container } = renderPage(await make());
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("framework pages", () => {
  it("the index links every framework and the worksheet", () => {
    renderPage(h(FormulationsPage));
    expect(screen.getAllByRole("link", { name: /Open the worksheet/ })[0]!.getAttribute("href")).toBe("/formulations/builder");
    expect(screen.getByRole("link", { name: /Minority stress formulation/ }).getAttribute("href")).toBe("/formulations/minority-stress");
  });

  it("a Part 2 framework shows the exact notice; trained-only models say so", async () => {
    renderPage(await detail("co-occurring-and-level-of-care"));
    expect(screen.getAllByText(new RegExp(DOC_PART2_NOTICE.replace(/\./g, "\\."))).length).toBeGreaterThan(0);
    cleanup();
    renderPage(await detail("psychodynamic-ccrt"));
    expect(screen.getAllByText("Trained clinicians only").length).toBeGreaterThan(0);
  });

  it("reference codes carry the DSM-5-TR pointer and a not-a-diagnosis note", async () => {
    renderPage(await detail("dimensional-personality"));
    expect(screen.getByText("6D11.5")).toBeTruthy();
    expect(screen.getByText(/See DSM-5-TR/)).toBeTruthy();
    expect(screen.getByText(/Not a diagnosis; the worksheet and client copies never/)).toBeTruthy();
  });
});

describe("worksheet", () => {
  const seed = (s: ReturnType<typeof useSession>) => {
    s.toggleSymptom("worry-excessive");
    for (let i = 0; i < 7; i++) s.answer("gad-7", i, 2, 7);
  };

  it("prefills documented symptoms and measure bands from the session and never writes back", () => {
    renderPage(h(FormulationBuilderPage), seed);
    const before = JSON.stringify(session);
    const gad = screen.getByRole("button", { name: /GAD-7 total 14 of 21/ });
    expect(gad.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(gad);
    expect(gad.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Avoidance and escape" }));
    expect(JSON.stringify(session)).toBe(before);
  });

  it("lists linked interventions for clinician review with what they are linked to", () => {
    renderPage(h(FormulationBuilderPage));
    expect(screen.getByText(/Tap factors or functions above/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Safety behaviors" }));
    expect(screen.getAllByText("For clinician review").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Safety-behavior reduction/ })).toBeTruthy();
    expect(screen.getAllByText(/Linked to:/).length).toBeGreaterThan(0);
  });

  it("scrubs identifiers out of a typed note", () => {
    vi.useFakeTimers();
    renderPage(h(FormulationBuilderPage));
    const field = screen.getByLabelText("Our working explanation") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Call Maria Lopez at 555-301-2299" } });
    act(() => vi.advanceTimersByTime(SCRUB_DEBOUNCE_MS + 10));
    expect(field.value).not.toMatch(/301-2299/);
    expect(field.value).toContain("[PHONE]");
  });

  it("preselects a worksheet framework from ?template= and ignores anything else", () => {
    query = "template=functional-analysis";
    renderPage(h(FormulationBuilderPage));
    expect((screen.getByRole("radio", { name: "Functional analysis" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Escape or avoidance" })).toBeTruthy();
    cleanup();
    query = "template=dimensional-personality";
    renderPage(h(FormulationBuilderPage));
    expect((screen.getByRole("radio", { name: "5 Ps grid" }) as HTMLInputElement).checked).toBe(true);
  });

  it("copies one blank Client line, the disclaimer and, when ticked, the Part 2 notice", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderPage(h(FormulationBuilderPage));
    fireEvent.click(screen.getByRole("checkbox", { name: /Substance use is part of this formulation/ }));
    expect(screen.getByText(/Every copy and export of this worksheet carries the notice/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy text/ }));
    });
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied.match(/^Client: _+$/gm)?.length).toBe(1);
    expect(copied).toContain("Resource only. Not a substitute for clinical judgment.");
    expect(copied).toContain(DOC_PART2_NOTICE);
  });
});
