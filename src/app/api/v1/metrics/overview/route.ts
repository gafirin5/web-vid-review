import { getOverviewMetrics } from "@/services/metrics";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/metrics/overview — total data, tren upload, distribusi, agent */
export async function GET() {
  return jsonOk(await getOverviewMetrics());
}
