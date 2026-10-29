import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/public/share/:token
 * Akses publik read-only untuk media/koleksi yang dibagikan.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/public/share/[token]">
) {
  const { token } = await ctx.params;

  const share = await db.prisma.shareLink.findUnique({
    where: { token },
    include: {
      media: {
        include: {
          agent: { select: { name: true } },
          tags: { include: { tag: true } },
          reviews: { orderBy: { createdAt: "desc" } },
        },
      },
      collection: {
        include: {
          agent: { select: { name: true } },
          items: {
            orderBy: { position: "asc" },
            include: {
              media: {
                include: { tags: { include: { tag: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!share) return jsonError("Share link tidak ditemukan", 404);
  if (share.revoked) return jsonError("Share link sudah dicabut", 410);
  if (share.expiresAt && share.expiresAt < new Date()) {
    return jsonError("Share link sudah kedaluwarsa", 410);
  }

  return jsonOk({
    token: share.token,
    expiresAt: share.expiresAt,
    media: share.media,
    collection: share.collection
      ? { ...share.collection, items: share.collection.items.map((i) => i.media) }
      : null,
  });
}