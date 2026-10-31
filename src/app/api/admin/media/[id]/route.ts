import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { UPLOADS_ROOT, REJECTED_ROOT } from "@/lib/paths";
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

  let characterName: string | undefined;
  if (typeof body?.character_name === "string") {
    characterName = body.character_name.trim().slice(0, 200);
    data.characterName = characterName;
    data.reviewedAt = new Date();
  }
  if (typeof body?.review_note === "string") {
    data.reviewNote = body.review_note.trim().slice(0, 1000) || null;
  }
  if (typeof body?.review_kind === "string") {
    data.reviewKind = body.review_kind.trim().slice(0, 50) || null;
  }

  if (Object.keys(data).length === 0) return jsonError("Tidak ada field yang diubah");

  try {
    const media = await db.prisma.media.update({ where: { id }, data });
    publishEvent({
      type: "media.updated",
      title: `Media diperbarui: ${media.title.slice(0, 50)}`,
      message: `status ${media.status}`,
      payload: { mediaId: id, status: media.status },
    });
    if (characterName !== undefined) {
      publishEvent({
        type: "media.review_resolved",
        title: `Review karakter selesai: ${media.title.slice(0, 50)}`,
        message: characterName,
        payload: { mediaId: id, characterName },
      });
    }
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

  // Media terkarantina wajib konfirmasi ketik kode (zero-delete by default).
  if (media.quarantinedPath) {
    const body = await request.json().catch(() => ({}));
    const expected = media.contentId?.trim() || media.id;
    if (typeof body?.confirm !== "string" || body.confirm.trim() !== expected) {
      return jsonError(
        `Media berada di karantina. Ketik "${expected}" pada field confirm untuk menghapus permanen.`,
        422
      );
    }
  }

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

  // File karantina (bila ada) ikut dibersihkan.
  if (media.quarantinedPath) {
    try {
      await fs.rm(path.join(REJECTED_ROOT, path.dirname(media.quarantinedPath)), {
        recursive: true,
        force: true,
      });
    } catch {
      // abaikan
    }
  }

  publishEvent({
    type: "media.deleted",
    title: `Media dihapus: ${media.title.slice(0, 50)}`,
    payload: { mediaId: id },
  });

  return jsonOk({ deleted: id, removedFiles });
}
