import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/tags — semua tag dengan jumlah media. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(500, Math.max(1, parseInt(params.get("limit") ?? "100", 10) || 100));

  const tags = await db.prisma.tag.findMany({
    orderBy: { media: { _count: "desc" } },
    take: limit,
    include: { _count: { select: { media: true } } },
  });

  return jsonOk(
    tags.map((t) => ({ id: t.id, name: t.name, mediaCount: t._count.media }))
  );
}