import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { UPLOADS_ROOT } from "@/lib/paths";
import { publishEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["PENDING_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"]);

/** PATCH /api/admin/media/:id — ubah metadata/status media. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/media/[id]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 300);
  if (typeof body?.description === "string") data.description = body.description.slice(0, 4000);
  if (typeof body?.status === "string" && STATUSES.has(body.status)) data.status = body.status;
  if (typeof body?.nsfwFlag === "boolean") data.nsfwFlag = body.nsfwFlag;
  if (Object.keys(data).length === 0) return jsonError("Tidak ada field yang diubah");

  try {
    const media = await db.prisma.media.update({ where: { id }, data });
    publishEvent({
      type: "media.updated",
      title: `Media diperbarui: ${media.title.slice(0, 50)}`,
      message: `status ${media.status}`,
      payload: { mediaId: id, status: media.status },
    });
    return jsonOk({ id: media.id, status: media.status, title: media.title });
  } catch {
    return jsonError("Media tidak ditemukan", 404);
  }
}

/** DELETE /api/admin/media/:id — hapus media beserta file fisiknya. */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/media/[id]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const media = await db.prisma.media.findUnique({ where: { id } });
  if (!media) return jsonError("Media tidak ditemukan", 404);

  // Hapus record (review & mediaTag ikut ter-cascade).
  await db.prisma.media.delete({ where: { id } });

  // Hapus file fisik dengan proteksi path traversal.
  const removedFiles: string[] = [];
  for (const rel of [media.storagePath, media.thumbnailPath, media.previewPath]) {
    if (!rel) continue;
    const abs = path.resolve(UPLOADS_ROOT, rel);
    if (!abs.startsWith(UPLOADS_ROOT + path.sep)) continue;
    try {
      await fs.unlink(abs);
      removedFiles.push(rel);
    } catch {
      // file sudah tidak ada — abaikan
    }
  }

  publishEvent({
    type: "media.deleted",
    title: `Media dihapus: ${media.title.slice(0, 50)}`,
    payload: { mediaId: id },
  });

  return jsonOk({ deleted: id, removedFiles });
}
