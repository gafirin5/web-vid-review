import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { restoreMedia } from "@/services/quarantine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/media/:id/restore — pulihkan media dari karantina. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/media/[id]/restore">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  try {
    return jsonOk(await restoreMedia(id));
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Gagal memulihkan media", 422);
  }
}
