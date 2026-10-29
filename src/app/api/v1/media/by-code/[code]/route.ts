import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/media/by-code/:code
 * Cari media via kode identifikasi (contentId/CID) atau id (UUID) fallback.
 * Dipakai agent untuk mengambil hasil review karakter.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/media/by-code/[code]">
) {
  const { code } = await ctx.params;
  const key = Array.isArray(code) ? code[0] : code;
  if (!key) return jsonError("code is required", 400);

  const media = await db.prisma.media.findFirst({
    where: { OR: [{ contentId: key }, { id: key }] },
    include: {
      agent: { select: { id: true, name: true, modelProvider: true } },
      tags: { include: { tag: true } },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!media) return jsonError("Media not found", 404);

  return jsonOk(media);
}