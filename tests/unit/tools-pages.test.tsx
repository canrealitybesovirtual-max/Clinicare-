// @vitest-environment jsdom
/**
 * Tool screens in jsdom: axe structural checks (colour contrast cannot be measured here; the e2e suite covers it),
 * identifiers scrubbed out of typed fields, the note prefilled from the live session (read-only), the trend table,
 * the practice sandbox leaving the session untouched, and the client Calm page in Spanish with reduced motion.
 */
import * as React from "react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LangProvider, useLang } from "@/lib/i18n/core";
import { SessionProvider, useSession, type SessionState } from "@/state/session";
import ToolsPage from "@/app/(clinician)/tools/page";
import NoteToolPage from "@/app/(clinician)/tools/note/page";
import TrendToolPage from "@/app/(clinician)/tools/trend/page";
import SafetyPlanToolPage from "@/app/(clinician)/tools/safety-plan/page";
import SessionToolPage from "@/app/(clinician)/tools/session/page";
import ReferralLetterToolPage from "@/app/(clinician)/tools/referral-letter/page";
import PracticeToolPage from "@/app/(clinician)/tools/practice/page";
import CalmPage from "@/app/(client)/client/calm/page";
import { TOOLS } from "@/components/tools/catalog";
import { SCRUB_DEBOUNCE_MS } from "@/components/symptoms/use-scrubbed-field";

vi.mock("next/navigation", () => ({ usePathname: () => "/tools" }));

let reduceMotion = false;
beforeEach(() => {
  reduceMotion = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("reduce") ? reduceMotion : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

let session: SessionState | null = null;
/** Records the live session and, when given a seed, fills it before the page mounts (as earlier screens would). */
function Seeded({ seed, children }: { seed?: (s: ReturnType<typeof useSession>) => void; children: React.ReactNode }) {
  const ctx = useSession();
  session = ctx.state;
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

describe("axe structural checks", () => {
  it.each([
    ["tools index", <ToolsPage key="i" />],
    ["note", <NoteToolPage key="n" />],
    ["trend", <TrendToolPage key="t" />],
    ["safety plan", <SafetyPlanToolPage key="s" />],
    ["session timer", <SessionToolPage key="f" />],
    ["referral letter", <ReferralLetterToolPage key="r" />],
    ["practice", <PracticeToolPage key="p" />],
    ["client calm", <CalmPage key="c" />],
  ])("%s has no violations and one h1", async (_name, page) => {
    const { container } = renderPage(page);
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("tools index", () => {
  it("lists every tool with one plain-language line", () => {
    renderPage(<ToolsPage />);
    for (const t of TOOLS) expect(screen.getByRole("link", { name: new RegExp(t.title) })).toHaveProperty("href", expect.stringContaining(t.href));
  });
});

describe("scrubbing typed text", () => {
  it("safety plan: a typed name and phone number never stay in the field", () => {
    vi.useFakeTimers();
    renderPage(<SafetyPlanToolPage />);
    const field = screen.getByLabelText(/Early signs/) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Call Maria Lopez at 555-301-2299" } });
    act(() => vi.advanceTimersByTime(SCRUB_DEBOUNCE_MS + 10));
    expect(field.value).not.toMatch(/301-2299/);
    expect(field.value).toContain("[PHONE]");
    expect(screen.getByText("Possible identifiers removed")).toBeTruthy();
  });

  it("referral letter: the optional note is scrubbed", () => {
    vi.useFakeTimers();
    renderPage(<ReferralLetterToolPage />);
    const field = screen.getByLabelText(/Short note/) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "email jo@example.com" } });
    act(() => vi.advanceTimersByTime(SCRUB_DEBOUNCE_MS + 10));
    expect(field.value).toBe("email [EMAIL]");
  });
});

describe("note helper", () => {
  it("prefills from the session and never writes back to it", () => {
    renderPage(<NoteToolPage />, (s) => {
      s.toggleSymptom("worry-excessive");
      for (let i = 0; i < 7; i++) s.answer("gad-7", i, 2, 7);
    });
    const before = JSON.stringify(session);
    const subjective = screen.getByLabelText("Subjective") as HTMLTextAreaElement;
    expect(subjective.value).toContain("Presenting concerns documented this session:");
    expect((screen.getByLabelText("Objective") as HTMLTextAreaElement).value).toContain("GAD-7 total 14 of 21 (Moderate anxiety range).");
    expect((screen.getByLabelText("Assessment") as HTMLTextAreaElement).value).toContain("Clinical impressions (clinician to complete):");
    fireEvent.change(subjective, { target: { value: "Edited in the note only." } });
    fireEvent.blur(subjective);
    fireEvent.click(screen.getByRole("radio", { name: "DAP" }));
    expect((screen.getByLabelText("Data") as HTMLTextAreaElement).value).toContain("GAD-7 total 14 of 21");
    expect(JSON.stringify(session)).toBe(before);
  });

  it("copies the note as plain text with one Client line", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderPage(<NoteToolPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy text/ }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied.match(/^Client: _+$/gm)?.length).toBe(1);
    expect(copied).toContain("Resource only. Not a substitute for clinical judgment.");
  });
});

describe("trend", () => {
  it("adds totals by session number and shows them in the table", () => {
    renderPage(<TrendToolPage />);
    fireEvent.click(screen.getByRole("radio", { name: "PHQ-9" }));
    const add = (s: string, t: string) => {
      fireEvent.change(screen.getByLabelText("Session #"), { target: { value: s } });
      fireEvent.change(screen.getByLabelText(/PHQ-9 total/), { target: { value: t } });
      fireEvent.click(screen.getByRole("button", { name: /Add to trend/ }));
    };
    add("1", "18");
    add("4", "8");
    const table = screen.getByRole("table");
    expect(within(table).getByText("#4")).toBeTruthy();
    expect(within(table).getByText("Response · Down 5+ points")).toBeTruthy();
    add("5", "40");
    expect(screen.getByRole("alert").textContent).toMatch(/Total must be a whole number from 0 to 27/);
  });
});

describe("practice", () => {
  it("runs the fictional case in a sandbox and leaves the live session alone", () => {
    renderPage(<PracticeToolPage />);
    const before = JSON.stringify(session);
    fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getAllByText("For clinician review").length).toBeGreaterThan(0);
    expect(JSON.stringify(session)).toBe(before);
  });
});

describe("client calm", () => {
  function SpanishCalm() {
    const { setLang } = useLang();
    React.useEffect(() => setLang("es"), [setLang]);
    return <CalmPage />;
  }

  it("shows a text countdown instead of the animation under reduced motion, in Spanish", () => {
    reduceMotion = true;
    renderPage(<SpanishCalm />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Calme su cuerpo");
    expect(screen.getByText("Pulse Empezar cuando esté listo o lista")).toBeTruthy();
    expect(document.querySelector(".rounded-full.border-accent")).toBeNull();
    expect(screen.getByText("¿Necesita ayuda ahora mismo?")).toBeTruthy();
  });

  it("animates the breathing circle when motion is allowed", () => {
    renderPage(<CalmPage />);
    expect(document.querySelector(".rounded-full.border-accent")).not.toBeNull();
  });
});
