import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAgent } from "@/lib/agent-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "koleksi";
}

/** GET /api/v1/collections — daftar koleksi publik. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const agentName = params.get("agent");
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "50", 10) || 50));

  const collections = await db.prisma.collection.findMany({
    where: {
      isPublic: true,
      ...(agentName ? { agent: { name: agentName } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agent: { select: { id: true, name: true } },
      items: {
        orderBy: { position: "asc" },
        take: 4,
        include: {
          media: { select: { id: true, title: true, thumbnailPath: true, mediaType: true } },
        },
      },
      _count: { select: { items: true } },
    },
  });

  return jsonOk(
    collections.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      isPublic: c.isPublic,
      agent: c.agent,
      itemCount: c._count.items,
      cover: c.items[0]?.media ?? null,
      createdAt: c.createdAt,
    }))
  );
}

/**
 * POST /api/v1/collections
 * Body: { name, description?, isPublic? }
 */
export async function POST(request: NextRequest) {
  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);
  if (!identity.agent) {
    return jsonError("Identitas agent diperlukan (kirim x-agent-name atau API key)", 401);
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 120);
  if (!name) return jsonError("'name' wajib diisi");

  const base = slugify(name);
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const exists = await db.prisma.collection.findUnique({ where: { slug } });
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const collection = await db.prisma.collection.create({
    data: {
      name,
      slug,
      description: body?.description ? String(body.description).slice(0, 2000) : null,
      isPublic: body?.isPublic !== false,
      agentId: identity.agent.id,
    },
  });

  return jsonOk({ ...collection, itemCount: 0 }, { status: 201 });
}