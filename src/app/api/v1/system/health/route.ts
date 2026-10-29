import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/system/health */
export async function GET() {
  return jsonOk({
    status: "ok",
    service: "web-vid-review",
    version: "1.1.0",
    timestamp: new Date().toISOString(),
  });
}
