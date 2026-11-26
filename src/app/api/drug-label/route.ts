// POST /api/drug-label. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/drug-label.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/drug-label";
export const runtime = "nodejs";
