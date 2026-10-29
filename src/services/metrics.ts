import fs from "node:fs/promises";
import { statfs } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { UPLOADS_ROOT } from "@/lib/paths";
import { BACKUPS_DIR, dbFilePath } from "@/services/backup";

export interface StorageMetrics {
  disk: { totalBytes: number; freeBytes: number; usedPercent: number | null; status: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN" };
  folders: Array<{ name: string; path: string; sizeBytes: number; fileCount: number }>;
  database: { sizeBytes: number };
}

async function dirSize(dir: string): Promise<{ sizeBytes: number; fileCount: number }> {
  let size = 0;
  let count = 0;
  const walk = async (d: string) => {
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const stat = await fs.stat(full).catch(() => null);
        if (stat) {
          size += stat.size;
          count++;
        }
      }
    }
  };
  await walk(dir);
  return { sizeBytes: size, fileCount: count };
}

export async function getStorageMetrics(): Promise<StorageMetrics> {
  const [disk, videos, images, thumbnails, backups, dbStat] = await Promise.all([
    statfs(UPLOADS_ROOT).catch(() => null),
    dirSize(path.join(UPLOADS_ROOT, "videos")),
    dirSize(path.join(UPLOADS_ROOT, "images")),
    dirSize(path.join(UPLOADS_ROOT, "thumbnails")),
    dirSize(BACKUPS_DIR),
    fs.stat(dbFilePath()).catch(() => null),
  ]);

  const totalBytes = disk ? Number(disk.blocks) * Number(disk.bsize) : 0;
  const freeBytes = disk ? Number(disk.bavail) * Number(disk.bsize) : 0;
  const usedPercent = totalBytes ? ((totalBytes - freeBytes) / totalBytes) * 100 : null;
  const status =
    usedPercent == null ? "UNKNOWN" : usedPercent > 90 ? "CRITICAL" : usedPercent > 80 ? "WARNING" : "HEALTHY";

  return {
    disk: { totalBytes, freeBytes, usedPercent: usedPercent != null ? Number(usedPercent.toFixed(1)) : null, status },
    folders: [
      { name: "Video", path: "uploads/videos", ...videos },
      { name: "Foto", path: "uploads/images", ...images },
      { name: "Thumbnail", path: "uploads/thumbnails", ...thumbnails },
      { name: "Backup", path: "backups", ...backups },
    ],
    database: { sizeBytes: dbStat?.size ?? 0 },
  };
}

export interface OverviewMetrics {
  totals: {
    media: number;
    videos: number;
    images: number;
    reviews: number;
    humanReviews: number;
    aiReviews: number;
    agents: number;
    tags: number;
    totalSizeBytes: number;
    totalVideoDurationSeconds: number;
    averageRating: number | null;
  };
  uploadTrend: Array<{ date: string; videos: number; images: number }>;
  topTags: Array<{ name: string; count: number }>;
  agentBreakdown: Array<{ name: string; mediaCount: number; reviewCount: number; avgRating: number | null }>;
  ratingDistribution: Array<{ rating: number; count: number }>;
}

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const [
    totalMedia,
    totalVideos,
    totalImages,
    totalReviews,
    humanReviews,
    aiReviews,
    totalAgents,
    totalTags,
    mediaAgg,
    videoAgg,
    avgRatingAgg,
  ] = await Promise.all([
    db.prisma.media.count(),
    db.prisma.media.count({ where: { mediaType: "VIDEO" } }),
    db.prisma.media.count({ where: { mediaType: "IMAGE" } }),
    db.prisma.review.count(),
    db.prisma.review.count({ where: { authorType: "HUMAN" } }),
    db.prisma.review.count({ where: { authorType: "AI" } }),
    db.prisma.agent.count(),
    db.prisma.tag.count(),
    db.prisma.media.aggregate({ _sum: { sizeBytes: true } }),
    db.prisma.media.aggregate({ where: { mediaType: "VIDEO" }, _sum: { durationSeconds: true } }),
    db.prisma.review.aggregate({ _avg: { rating: true } }),
  ]);

  // Tren upload 14 hari terakhir
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);
  const recentMedia = await db.prisma.media.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, mediaType: true },
  });
  const trendMap = new Map<string, { videos: number; images: number }>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    trendMap.set(d.toISOString().slice(0, 10), { videos: 0, images: 0 });
  }
  for (const m of recentMedia) {
    const key = m.createdAt.toISOString().slice(0, 10);
    const entry = trendMap.get(key);
    if (entry) {
      if (m.mediaType === "VIDEO") entry.videos++;
      else entry.images++;
    }
  }
  const uploadTrend = Array.from(trendMap.entries()).map(([date, v]) => ({
    date: date.slice(5), // MM-DD
    ...v,
  }));

  // Tag terpopuler
  const topTagRows = await db.prisma.mediaTag.groupBy({
    by: ["tagId"],
    _count: { tagId: true },
    orderBy: { _count: { tagId: "desc" } },
    take: 10,
  });
  const tags = await db.prisma.tag.findMany({
    where: { id: { in: topTagRows.map((t) => t.tagId) } },
  });
  const tagNameById = new Map(tags.map((t) => [t.id, t.name]));
  const topTags = topTagRows.map((row) => ({
    name: tagNameById.get(row.tagId) ?? "?",
    count: row._count.tagId,
  }));

  // Agent breakdown
  const agents = await db.prisma.agent.findMany({
    include: {
      media: { select: { id: true } },
      reviews: { select: { rating: true } },
    },
  });
  const agentBreakdown = agents
    .map((a) => {
      const avg = a.reviews.length
        ? a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length
        : null;
      return {
        name: a.name,
        mediaCount: a.media.length,
        reviewCount: a.reviews.length,
        avgRating: avg != null ? Number(avg.toFixed(1)) : null,
      };
    })
    .sort((x, y) => y.mediaCount - x.mediaCount)
    .slice(0, 10);

  // Distribusi rating
  const ratingRows = await db.prisma.review.groupBy({
    by: ["rating"],
    _count: { rating: true },
  });
  const ratingDistribution = Array.from({ length: 10 }, (_, i) => {
    const rating = i + 1;
    const row = ratingRows.find((r) => r.rating === rating);
    return { rating, count: row?._count.rating ?? 0 };
  });

  return {
    totals: {
      media: totalMedia,
      videos: totalVideos,
      images: totalImages,
      reviews: totalReviews,
      humanReviews,
      aiReviews,
      agents: totalAgents,
      tags: totalTags,
      totalSizeBytes: Number(mediaAgg._sum.sizeBytes ?? 0),
      totalVideoDurationSeconds: videoAgg._sum.durationSeconds ?? 0,
      averageRating:
        avgRatingAgg._avg.rating != null ? Number(avgRatingAgg._avg.rating.toFixed(2)) : null,
    },
    uploadTrend,
    topTags,
    agentBreakdown,
    ratingDistribution,
  };
}
