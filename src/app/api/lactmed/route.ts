// POST /api/lactmed. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/lactmed.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/lactmed";
export const runtime = "nodejs";
