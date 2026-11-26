// POST /api/icd10cm. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/icd10cm.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/icd10cm";
export const runtime = "nodejs";
