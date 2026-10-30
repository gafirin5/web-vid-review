import { jsonOk } from "@/lib/http";
import { storageReport } from "@/services/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/storage/report — total, per role, purgeable, proyeksi 30 hari. */
export async function GET() {
  return jsonOk(await storageReport());
}
