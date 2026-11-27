import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// G5/G17: connect-src 'self' means the browser cannot send anything to a third-party host.
// Outbound links are plain navigations only; the optional assistant is called server-side (src/server/ai).
// 'wasm-unsafe-eval' lets the opt-in on-device model (docs/ON-DEVICE-AI.md) compile its WebAssembly runtime,
// served from this origin under /ort/ and checked against pinned SHA-256 hashes in the worker. It does not allow
// eval() of JavaScript. The worker itself is a same-origin module (worker-src 'self'; blob: for the runtime's
// own helper workers).
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  ...(isProd ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] : []),
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** Pinned model revision and runtime build, hash-checked in the browser: safe to cache for a year. */
const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The project's agent rules live in CLAUDE.md; stop `next dev` from writing its own AGENTS.md block.
  agentRules: false,
  env: {
    // Build-time switch for the test-only upstream fixtures (src/server/core.ts): "1" only when this build itself
    // ran with E2E_UPSTREAM_FIXTURES=1 (the Playwright suite). Any other build has fixture mode compiled out, so a
    // stray runtime variable on a host can never make the app serve fictional referral or drug data.
    CRC_FIXTURE_BUILD: process.env.E2E_UPSTREAM_FIXTURES?.trim() === "1" ? "1" : "0",
  },
  async headers() {
    // Later entries override earlier ones for the same header key, so the model rules come after the catch-all.
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages and other responses are never stored by the browser or proxies. Hashed build assets are
      // left out on purpose: Next.js already serves /_next/static/* as public, immutable.
      { source: "/:path((?!_next/static/).*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      // On-device model files (static, no clinical data). Without this every switch-on downloads ~38 MB again.
      { source: "/models/all-MiniLM-L6-v2/:path*", headers: immutable },
      { source: "/ort/:path*", headers: immutable },
      // Rebuilt whenever the symptom lexicon changes: revalidate each time.
      { source: "/models/lexicon-embeddings.json", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
