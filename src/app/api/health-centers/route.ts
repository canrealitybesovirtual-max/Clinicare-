// POST /api/health-centers. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/health-centers.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/health-centers";
export const runtime = "nodejs";
