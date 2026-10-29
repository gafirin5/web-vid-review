import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { UPLOADS_ROOT } from "@/lib/paths";

/** Hapus media beserta file fisiknya. Mengembalikan daftar file yang dihapus. */
export async function deleteMediaWithFiles(id: string): Promise<string[]> {
  const media = await db.prisma.media.findUnique({ where: { id } });
  if (!media) throw new Error("Media tidak ditemukan");

  await db.prisma.media.delete({ where: { id } });

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
  return removedFiles;
}

/** Ganti seluruh tag media dengan daftar baru. */
export async function setMediaTags(mediaId: string, tagNames: string[]): Promise<void> {
  const names = Array.from(
    new Set(
      tagNames
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 64)
    )
  ).slice(0, 24);

  await db.prisma.$transaction([
    db.prisma.mediaTag.deleteMany({ where: { mediaId } }),
    ...names.map((name) =>
      db.prisma.mediaTag.create({
        data: {
          media: { connect: { id: mediaId } },
          tag: { connectOrCreate: { where: { name }, create: { name } } },
        },
      })
    ),
  ]);
}

/** Cek apakah identitas boleh mengubah media (pemilik atau admin). */
export function isOwner(mediaAgentId: string | null, identityAgentId: string | null): boolean {
  return Boolean(mediaAgentId && identityAgentId && mediaAgentId === identityAgentId);
}