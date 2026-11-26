// POST /api/medlineplus. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/medlineplus.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/medlineplus";
export const runtime = "nodejs";
