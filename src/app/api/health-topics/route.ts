// POST /api/health-topics. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/health-topics.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/health-topics";
export const runtime = "nodejs";
