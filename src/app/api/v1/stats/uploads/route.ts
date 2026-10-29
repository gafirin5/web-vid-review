import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/stats/uploads — statistik upload agregat. */
export async function GET() {
  const [mediaAgg, videoAgg, imageAgg, dailyAgg] = await Promise.all([
    db.prisma.media.aggregate({ _count: true, _sum: { sizeBytes: true } }),
    db.prisma.media.aggregate({
      where: { mediaType: "VIDEO" },
      _count: true,
      _sum: { sizeBytes: true, durationSeconds: true },
    }),
    db.prisma.media.aggregate({
      where: { mediaType: "IMAGE" },
      _count: true,
      _sum: { sizeBytes: true },
    }),
    db.prisma.media.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  return jsonOk({
    totalMedia: mediaAgg._count,
    totalSizeBytes: Number(mediaAgg._sum.sizeBytes ?? 0),
    videos: {
      count: videoAgg._count,
      sizeBytes: Number(videoAgg._sum.sizeBytes ?? 0),
      durationSeconds: videoAgg._sum.durationSeconds ?? 0,
    },
    images: {
      count: imageAgg._count,
      sizeBytes: Number(imageAgg._sum.sizeBytes ?? 0),
    },
    byStatus: Object.fromEntries(dailyAgg.map((r) => [r.status, r._count.status])),
  });
}