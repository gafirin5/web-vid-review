import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAgent } from "@/lib/agent-auth";
import { isAdminRequest } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/v1/collections/:id/items/:mediaId */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/collections/[id]/items/[mediaId]">
) {
  const { id, mediaId } = await ctx.params;

  const collection = await db.prisma.collection.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!collection) return jsonError("Koleksi tidak ditemukan", 404);

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);
  const admin = await isAdminRequest();
  if (!admin && collection.agentId !== identity.agent?.id) {
    return jsonError("Anda bukan pemilik koleksi ini", 403);
  }

  await db.prisma.collectionItem.deleteMany({
    where: { collectionId: collection.id, mediaId },
  });
  return jsonOk({ removed: mediaId, collectionId: collection.id });
}