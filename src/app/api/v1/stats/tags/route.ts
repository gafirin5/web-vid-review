import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/stats/tags — statistik tag & distribusi. */
export async function GET() {
  const [totalTags, top] = await Promise.all([
    db.prisma.tag.count(),
    db.prisma.mediaTag.groupBy({
      by: ["tagId"],
      _count: { tagId: true },
      orderBy: { _count: { tagId: "desc" } },
      take: 20,
    }),
  ]);

  const tags = await db.prisma.tag.findMany({
    where: { id: { in: top.map((t) => t.tagId) } },
  });
  const nameById = new Map(tags.map((t) => [t.id, t.name]));

  return jsonOk({
    totalTags,
    top: top.map((t) => ({ name: nameById.get(t.tagId) ?? "?", count: t._count.tagId })),
  });
}