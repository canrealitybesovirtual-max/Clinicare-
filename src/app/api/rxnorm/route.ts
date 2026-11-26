// POST /api/rxnorm. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/rxnorm.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/rxnorm";
export const runtime = "nodejs";
