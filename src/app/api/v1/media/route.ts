import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/media
 * Query: ?media_type=IMAGE|VIDEO&search=&tag=&agent=&page=1&limit=24&sort=newest|oldest|size
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "24", 10) || 24));
  const mediaType = params.get("media_type");
  const search = params.get("search")?.trim();
  const tag = params.get("tag")?.trim().toLowerCase();
  const agent = params.get("agent")?.trim();
  const sort = params.get("sort") ?? "newest";
  // Default: hanya media yang disetujui. Override dengan ?status=ALL|PENDING_REVIEW|REJECTED|ARCHIVED.
  const statusParam = params.get("status") ?? "APPROVED";

  const where: Record<string, unknown> = {};
  if (statusParam !== "ALL") where.status = statusParam;
  if (mediaType === "IMAGE" || mediaType === "VIDEO") where.mediaType = mediaType;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { prompt: { contains: search } },
    ];
  }
  if (tag) where.tags = { some: { tag: { name: tag } } };
  if (agent) where.agent = { name: { contains: agent } };

  const orderBy: Record<string, string> =
    sort === "oldest" ? { createdAt: "asc" } : sort === "size" ? { sizeBytes: "desc" } : { createdAt: "desc" };

  const [items, total] = await Promise.all([
    db.prisma.media.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        agent: { select: { id: true, name: true, modelProvider: true } },
        tags: { include: { tag: true } },
      },
    }),
    db.prisma.media.count({ where }),
  ]);

  return jsonOk({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
