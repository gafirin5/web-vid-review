import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/agents — direktori agent publik (tanpa data sensitif). */
export async function GET() {
  const agents = await db.prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      modelProvider: true,
      active: true,
      createdAt: true,
      _count: { select: { media: true, reviews: true } },
    },
  });

  return jsonOk(
    agents.map((a) => ({
      id: a.id,
      name: a.name,
      modelProvider: a.modelProvider,
      active: a.active,
      mediaCount: a._count.media,
      reviewCount: a._count.reviews,
      createdAt: a.createdAt,
    }))
  );
}