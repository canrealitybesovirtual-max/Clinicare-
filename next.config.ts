import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// G5/G17: connect-src 'self' means the browser cannot send anything to a third-party host.
// Phase 1 makes no external API calls; outbound links are plain navigations only.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
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
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    // Build-time switch for the test-only upstream fixtures (src/server/core.ts): "1" only when this build itself
    // ran with E2E_UPSTREAM_FIXTURES=1 (the Playwright suite). Any other build has fixture mode compiled out, so a
    // stray runtime variable on a host can never make the app serve fictional referral or drug data.
    CRC_FIXTURE_BUILD: process.env.E2E_UPSTREAM_FIXTURES?.trim() === "1" ? "1" : "0",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages and other responses are never stored by the browser or proxies. Hashed build assets are
      // left out on purpose: Next.js already serves /_next/static/* as public, immutable.
      { source: "/:path((?!_next/static/).*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
