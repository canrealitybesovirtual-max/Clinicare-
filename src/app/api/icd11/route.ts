// POST /api/icd11. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/icd11.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/icd11";
export const runtime = "nodejs";
