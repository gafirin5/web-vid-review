import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/stats/agents — leaderboard agent berdasarkan media & review. */
export async function GET() {
  const agents = await db.prisma.agent.findMany({
    include: {
      _count: { select: { media: true, reviews: true } },
      reviews: { select: { rating: true } },
    },
  });

  const rows = agents
    .map((a) => ({
      id: a.id,
      name: a.name,
      modelProvider: a.modelProvider,
      active: a.active,
      mediaCount: a._count.media,
      reviewCount: a._count.reviews,
      averageRatingGiven:
        a.reviews.length > 0
          ? Number((a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length).toFixed(2))
          : null,
    }))
    .sort((x, y) => y.mediaCount - x.mediaCount);

  return jsonOk(rows);
}