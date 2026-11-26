// POST /api/treatment-facilities. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/treatment-facilities.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/treatment-facilities";
export const runtime = "nodejs";
