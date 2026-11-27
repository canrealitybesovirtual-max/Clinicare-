// @vitest-environment jsdom
/**
 * Clear session and the idle wipe empty the AI helpers' memory-only store (src/components/ai/ai-session.ts) and
 * switch the on-device model off at the moment of the reset, even on a page that never shows the AI panels
 * (G5: the worker keeps recent clause vectors of the scrubbed note).
 */
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "@/state/session";

const disableSemanticModel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/semantic/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/semantic/client")>()),
  disableSemanticModel,
}));

const { useAiSession } = await import("@/components/ai/ai-session");

let ai: ReturnType<typeof useAiSession> | null = null;
let session: ReturnType<typeof useSession> | null = null;
function AiScreen() {
  ai = useAiSession();
  return null;
}
function OtherScreen() {
  session = useSession();
  return null;
}
function App({ aiScreen }: { aiScreen: boolean }) {
  return (
    <SessionProvider idleMs={60_000}>
      {aiScreen ? <AiScreen /> : null}
      <OtherScreen />
    </SessionProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  disableSemanticModel.mockClear();
});

/** Opt in and answer a question on the AI screen, then move to a screen without the AI panels. */
function fillThenLeave(rerender: (ui: React.ReactElement) => void) {
  act(() => session!.set({ duration: "gte6m" }));
  act(() => ai![1]({ assistantOptIn: true, followUpAnswers: [{ questionId: "q", answerIds: ["a"], questionText: "Q", answerLabels: ["A"] }] }));
  expect(ai![0].assistantOptIn).toBe(true);
  rerender(<App aiScreen={false} />);
  disableSemanticModel.mockClear();
}

describe("AI session store on reset", () => {
  it("is emptied by Clear session on another page, and the on-device model is switched off at once", () => {
    const { rerender } = render(<App aiScreen />);
    fillThenLeave(rerender);
    act(() => session!.reset());
    expect(disableSemanticModel).toHaveBeenCalledTimes(1);
    rerender(<App aiScreen />);
    expect(ai![0].assistantOptIn).toBe(false);
    expect(ai![0].followUpAnswers).toEqual([]);
  });

  it("is emptied by the idle wipe on another page", () => {
    vi.useFakeTimers();
    const { rerender } = render(<App aiScreen />);
    fillThenLeave(rerender);
    act(() => vi.advanceTimersByTime(60_000));
    expect(disableSemanticModel).toHaveBeenCalledTimes(1);
    rerender(<App aiScreen />);
    expect(ai![0].followUpAnswers).toEqual([]);
  });
});
