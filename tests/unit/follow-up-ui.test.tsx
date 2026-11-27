// @vitest-environment jsdom
/**
 * Symptom Finder wiring of the AI helpers (jsdom):
 * - "Help me ask more" runs on the scrubbed note with no network call, answers re-score locally and write
 *   duration into the Context step, and tap-to-add chips add symptoms;
 * - the blur-time identifier scrub waits for a pointer press to finish (no layout shift under the click);
 * - the Claude assistant panel exists only when the server enables it, needs a per-session opt-in, sends only the
 *   allowed fields (never the substance context), and is never rendered in client mode.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SessionProvider } from "@/state/session";
import { buildResourceCatalog } from "@/lib/follow-up/catalog";
import { SymptomFinder } from "@/components/symptoms/symptom-finder";
import { AssistantPanel, type AssistantStatus } from "@/components/ai/assistant-panel";
import { FollowUpPanel } from "@/components/ai/follow-up-panel";
import { useSymptomAnalysis } from "@/components/symptoms/analysis";

let pathname = "/symptoms";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const catalog = buildResourceCatalog();
const OFF: AssistantStatus = { enabled: false, model: null };
const ON: AssistantStatus = { enabled: true, model: "claude-opus-5-5" };
let calls: { url: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  pathname = "/symptoms";
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ ok: false, error: "The assistant is busy.", code: "rate-limited" }), { status: 429 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderFinder(assistant: AssistantStatus = OFF) {
  return render(
    <SessionProvider>
      <SymptomFinder catalog={catalog} assistant={assistant} />
    </SessionProvider>,
  );
}

async function describeNote(text: string) {
  const box = screen.getByLabelText(/^Symptoms and behaviors/);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.blur(box);
  // The step shows a placeholder until the scrubbed note is committed; wait for the questions.
  await waitFor(() => expect(screen.getByRole("heading", { name: /^Questions to ask next/ })).toBeTruthy());
  return screen.getByRole("region", { name: /Help me ask more/ });
}

describe('"Help me ask more" on the Symptom Finder', () => {
  it("shows the trigger, specific phobia as a pattern to consider and the first questions, with no network call", async () => {
    renderFinder();
    const panel = await describeNote("panic from dogs");
    expect(within(panel).getByText("For clinician review")).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "Specific phobia" })).toBeTruthy();
    expect(within(panel).getByText(/See DSM-5-TR: Anxiety Disorders/)).toBeTruthy();
    expect(within(panel).getByText("Do the attacks happen only around dogs, or also out of the blue?")).toBeTruthy();
    expect(within(panel).getByText("How did the fear of dogs begin?")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /Graded in-vivo exposure/ })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("answers re-score locally: symptoms come from the answer and duration lands in the Context step", async () => {
    renderFinder();
    const panel = await describeNote("panic from dogs");
    fireEvent.click(within(panel).getByRole("button", { name: "Only around dogs" }));
    fireEvent.click(within(panel).getByRole("button", { name: "6 months or longer" }));

    const included = screen.getByRole("region", { name: /Included for scoring/ });
    await waitFor(() => expect(within(included).getAllByText("From your answers").length).toBe(2));
    const duration = screen.getByRole("group", { name: "Duration" });
    expect((within(duration).getByRole("radio", { name: "6 months or longer" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole("link", { name: /^See possible diagnoses \(1\)/ }).length).toBeGreaterThan(0);

    // Changing an answer removes its effect and puts the untouched context field back.
    fireEvent.click(within(panel).getByRole("button", { name: /Change answer to: About how long/ }));
    await waitFor(() => expect((within(duration).getByRole("radio", { name: "Not recorded" }) as HTMLInputElement).checked).toBe(true));
    expect(calls).toEqual([]);
  });

  it("tap-to-add chips add the feature as a selected symptom", async () => {
    renderFinder();
    const panel = await describeNote("panic from dogs");
    fireEvent.click(within(panel).getByRole("button", { name: /Add symptom: Fear tied to one kind of thing or situation/ }));
    const included = screen.getByRole("region", { name: /Included for scoring/ });
    await waitFor(() => expect(within(included).getByRole("button", { name: /^Remove Fear tied to one kind/ })).toBeTruthy());
  });

  it("is hidden for clients under 18 (adult-only scope)", async () => {
    renderFinder();
    fireEvent.click(within(screen.getByRole("group", { name: "Client is under 18" })).getByRole("radio", { name: "Yes, under 18" }));
    fireEvent.change(screen.getByLabelText(/^Symptoms and behaviors/), { target: { value: "panic from dogs" } });
    fireEvent.blur(screen.getByLabelText(/^Symptoms and behaviors/));
    await waitFor(() => expect(screen.getByText(/1 symptom|0 symptoms/)).toBeTruthy());
    expect(screen.queryByRole("region", { name: /Help me ask more/ })).toBeNull();
  });
});

describe("blur-time scrub on the note", () => {
  it("waits for a pointer press to end, so a notice never moves the button being clicked", async () => {
    renderFinder();
    const box = screen.getByLabelText(/^Symptoms and behaviors/) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "panics on the bus, call 555-201-3344" } });
    fireEvent.pointerDown(document.body);
    fireEvent.blur(box);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Possible identifiers removed")).toBeNull();
    fireEvent.pointerUp(document.body);
    await waitFor(() => expect(screen.getByText("Possible identifiers removed")).toBeTruthy());
    expect(box.value).not.toContain("555-201-3344");
  });

  it("scrubs right after a keyboard blur", async () => {
    renderFinder();
    const box = screen.getByLabelText(/^Symptoms and behaviors/) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "call 555-201-3344" } });
    fireEvent.blur(box);
    await waitFor(() => expect(box.value).not.toContain("555-201-3344"));
  });
});

describe("Claude assistant panel", () => {
  it("is absent when the server has not enabled it (no teaser)", async () => {
    renderFinder(OFF);
    await describeNote("panic from dogs");
    expect(screen.queryByText(/AI assistant/)).toBeNull();
  });

  it("needs the per-session opt-in, then sends only curated fields on an explicit request", async () => {
    renderFinder(ON);
    const panel = await describeNote("worries about everything and cannot relax");
    fireEvent.click(within(screen.getByRole("group", { name: "Substance or medication could explain the symptoms" })).getByRole("radio", { name: "Yes" }));
    const toggle = within(panel).getByRole("switch", { name: "Ask the AI assistant (Claude)" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(within(panel).queryByRole("button", { name: /Ask for follow-up questions/ })).toBeNull();

    fireEvent.click(toggle);
    fireEvent.click(within(panel).getByRole("button", { name: "Ask for follow-up questions" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe("/api/assistant");
    const body = calls[0]!.body;
    expect(Object.keys(body).sort()).toEqual(
      ["answered", "candidateConditionIds", "duration", "impairment", "lang", "medicalPossible", "optIn", "symptomIds", "text"].sort(),
    );
    expect(body.optIn).toBe(true);
    expect(body).not.toHaveProperty("substancePossible");
    await waitFor(() => expect(within(panel).getByText(/Wait a minute/)).toBeTruthy());
  });

  it("never sends a note with substance-use content", async () => {
    renderFinder(ON);
    const panel = await describeNote("drinks every night to sleep, cannot cut down, shakes in the morning");
    fireEvent.click(within(panel).getByRole("switch", { name: "Ask the AI assistant (Claude)" }));
    expect(within(panel).getByText(/Not sent: substance use/)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: /Ask for follow-up questions/ })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("renders nothing in client mode, even if mounted there", () => {
    pathname = "/client/topics";
    function Probe() {
      const analysis = useSymptomAnalysis();
      return (
        <FollowUpPanel analysis={analysis} catalog={catalog}>
          <AssistantPanel status={ON} analysis={analysis} />
        </FollowUpPanel>
      );
    }
    const { container } = render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(container.innerHTML).toBe("");
  });
});
