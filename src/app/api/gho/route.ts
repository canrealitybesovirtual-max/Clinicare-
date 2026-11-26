// POST /api/gho. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/gho.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/gho";
export const runtime = "nodejs";
