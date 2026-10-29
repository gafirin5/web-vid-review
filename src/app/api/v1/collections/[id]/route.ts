import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAgent } from "@/lib/agent-auth";
import { isAdminRequest } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadCollection(id: string) {
  return db.prisma.collection.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      agent: { select: { id: true, name: true } },
      items: {
        orderBy: { position: "asc" },
        include: {
          media: {
            include: {
              agent: { select: { id: true, name: true } },
              tags: { include: { tag: true } },
            },
          },
        },
      },
    },
  });
}

/** GET /api/v1/collections/:id (id atau slug) */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/collections/[id]">
) {
  const { id } = await ctx.params;
  const collection = await loadCollection(id);
  if (!collection) return jsonError("Koleksi tidak ditemukan", 404);
  if (!collection.isPublic) return jsonError("Koleksi privat", 403);
  return jsonOk({ ...collection, itemCount: collection.items.length });
}

/** PATCH /api/v1/collections/:id — pemilik/admin. Body: { name?, description?, isPublic? } */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/collections/[id]">
) {
  const { id } = await ctx.params;
  const collection = await loadCollection(id);
  if (!collection) return jsonError("Koleksi tidak ditemukan", 404);

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);
  const admin = await isAdminRequest();
  if (!admin && collection.agentId !== identity.agent?.id) {
    return jsonError("Anda bukan pemilik koleksi ini", 403);
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
  if (typeof body?.description === "string") data.description = body.description.slice(0, 2000);
  if (typeof body?.isPublic === "boolean") data.isPublic = body.isPublic;
  if (Object.keys(data).length === 0) return jsonError("Tidak ada field yang diubah");

  const updated = await db.prisma.collection.update({ where: { id: collection.id }, data });
  return jsonOk(updated);
}

/** DELETE /api/v1/collections/:id — pemilik/admin (item tidak menghapus media). */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/collections/[id]">
) {
  const { id } = await ctx.params;
  const collection = await loadCollection(id);
  if (!collection) return jsonError("Koleksi tidak ditemukan", 404);

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);
  const admin = await isAdminRequest();
  if (!admin && collection.agentId !== identity.agent?.id) {
    return jsonError("Anda bukan pemilik koleksi ini", 403);
  }

  await db.prisma.collection.delete({ where: { id: collection.id } });
  return jsonOk({ deleted: collection.id });
}