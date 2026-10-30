import fs from "node:fs/promises";
import path from "node:path";
import { statfs } from "node:fs/promises";
import { db } from "@/db/client";
import { REJECTED_ROOT, UPLOADS_ROOT } from "@/lib/paths";
import { publishEvent } from "@/lib/events";

/**
 * Retensi per role. File dihapus setelah TTL, metadata tetap tersimpan
 * dengan status ARCHIVED (zero-delete pada level record).
 */

export const DEFAULT_POLICIES: Record<string, number> = {
  video: 180,
  cover: 90,
  frame: 14,
  pin: 30,
  thumb: 90,
  rejected: 90,
};

export const RETENTION_ROLES = Object.keys(DEFAULT_POLICIES);

const DAY_MS = 86_400_000;

export async function getPolicies(): Promise<Record<string, number>> {
  const rows = await db.prisma.retentionPolicy.findMany();
  const map = { ...DEFAULT_POLICIES };
  for (const row of rows) map[row.role] = row.retentionDays;
  return map;
}

export async function setPolicy(role: string, retentionDays: number): Promise<void> {
  await db.prisma.retentionPolicy.upsert({
    where: { role },
    create: { role, retentionDays },
    update: { retentionDays },
  });
}

function policyFor(
  policies: Record<string, number>,
  media: { status: string; role: string }
): number {
  if (media.status === "REJECTED") return policies.rejected ?? DEFAULT_POLICIES.rejected;
  return policies[media.role] ?? DEFAULT_POLICIES.video;
}

function baseDate(media: {
  status: string;
  publishedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
}): Date {
  if (media.status === "REJECTED") return media.rejectedAt ?? media.createdAt;
  return media.publishedAt ?? media.createdAt;
}

/** Hitung/segarkan purgeAt untuk semua media yang belum ARCHIVED. */
export async function refreshPurgeAt(): Promise<number> {
  const policies = await getPolicies();
  const media = await db.prisma.media.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true,
      role: true,
      status: true,
      publishedAt: true,
      rejectedAt: true,
      createdAt: true,
      purgeAt: true,
    },
  });

  let updated = 0;
  for (const m of media) {
    const days = policyFor(policies, m);
    const purgeAt = new Date(baseDate(m).getTime() + days * DAY_MS);
    if (!m.purgeAt || Math.abs(m.purgeAt.getTime() - purgeAt.getTime()) > 1000) {
      await db.prisma.media.update({ where: { id: m.id }, data: { purgeAt } });
      updated += 1;
    }
  }
  return updated;
}

export interface RetentionCandidate {
  id: string;
  contentId: string | null;
  title: string;
  role: string;
  status: string;
  sizeBytes: number;
  purgeAt: string;
}

export interface RetentionResult {
  dryRun: boolean;
  candidates: RetentionCandidate[];
  freedBytes: number;
  purged: number;
  refreshed: number;
}

async function removeFile(rel: string | null, root: string): Promise<number> {
  if (!rel) return 0;
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return 0;
  try {
    const stat = await fs.stat(abs);
    await fs.unlink(abs);
    return stat.size;
  } catch {
    return 0;
  }
}

export async function runRetention(opts: { dryRun?: boolean } = {}): Promise<RetentionResult> {
  const dryRun = opts.dryRun !== false;
  const refreshed = await refreshPurgeAt();
  const now = new Date();

  const due = await db.prisma.media.findMany({
    where: { purgeAt: { lte: now }, status: { not: "ARCHIVED" } },
    orderBy: { purgeAt: "asc" },
  });

  const candidates: RetentionCandidate[] = due.map((m) => ({
    id: m.id,
    contentId: m.contentId,
    title: m.title,
    role: m.role,
    status: m.status,
    sizeBytes: Number(m.sizeBytes),
    purgeAt: (m.purgeAt ?? now).toISOString(),
  }));
  const freedBytes = candidates.reduce((sum, c) => sum + c.sizeBytes, 0);

  if (dryRun) {
    return { dryRun: true, candidates, freedBytes, purged: 0, refreshed };
  }

  let purged = 0;
  for (const media of due) {
    await removeFile(media.storagePath, UPLOADS_ROOT);
    await removeFile(media.thumbnailPath, UPLOADS_ROOT);
    await removeFile(media.previewPath, UPLOADS_ROOT);
    if (media.quarantinedPath) {
      await removeFile(media.quarantinedPath, REJECTED_ROOT);
      await fs
        .rm(path.join(REJECTED_ROOT, path.dirname(media.quarantinedPath)), { recursive: true, force: true })
        .catch(() => {});
    }

    await db.prisma.media.update({
      where: { id: media.id },
      data: { status: "ARCHIVED", pipelineStage: "archived" },
    });
    await db.prisma.mediaAudit.create({
      data: {
        mediaId: media.id,
        action: "archived",
        fromStatus: media.status,
        toStatus: "ARCHIVED",
        actorType: "SYSTEM",
        actorName: "retention-job",
        reasonCode: "RETENTION_TTL",
        note: `purgeAt ${(media.purgeAt ?? now).toISOString()}`,
      },
    });
    purged += 1;
  }

  if (purged > 0) {
    publishEvent({
      type: "media.archived",
      title: `Retensi: ${purged} media diarsipkan`,
      message: `${(freedBytes / 1024 / 1024).toFixed(1)} MB dibebaskan`,
      payload: { purged, freedBytes },
    });
  }

  return { dryRun: false, candidates, freedBytes, purged, refreshed };
}

export interface StorageReport {
  total: { count: number; sizeBytes: number };
  perRole: Record<string, { count: number; sizeBytes: number }>;
  perStatus: Record<string, { count: number; sizeBytes: number }>;
  purgeable: { count: number; sizeBytes: number };
  projection30dBytes: number;
  disk: { totalBytes: number; freeBytes: number; usedPercent: number } | null;
  generatedAt: string;
}

export async function storageReport(): Promise<StorageReport> {
  const media = await db.prisma.media.findMany({
    select: { role: true, status: true, sizeBytes: true, purgeAt: true, createdAt: true },
  });
  const now = Date.now();
  const perRole: StorageReport["perRole"] = {};
  const perStatus: StorageReport["perStatus"] = {};
  let totalCount = 0;
  let totalSize = 0;
  let purgeableCount = 0;
  let purgeableSize = 0;
  let recentBytes = 0;

  for (const m of media) {
    const size = Number(m.sizeBytes);
    totalCount += 1;
    totalSize += size;
    perRole[m.role] ??= { count: 0, sizeBytes: 0 };
    perRole[m.role].count += 1;
    perRole[m.role].sizeBytes += size;
    perStatus[m.status] ??= { count: 0, sizeBytes: 0 };
    perStatus[m.status].count += 1;
    perStatus[m.status].sizeBytes += size;
    if (m.purgeAt && m.purgeAt.getTime() <= now && m.status !== "ARCHIVED") {
      purgeableCount += 1;
      purgeableSize += size;
    }
    if (m.createdAt.getTime() >= now - 7 * DAY_MS) recentBytes += size;
  }

  const disk = await statfs(UPLOADS_ROOT).catch(() => null);
  const diskTotal = disk ? Number(disk.blocks) * Number(disk.bsize) : 0;
  const diskFree = disk ? Number(disk.bavail) * Number(disk.bsize) : 0;

  return {
    total: { count: totalCount, sizeBytes: totalSize },
    perRole,
    perStatus,
    purgeable: { count: purgeableCount, sizeBytes: purgeableSize },
    projection30dBytes: Math.round((recentBytes / 7) * 30),
    disk: diskTotal
      ? { totalBytes: diskTotal, freeBytes: diskFree, usedPercent: ((diskTotal - diskFree) / diskTotal) * 100 }
      : null,
    generatedAt: new Date().toISOString(),
  };
}
