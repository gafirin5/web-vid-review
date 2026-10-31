import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { isRejectCategory, quarantineMedia } from "@/services/quarantine";
import { REJECT_CATEGORIES } from "@/lib/reject-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/media/:id/reject
 * Pindahkan media ke karantina (zero-delete). Body: { category, reason? }
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/media/[id]/reject">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  if (!isRejectCategory(body?.category)) {
    return jsonError(
      `'category' wajib salah satu: ${REJECT_CATEGORIES.join(", ")}`,
      422
    );
  }
  const reason = typeof body?.reason === "string" ? body.reason : null;

  try {
    const result = await quarantineMedia(id, { category: body.category, reason });
    return jsonOk(result);
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Gagal mengarantina media", 422);
  }
}
