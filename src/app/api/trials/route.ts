// POST /api/trials. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/trials.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/trials";
export const runtime = "nodejs";
