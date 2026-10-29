import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAgent } from "@/lib/agent-auth";
import { isAdminRequest } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedCollection(idOrSlug: string, request: NextRequest) {
  const collection = await db.prisma.collection.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });
  if (!collection) return { error: jsonError("Koleksi tidak ditemukan", 404) };

  const identity = await resolveAgent(request);
  if (identity.error) return { error: jsonError(identity.error, 401) };
  const admin = await isAdminRequest();
  if (!admin && collection.agentId !== identity.agent?.id) {
    return { error: jsonError("Anda bukan pemilik koleksi ini", 403) };
  }
  return { collection };
}

/**
 * POST /api/v1/collections/:id/items
 * Body: { media_id: string } atau { media_ids: string[] }
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/collections/[id]/items">
) {
  const { id } = await ctx.params;
  const owned = await ownedCollection(id, request);
  if (owned.error) return owned.error;
  const collection = owned.collection!;

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.media_ids)
    ? body.media_ids.map(String)
    : body?.media_id
      ? [String(body.media_id)]
      : [];
  if (ids.length === 0) return jsonError("Kirim 'media_id' atau 'media_ids'");
  if (ids.length > 50) return jsonError("Maksimal 50 media per request");

  const existingCount = await db.prisma.collectionItem.count({
    where: { collectionId: collection.id },
  });

  const found = await db.prisma.media.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((m) => m.id));
  const missing = ids.filter((i) => !foundIds.has(i));

  const added: string[] = [];
  for (const [i, mediaId] of ids.entries()) {
    if (!foundIds.has(mediaId)) continue;
    const exists = await db.prisma.collectionItem.findUnique({
      where: { collectionId_mediaId: { collectionId: collection.id, mediaId } },
    });
    if (exists) continue;
    await db.prisma.collectionItem.create({
      data: { collectionId: collection.id, mediaId, position: existingCount + i },
    });
    added.push(mediaId);
  }

  return jsonOk({ collectionId: collection.id, added, missing }, { status: 201 });
}