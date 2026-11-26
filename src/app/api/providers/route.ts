// POST /api/providers. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/providers.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/providers";
export const runtime = "nodejs";
