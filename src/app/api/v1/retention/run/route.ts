import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { runRetention } from "@/services/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/v1/retention/run?dry_run=true
 * Default dry-run (aman). Kirim ?dry_run=false untuk purge nyata.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") !== "false";

  try {
    return jsonOk(await runRetention({ dryRun }));
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Retensi gagal dijalankan", 500);
  }
}
