// @vitest-environment jsdom
/**
 * Idle timing (G5 + WCAG 2.2.1 Timing Adjustable): the session warns one minute before the 15-minute idle wipe,
 * "Keep working" (extend) re-arms the timer, and the wipe clears the memory-only state. Fake timers only.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IDLE_MS, IDLE_WARNING_MS, SessionProvider, useSession } from "@/state/session";
import { PrivacyBar } from "@/components/layout/privacy-bar";

function Probe() {
  const { state, set, idleWarning, idleCleared } = useSession();
  return (
    <div>
      <p data-testid="text">{state.symptomText}</p>
      <p data-testid="warning">{String(idleWarning)}</p>
      <p data-testid="cleared">{String(idleCleared)}</p>
      <button type="button" onClick={() => set({ symptomText: "worry most days" })}>
        seed
      </button>
    </div>
  );
}

function setup() {
  render(
    <SessionProvider>
      <PrivacyBar />
      <Probe />
    </SessionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "seed" }));
  expect(screen.getByTestId("text").textContent).toBe("worry most days");
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("idle warning and wipe", () => {
  it("warns at 14:00 with a Keep working button and wipes at 15:00", () => {
    setup();
    expect(IDLE_MS - IDLE_WARNING_MS).toBe(14 * 60 * 1000);

    advance(IDLE_MS - IDLE_WARNING_MS - 1000);
    expect(screen.getByTestId("warning").textContent).toBe("false");
    expect(screen.queryByRole("button", { name: "Keep working" })).toBeNull();

    advance(1000); // 14:00
    expect(screen.getByTestId("warning").textContent).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("For privacy, this session clears in 60 seconds.");
    expect(alert.textContent).not.toContain("worry"); // never repeats typed text
    expect(screen.getByRole("button", { name: "Keep working" })).toBeTruthy();
    expect(screen.getByTestId("text").textContent).toBe("worry most days");

    advance(IDLE_WARNING_MS); // 15:00
    expect(screen.getByTestId("text").textContent).toBe("");
    expect(screen.getByTestId("warning").textContent).toBe("false");
    expect(screen.getByTestId("cleared").textContent).toBe("true");
    expect(screen.queryByRole("button", { name: "Keep working" })).toBeNull();
  });

  it("Keep working re-arms the timer for another full 15 minutes", () => {
    setup();
    advance(IDLE_MS - IDLE_WARNING_MS); // warning showing
    // Call extend() through the button handler without a pointer event, so only extend() re-arms.
    act(() => {
      (screen.getByRole("button", { name: "Keep working" }) as HTMLButtonElement).click();
    });
    expect(screen.getByTestId("warning").textContent).toBe("false");

    advance(IDLE_WARNING_MS + 1000); // past the original wipe time
    expect(screen.getByTestId("text").textContent).toBe("worry most days");
    expect(screen.getByTestId("cleared").textContent).toBe("false");

    advance(IDLE_MS - IDLE_WARNING_MS - IDLE_WARNING_MS - 1000); // 14:00 after the extension
    expect(screen.getByTestId("warning").textContent).toBe("true");
    advance(IDLE_WARNING_MS);
    expect(screen.getByTestId("text").textContent).toBe("");
  });

  it("keyboard focus movement counts as activity", () => {
    setup();
    advance(IDLE_MS - 5000);
    act(() => {
      window.dispatchEvent(new FocusEvent("focusin"));
    });
    advance(10_000);
    expect(screen.getByTestId("text").textContent).toBe("worry most days");
    expect(screen.getByTestId("warning").textContent).toBe("false");
  });
});
