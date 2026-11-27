// @vitest-environment jsdom
/**
 * Plan builder, round 4 (jsdom): the optional formulation step, cross-cutting modules in the Problems step (added
 * unchecked, crisis resources shown with the safety module, removal blocked while anything is chosen), the care-level
 * filter and formulation links on objectives, the progress-review navigator on the Measures step, and the
 * formulation check on the review step, labeled for clinician review. axe structural checks run on each step
 * (colour contrast is covered by the e2e suite).
 */
import axe from "axe-core";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/plan",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

import { SessionProvider } from "@/state/session";
import PlanPage from "@/app/(clinician)/plan/page";

const h = React.createElement;

async function axeViolations(): Promise<string[]> {
  const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const stepRegion = () => screen.getByRole("region", { name: /^Step \d+ of \d+/ });
const next = (label: RegExp) => fireEvent.click(within(stepRegion()).getByRole("button", { name: label }));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

describe("/plan round 4 features", () => {
  it("walks the formulation step, modules, care levels, navigator and formulation check", async () => {
    render(h(SessionProvider, null, h(PlanPage)));
    fireEvent.change(screen.getByLabelText("Plan library"), { target: { value: "major-depressive-disorder" } });
    await screen.findByText(/Plan library: /);

    // Step 2: formulation (optional), curated chips only.
    next(/^Next: Formulation/);
    expect(stepRegion().textContent).toMatch(/Step 2 of 9/);
    expect(within(stepRegion()).queryByRole("textbox")).toBeNull();
    const chip = within(stepRegion()).getByRole("button", { name: /Low engagement with rewarding activity/ });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(stepRegion()).getByRole("button", { name: /Unprocessed trauma memories/ }));
    expect(within(stepRegion()).getByRole("status").textContent).toMatch(/^2 chosen/);
    expect(await axeViolations()).toEqual([]);

    // Step 3: problems, then add the safety module: its problems arrive unchecked, with crisis resources in view.
    next(/^Next: Problems/);
    const problems = within(stepRegion()).getAllByRole("checkbox");
    fireEvent.click(problems[0]!);
    fireEvent.click(within(stepRegion()).getByRole("button", { name: /Add Suicidal thoughts and self-harm/ }));
    const module = within(stepRegion()).getByRole("region", { name: "Suicidal thoughts and self-harm: safety-focused objectives" });
    expect(within(module).getByText("Crisis resources, always available")).toBeTruthy();
    const moduleBoxes = within(module).getAllByRole("checkbox") as HTMLInputElement[];
    expect(moduleBoxes.length).toBe(2);
    expect(moduleBoxes.every((b) => !b.checked)).toBe(true);
    fireEvent.click(moduleBoxes[0]!);
    const remove = within(module).getByRole("button", { name: "Remove this module" }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    expect(await axeViolations()).toEqual([]);

    // Steps 4 to 6: the care-level filter and formulation links show on objectives.
    next(/^Next: Behavioral definitions/);
    next(/^Next: Long-term goals/);
    next(/^Next: Objectives/);
    const filter = within(stepRegion()).getByRole("group", { name: /Show objectives by usual level of care/ });
    const allCount = within(stepRegion()).getAllByRole("checkbox").length;
    fireEvent.click(within(filter).getByRole("radio", { name: "Specialist care" }));
    // Nothing is checked yet, so every objective left in view is a specialist-level one.
    const shown = within(stepRegion()).getAllByRole("checkbox").length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(allCount);
    const specialistBadges = within(stepRegion()).getAllByText((_, el) => el?.tagName === "SPAN" && el.textContent === "Usual level of care: Specialist care");
    expect(specialistBadges.length).toBe(shown);
    fireEvent.click(within(filter).getByRole("radio", { name: "All levels" }));
    expect(within(stepRegion()).getAllByRole("checkbox").length).toBe(allCount);
    const firstObjective = within(stepRegion()).getAllByRole("checkbox")[0]!;
    fireEvent.click(firstObjective);
    expect(within(stepRegion()).getAllByText("Link to your formulation").length).toBeGreaterThan(0);
    expect(await axeViolations()).toEqual([]);

    // Step 8: measures, with the progress-review navigator one tap away.
    next(/^Next: Interventions/);
    next(/^Next: Measures/);
    expect(within(stepRegion()).getByText("If progress stalls")).toBeTruthy();
    fireEvent.click(within(stepRegion()).getByRole("button", { name: "Add the progress review module" }));
    expect(within(stepRegion()).getByText("The progress review module is in this plan.")).toBeTruthy();

    // Step 9: review, with the formulation check for clinician review and the unaddressed target named.
    next(/^Next: Review and export/);
    const check = within(stepRegion()).getByRole("region", { name: "Formulation check" });
    expect(within(check).getByText("For clinician review")).toBeTruthy();
    expect(within(check).getByText("Not yet worked on by any chosen objective")).toBeTruthy();
    expect(check.textContent).toMatch(/Unprocessed trauma memories/);
    expect(stepRegion().textContent).toMatch(/Modules in this plan: Suicidal thoughts and self-harm/);
    expect(await axeViolations()).toEqual([]);
  });
});
