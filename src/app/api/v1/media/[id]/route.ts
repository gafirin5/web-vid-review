import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAgent } from "@/lib/agent-auth";
import { isAdminRequest } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { publishEvent } from "@/lib/events";
import { deleteMediaWithFiles, isOwner, setMediaTags } from "@/services/media-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/media/:id */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/media/[id]">
) {
  const { id } = await ctx.params;
  const media = await db.prisma.media.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true, modelProvider: true } },
      tags: { include: { tag: true } },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!media) return jsonError("Media not found", 404);
  return jsonOk(media);
}

/**
 * PATCH /api/v1/media/:id
 * Pemilik media (agent) atau admin dapat mengubah metadata.
 * Body: { title?, description?, tags?: string[], prompt?, transcript? }
 * Admin juga dapat mengubah status & nsfwFlag.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/media/[id]">
) {
  const { id } = await ctx.params;

  const media = await db.prisma.media.findUnique({ where: { id } });
  if (!media) return jsonError("Media not found", 404);

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);

  const admin = await isAdminRequest();
  if (!admin && !isOwner(media.agentId, identity.agent?.id ?? null)) {
    return jsonError("Anda bukan pemilik media ini", 403);
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 300);
  if (typeof body?.description === "string") data.description = body.description.slice(0, 4000);
  if (typeof body?.prompt === "string") data.prompt = body.prompt.slice(0, 8000);
  if (typeof body?.transcript === "string") data.transcript = body.transcript.slice(0, 20000);
  if (admin && typeof body?.status === "string") data.status = body.status;
  if (admin && typeof body?.nsfwFlag === "boolean") data.nsfwFlag = body.nsfwFlag;
  if (admin && typeof body?.character_name === "string") {
    const name = body.character_name.trim();
    data.characterName = name.slice(0, 200);
    data.reviewedAt = new Date();
  }
  if (admin && typeof body?.review_note === "string") data.reviewNote = body.review_note.trim().slice(0, 1000) || null;
  if (admin && typeof body?.review_kind === "string") data.reviewKind = body.review_kind.trim().slice(0, 50) || null;

  if (Object.keys(data).length === 0 && !Array.isArray(body?.tags)) {
    return jsonError("Tidak ada field yang diubah");
  }

  if (Object.keys(data).length > 0) {
    await db.prisma.media.update({ where: { id }, data });
  }
  if (Array.isArray(body?.tags)) {
    await setMediaTags(id, body.tags.map(String));
  }

  publishEvent({
    type: "media.updated",
    title: `Media diperbarui: ${(data.title as string) ?? media.title.slice(0, 50)}`,
    message: admin ? "oleh admin" : `oleh ${identity.agent?.name ?? "pemilik"}`,
    payload: { mediaId: id },
  });

  if (data.characterName !== undefined) {
    publishEvent({
      type: "media.review_resolved",
      title: `Review karakter selesai: ${media.title.slice(0, 50)}`,
      message: data.characterName as string,
      payload: { mediaId: id, characterName: data.characterName },
    });
  }

  const updated = await db.prisma.media.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true, modelProvider: true } },
      tags: { include: { tag: true } },
    },
  });
  return jsonOk(updated);
}

/**
 * DELETE /api/v1/media/:id
 * Pemilik media atau admin dapat menghapus (record + file fisik).
 */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/media/[id]">
) {
  const { id } = await ctx.params;

  const media = await db.prisma.media.findUnique({ where: { id } });
  if (!media) return jsonError("Media not found", 404);

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);

  const admin = await isAdminRequest();
  if (!admin && !isOwner(media.agentId, identity.agent?.id ?? null)) {
    return jsonError("Anda bukan pemilik media ini", 403);
  }

  const removedFiles = await deleteMediaWithFiles(id);

  publishEvent({
    type: "media.deleted",
    title: `Media dihapus: ${media.title.slice(0, 50)}`,
    payload: { mediaId: id },
  });

  return jsonOk({ deleted: id, removedFiles });
}