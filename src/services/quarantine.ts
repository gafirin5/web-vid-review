import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { REJECTED_ROOT, resolveStoredPath } from "@/lib/paths";
import { publishEvent } from "@/lib/events";
import {
  REJECT_CATEGORIES,
  REJECT_CATEGORY_DIRS,
  isRejectCategory,
  type RejectCategory,
} from "@/lib/reject-categories";

export { REJECT_CATEGORIES, isRejectCategory };
export type { RejectCategory };

/**
 * Fitur "rejected" — karantina ZERO-DELETE untuk media yang ditolak.
 *
 * Berbeda dari fitur "dump" (snapshot media APPROVED untuk handoff pipeline),
 * fitur ini memindahkan file fisik ke `rejected/<kategori>/<YYYY-MM>/` agar:
 *  - tidak ikut ter-dump / tampil di galeri,
 *  - tetap tersimpan (tidak dihapus) dan bisa di-restore,
 *  - punya kategori + alasan yang bisa dibaca agent lewat `get_review_result`.
 *
 * Penghapusan permanen hanya lewat aksi manual dengan konfirmasi ketik kode.
 */

export interface QuarantineFile {
  role: "main" | "thumbnail" | "preview";
  /** Path relatif terhadap UPLOADS_ROOT sebelum dipindah. */
  original: string;
  /** Path relatif terhadap REJECTED_ROOT setelah dipindah. */
  quarantined: string;
}

export interface QuarantineManifest {
  type: "wvr-quarantine.json";
  mediaId: string;
  contentId: string | null;
  title: string;
  category: RejectCategory;
  reason: string | null;
  rejectedAt: string;
  files: QuarantineFile[];
}

export interface QuarantineResult {
  id: string;
  contentId: string | null;
  category: RejectCategory;
  reason: string | null;
  rejectedAt: string;
  quarantinedPath: string;
  movedFiles: string[];
  missingFiles: string[];
}

export interface QuarantinedItem {
  id: string;
  contentId: string | null;
  title: string;
  mediaType: string;
  sizeBytes: number;
  category: RejectCategory;
  reason: string | null;
  rejectedAt: string;
  quarantinedPath: string;
  fileExists: boolean;
}

export interface QuarantineStats {
  total: { count: number; sizeBytes: number };
  byCategory: Record<RejectCategory, { count: number; sizeBytes: number }>;
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "item";
}

function monthBucket(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resolveRejectedPath(relative: string): string {
  const abs = path.resolve(REJECTED_ROOT, relative);
  if (!abs.startsWith(REJECTED_ROOT + path.sep) && abs !== REJECTED_ROOT) {
    throw new Error("Path traversal detected");
  }
  return abs;
}

function manifestPathFor(quarantinedPath: string): string {
  const abs = resolveRejectedPath(quarantinedPath);
  const dir = path.dirname(abs);
  const base = path.basename(abs, path.extname(abs));
  return path.join(dir, `${base}.manifest.json`);
}

/** Pindah file; fallback copy+unlink bila beda device (EXDEV). */
async function moveFile(srcAbs: string, dstAbs: string): Promise<void> {
  await fs.mkdir(path.dirname(dstAbs), { recursive: true });
  try {
    await fs.rename(srcAbs, dstAbs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await fs.copyFile(srcAbs, dstAbs);
    await fs.unlink(srcAbs);
  }
}

async function fileExists(abs: string): Promise<boolean> {
  return fs
    .stat(abs)
    .then((s) => s.isFile())
    .catch(() => false);
}

/**
 * Pindahkan media ke karantina dan set status REJECTED.
 * Idempoten: media yang sudah dikarantina mengembalikan data yang ada.
 */
export async function quarantineMedia(
  mediaId: string,
  opts: { category: RejectCategory; reason?: string | null }
): Promise<QuarantineResult> {
  const media = await db.prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) throw new Error("Media tidak ditemukan");

  if (media.quarantinedPath) {
    return {
      id: media.id,
      contentId: media.contentId,
      category: (media.rejectCategory as RejectCategory) ?? opts.category,
      reason: media.rejectReason,
      rejectedAt: (media.rejectedAt ?? new Date()).toISOString(),
      quarantinedPath: media.quarantinedPath,
      movedFiles: [],
      missingFiles: [],
    };
  }

  const rejectedAt = new Date();
  const category = opts.category;
  const reason = opts.reason?.trim().slice(0, 1000) || null;
  const bucket = monthBucket(rejectedAt);
  const baseKey = safeName(media.contentId?.trim() || media.id);
  // Multi-aset per CID: role/index masuk nama file agar tidak saling menimpa.
  const key =
    media.role === "video" && media.index === 0
      ? baseKey
      : `${baseKey}__${safeName(media.role)}${media.index ? `_${media.index}` : ""}`;
  const dirRel = path.join(REJECT_CATEGORY_DIRS[category], bucket);

  const mainExt = path.extname(media.storagePath) || path.extname(media.originalFileName) || "";
  const files: QuarantineFile[] = [
    { role: "main", original: media.storagePath, quarantined: path.join(dirRel, `${key}${mainExt}`) },
  ];
  if (media.thumbnailPath) {
    files.push({
      role: "thumbnail",
      original: media.thumbnailPath,
      quarantined: path.join(
        dirRel,
        `${key}_thumb${path.extname(media.thumbnailPath) || ".jpg"}`
      ),
    });
  }
  if (media.previewPath) {
    files.push({
      role: "preview",
      original: media.previewPath,
      quarantined: path.join(dirRel, `${key}_preview${path.extname(media.previewPath) || ""}`),
    });
  }

  const movedFiles: string[] = [];
  const missingFiles: string[] = [];
  for (const file of files) {
    let srcAbs: string;
    try {
      srcAbs = resolveStoredPath(file.original);
    } catch {
      missingFiles.push(file.original);
      continue;
    }
    if (!(await fileExists(srcAbs))) {
      missingFiles.push(file.original);
      continue;
    }
    await moveFile(srcAbs, resolveRejectedPath(file.quarantined));
    movedFiles.push(file.quarantined);
  }

  const manifest: QuarantineManifest = {
    type: "wvr-quarantine.json",
    mediaId: media.id,
    contentId: media.contentId,
    title: media.title,
    category,
    reason,
    rejectedAt: rejectedAt.toISOString(),
    files,
  };
  const mainRel = files[0].quarantined;
  await fs.mkdir(path.dirname(resolveRejectedPath(mainRel)), { recursive: true });
  await fs.writeFile(manifestPathFor(mainRel), JSON.stringify(manifest, null, 2), "utf8");

  await db.prisma.media.update({
    where: { id: media.id },
    data: {
      status: "REJECTED",
      rejectCategory: category,
      rejectReason: reason,
      rejectedAt,
      quarantinedPath: mainRel,
      previousStoragePath: media.storagePath,
    },
  });

  publishEvent({
    type: "media.rejected",
    title: `Media dikarantina: ${media.title.slice(0, 50)}`,
    message: `${category}${reason ? ` — ${reason.slice(0, 80)}` : ""}`,
    payload: { mediaId: media.id, category, contentId: media.contentId },
  });

  return {
    id: media.id,
    contentId: media.contentId,
    category,
    reason,
    rejectedAt: rejectedAt.toISOString(),
    quarantinedPath: mainRel,
    movedFiles,
    missingFiles,
  };
}

/** Kembalikan media dari karantina ke uploads/ dan set status APPROVED. */
export async function restoreMedia(mediaId: string): Promise<QuarantineResult> {
  const media = await db.prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) throw new Error("Media tidak ditemukan");
  if (!media.quarantinedPath) throw new Error("Media tidak berada dalam karantina");

  const manifest = await fs
    .readFile(manifestPathFor(media.quarantinedPath), "utf8")
    .then((raw) => JSON.parse(raw) as QuarantineManifest)
    .catch(() => null);

  const files: QuarantineFile[] =
    manifest?.files ?? [
      {
        role: "main",
        original: media.previousStoragePath ?? media.storagePath,
        quarantined: media.quarantinedPath,
      },
    ];

  const movedFiles: string[] = [];
  const missingFiles: string[] = [];
  for (const file of files) {
    const srcAbs = resolveRejectedPath(file.quarantined);
    if (!(await fileExists(srcAbs))) {
      missingFiles.push(file.quarantined);
      continue;
    }
    await moveFile(srcAbs, resolveStoredPath(file.original));
    movedFiles.push(file.original);
  }

  // Bersihkan manifest + folder bulan bila sudah kosong.
  const manifestAbs = manifestPathFor(media.quarantinedPath);
  await fs.unlink(manifestAbs).catch(() => {});
  await fs.rmdir(path.dirname(resolveRejectedPath(media.quarantinedPath))).catch(() => {});

  await db.prisma.media.update({
    where: { id: media.id },
    data: {
      status: "APPROVED",
      rejectCategory: null,
      rejectReason: null,
      rejectedAt: null,
      quarantinedPath: null,
      previousStoragePath: null,
    },
  });

  publishEvent({
    type: "media.restored",
    title: `Media dipulihkan: ${media.title.slice(0, 50)}`,
    message: media.rejectCategory ?? undefined,
    payload: { mediaId: media.id, contentId: media.contentId },
  });

  return {
    id: media.id,
    contentId: media.contentId,
    category: (media.rejectCategory as RejectCategory) ?? "NON_COSPLAY",
    reason: media.rejectReason,
    rejectedAt: (media.rejectedAt ?? new Date()).toISOString(),
    quarantinedPath: media.quarantinedPath,
    movedFiles,
    missingFiles,
  };
}

/** Daftar media terkarantina + statistik per kategori. */
export async function listQuarantined(): Promise<{
  items: QuarantinedItem[];
  stats: QuarantineStats;
}> {
  const rows = await db.prisma.media.findMany({
    where: { status: "REJECTED", quarantinedPath: { not: null } },
    orderBy: { rejectedAt: "desc" },
  });

  const items: QuarantinedItem[] = [];
  const byCategory = Object.fromEntries(
    REJECT_CATEGORIES.map((c) => [c, { count: 0, sizeBytes: 0 }])
  ) as QuarantineStats["byCategory"];
  let totalCount = 0;
  let totalSize = 0;

  for (const row of rows) {
    const category = isRejectCategory(row.rejectCategory) ? row.rejectCategory : "NON_COSPLAY";
    const sizeBytes = Number(row.sizeBytes);
    items.push({
      id: row.id,
      contentId: row.contentId,
      title: row.title,
      mediaType: row.mediaType,
      sizeBytes,
      category,
      reason: row.rejectReason,
      rejectedAt: (row.rejectedAt ?? row.createdAt).toISOString(),
      quarantinedPath: row.quarantinedPath as string,
      fileExists: await fileExists(resolveRejectedPath(row.quarantinedPath as string)),
    });
    byCategory[category].count += 1;
    byCategory[category].sizeBytes += sizeBytes;
    totalCount += 1;
    totalSize += sizeBytes;
  }

  return { items, stats: { total: { count: totalCount, sizeBytes: totalSize }, byCategory } };
}

/**
 * Hapus permanen media terkarantina. `confirm` harus sama dengan
 * contentId (atau UUID bila CID kosong) — pengaman anti salah klik.
 */
export async function purgeQuarantined(
  mediaId: string,
  confirm: string
): Promise<{ id: string; removedFiles: string[] }> {
  const media = await db.prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) throw new Error("Media tidak ditemukan");
  if (!media.quarantinedPath) throw new Error("Media tidak berada dalam karantina");

  const expected = media.contentId?.trim() || media.id;
  if (confirm.trim() !== expected) {
    throw new Error(`Konfirmasi tidak cocok. Ketik "${expected}" untuk menghapus permanen.`);
  }

  const manifest = await fs
    .readFile(manifestPathFor(media.quarantinedPath), "utf8")
    .then((raw) => JSON.parse(raw) as QuarantineManifest)
    .catch(() => null);

  const files: QuarantineFile[] =
    manifest?.files ?? [
      {
        role: "main",
        original: media.previousStoragePath ?? media.storagePath,
        quarantined: media.quarantinedPath,
      },
    ];

  const removedFiles: string[] = [];
  for (const file of files) {
    const abs = resolveRejectedPath(file.quarantined);
    try {
      await fs.unlink(abs);
      removedFiles.push(file.quarantined);
    } catch {
      // sudah tidak ada — abaikan
    }
  }
  await fs.unlink(manifestPathFor(media.quarantinedPath)).catch(() => {});
  await fs.rmdir(path.dirname(resolveRejectedPath(media.quarantinedPath))).catch(() => {});

  await db.prisma.media.delete({ where: { id: media.id } });

  publishEvent({
    type: "media.purged",
    title: `Media dihapus permanen: ${media.title.slice(0, 50)}`,
    message: media.rejectCategory ?? undefined,
    payload: { mediaId: media.id, contentId: media.contentId },
  });

  return { id: media.id, removedFiles };
}
