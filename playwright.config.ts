import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * The app server for the suite runs with canned upstream answers (E2E_UPSTREAM_FIXTURES=1,
 * tests/fixtures/upstream/*.json, src/server/core.ts): no test ever reaches a real API, results are deterministic
 * and no upstream quota is spent. Fixture mode needs a build made with E2E_UPSTREAM_FIXTURES=1 (next.config.ts) and
 * is ignored on hosting platforms (RENDER, VERCEL and others set).
 * The placeholder credentials below only switch the adapters from "not configured" to "configured"; with
 * fixtures on they are never sent anywhere. E2E_NO_BUILD=1 reuses an existing `next build`.
 */
const E2E_SERVER_ENV: Record<string, string> = {
  E2E_UPSTREAM_FIXTURES: "1",
  // next.config.ts inlines this from E2E_UPSTREAM_FIXTURES at build time; set here too so `next start` agrees.
  CRC_FIXTURE_BUILD: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  ALLOW_SUD_REFERENCE_LOOKUPS: "true", // owner decision 2026-11-26 (docs/RESOURCES.md), as in render.yaml
  WHO_ICD_CLIENT_ID: "e2e-fixture-client",
  WHO_ICD_CLIENT_SECRET: "e2e-fixture-secret",
  HRSA_API_KEY: "e2e-fixture-token",
  FINDTREATMENT_ACCESS_APPROVED: "true",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: process.env.E2E_NO_BUILD ? `npx next start -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    env: E2E_SERVER_ENV,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
