import { getStorageMetrics } from "@/services/metrics";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/metrics/storage — kapasitas disk & rincian ukuran folder */
export async function GET() {
  return jsonOk(await getStorageMetrics());
}
