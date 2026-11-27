import * as React from "react";
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { SessionProvider } from "@/state/session";
import EthicsPage from "@/app/(clinician)/ethics/page";

describe("probe", () => {
  it("size", () => {
    const page = renderToString(React.createElement(SessionProvider, null, React.createElement(EthicsPage)));
    writeFileSync("/tmp/claude-0/-home-user-Clinicare-/9e6e4b87-eaf5-51f7-bf0b-cef4e8e11881/scratchpad/el/before.html", page);
    expect(page.length).toBeGreaterThan(0);
  });
});
