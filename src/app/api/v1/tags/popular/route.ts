import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/tags/popular?limit=10 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, parseInt(params.get("limit") ?? "10", 10) || 10));

  const rows = await db.prisma.mediaTag.groupBy({
    by: ["tagId"],
    _count: { tagId: true },
    orderBy: { _count: { tagId: "desc" } },
    take: limit,
  });
  const tags = await db.prisma.tag.findMany({
    where: { id: { in: rows.map((r) => r.tagId) } },
  });
  const nameById = new Map(tags.map((t) => [t.id, t.name]));

  return jsonOk(
    rows.map((r) => ({ name: nameById.get(r.tagId) ?? "?", count: r._count.tagId }))
  );
}