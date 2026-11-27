// @vitest-environment jsdom
/**
 * Safety-care screens in jsdom: axe structural checks (colour contrast is covered by the e2e suite), one h1 each,
 * tick-box behavior, the Part 2 notice, identifiers scrubbed out of typed fields, and the comparison view working
 * only from the session's own suggestions.
 */
import * as React from "react";
import axe from "axe-core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "@/lib/i18n/core";
import { SessionProvider, useSession } from "@/state/session";
import { SCRUB_DEBOUNCE_MS } from "@/components/symptoms/use-scrubbed-field";
import PrecautionsToolPage from "@/app/(clinician)/tools/precautions/page";
import ReleaseOfInformationPage from "@/app/(clinician)/tools/release-of-information/page";
import AccommodationLetterPage from "@/app/(clinician)/tools/accommodation-letter/page";
import CareTransitionPage from "@/app/(clinician)/tools/care-transition/page";
import CompareConsiderationsPage from "@/app/(clinician)/diagnoses/compare/page";
import MedicationEffectsPage from "@/app/(clinician)/medications/effects/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/tools", useSearchParams: () => new URLSearchParams() }));

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Seeded({ seed, children }: { seed?: (s: ReturnType<typeof useSession>) => void; children: React.ReactNode }) {
  const ctx = useSession();
  const [ready, setReady] = React.useState(!seed);
  React.useEffect(() => {
    if (ready || !seed) return;
    seed(ctx);
    setReady(true);
  }, [ready, seed, ctx]);
  return ready ? <>{children}</> : null;
}

function renderPage(page: React.ReactElement, seed?: (s: ReturnType<typeof useSession>) => void) {
  return render(
    <LangProvider>
      <SessionProvider>
        <main>
          <Seeded seed={seed}>{page}</Seeded>
        </main>
      </SessionProvider>
    </LangProvider>,
  );
}

async function axeViolations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/** Worry plus low mood, documented with duration and impairment: several considerations come up. */
const seedMixed = (s: ReturnType<typeof useSession>) => {
  for (const id of ["worry-excessive", "worry-hard-to-control", "depressed-mood", "anhedonia", "insomnia", "fatigue", "muscle-tension"]) s.toggleSymptom(id);
  s.set({ duration: "gte6m", impairment: "yes", substancePossible: "no", medicalPossible: "no" });
};

describe("axe structural checks", () => {
  it.each([
    ["precautions", () => <PrecautionsToolPage />, undefined],
    ["release of information", () => <ReleaseOfInformationPage />, undefined],
    ["accommodation letter", () => <AccommodationLetterPage />, undefined],
    ["care transition", () => <CareTransitionPage />, undefined],
    ["compare (empty session)", () => <CompareConsiderationsPage />, undefined],
    ["compare (seeded)", () => <CompareConsiderationsPage />, seedMixed],
    ["medication effects", () => <MedicationEffectsPage />, undefined],
  ] as const)("%s has no violations and one h1", async (_name, page, seed) => {
    const { container } = renderPage(page(), seed);
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("precautions", () => {
  it("shows notes only for ticked context, with the review label and a filter", () => {
    renderPage(<PrecautionsToolPage />);
    expect(screen.getByText("For clinician review")).toBeTruthy();
    expect(screen.queryAllByText(/CBT-I: Sleep restriction/)).toHaveLength(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "History of mania or hypomania" }));
    const section = screen.getByRole("region", { name: "History of mania or hypomania" });
    expect(within(section).getAllByText(/CBT-I: Sleep restriction/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Show notes for"), { target: { value: "bright-light-therapy" } });
    expect(within(section).queryAllByText(/CBT-I: Sleep restriction/)).toHaveLength(0);
    expect(within(section).getAllByText(/Bright light therapy/).length).toBeGreaterThan(0);
  });
});

describe("release of information", () => {
  it("Part 2 records show the consent points and the notice; the limits field is scrubbed", () => {
    vi.useFakeTimers();
    renderPage(<ReleaseOfInformationPage />);
    expect(screen.queryByText("42 CFR Part 2 consent")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Substance use disorder treatment records/ }));
    expect(screen.getByText("42 CFR Part 2 consent")).toBeTruthy();
    expect(screen.getAllByText(/42 CFR Part 2 prohibits unauthorized use or disclosure of these records\./).length).toBeGreaterThan(0);
    const field = screen.getByLabelText(/Limits/) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "summaries only, email jo@example.com" } });
    act(() => vi.advanceTimersByTime(SCRUB_DEBOUNCE_MS + 10));
    expect(field.value).toBe("summaries only, email [EMAIL]");
  });

  it("copies a form with blank identifier lines and the disclaimer", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderPage(<ReleaseOfInformationPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy text/ }));
    });
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toMatch(/^Client name: _+$/m);
    expect(copied).toMatch(/^Signature: _+$/m);
    expect(copied).toContain("Resource only. Not a substitute for clinical judgment.");
  });

  it("psychotherapy notes switch to their own form", () => {
    renderPage(<ReleaseOfInformationPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Psychotherapy notes" }));
    expect(screen.getByText("Psychotherapy notes form")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Diagnoses and diagnostic codes/ })).toBeNull();
  });
});

describe("accommodation letter", () => {
  it("marks related changes for ticked limitations", () => {
    renderPage(<AccommodationLetterPage />);
    const quiet = screen.getByRole("checkbox", { name: /A quieter space/ });
    expect(within(quiet.closest("label")!).queryByText("Related")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /noisy, busy or crowded/ }));
    expect(within(quiet.closest("label")!).getByText("Related")).toBeTruthy();
  });
});

describe("care transition", () => {
  it("counts ticked steps and shows the Part 2 notice only for Part 2 records", () => {
    renderPage(<CareTransitionPage />);
    expect(screen.getByText(/0 of \d+ steps ticked/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Safety plan reviewed or made together/ }));
    expect(screen.getByText(/1 of \d+ steps ticked/)).toBeTruthy();
    expect(screen.queryByText(/Part 2 records are being shared/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Substance use disorder records from a Part 2 program/ }));
    expect(screen.getByText(/Part 2 records are being shared/)).toBeTruthy();
  });
});

describe("compare considerations", () => {
  it("says there is nothing to compare in an empty session", () => {
    renderPage(<CompareConsiderationsPage />);
    expect(screen.getByText("Nothing to compare yet")).toBeTruthy();
  });

  it("compares the first two suggestions, allows a third and stops at three", () => {
    renderPage(<CompareConsiderationsPage />, seedMixed);
    expect(screen.getByRole("heading", { name: "Key features" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Questions that help tell them apart" })).toBeTruthy();
    expect(screen.getAllByText(/See DSM-5-TR/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/the diagnosis is/i)).toBeNull();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.filter((b) => b.checked)).toHaveLength(2);
    const unchecked = boxes.filter((b) => !b.checked);
    if (unchecked.length >= 2) {
      fireEvent.click(unchecked[0]!);
      expect(boxes.filter((b) => b.checked)).toHaveLength(3);
      fireEvent.click(unchecked[1]!);
      expect(boxes.filter((b) => b.checked)).toHaveLength(3);
      expect(screen.getByRole("status").textContent).toMatch(/Up to 3 at a time/);
    }
  });
});
