import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { purgeQuarantined } from "@/services/quarantine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/rejected/:id — hapus permanen media terkarantina.
 * Body: { confirm: string } — harus sama dengan contentId (atau UUID).
 */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/rejected/[id]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const confirm = typeof body?.confirm === "string" ? body.confirm : "";

  try {
    return jsonOk(await purgeQuarantined(id, confirm));
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Gagal menghapus", 422);
  }
}
