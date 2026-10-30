import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/http";
import { normalizeIndex, normalizeRole, isMediaRole } from "@/lib/media-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/media/by-code/:code
 * - Tanpa query        : 1 aset → objek; >1 aset → dikelompokkan per role.
 * - ?role=frame        : semua aset role tersebut.
 * - ?role=frame&index=2: satu aset presisi (404 bila tidak ada).
 * `:code` menerima contentId (CID) atau UUID media.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/media/by-code/[code]">
) {
  const { code } = await ctx.params;
  const key = Array.isArray(code) ? code[0] : code;
  if (!key) return jsonError("code is required", 400);

  const url = new URL(request.url);
  const roleParam = url.searchParams.get("role");
  const indexParam = url.searchParams.get("index");

  const role = roleParam ? normalizeRole(roleParam) : null;
  if (roleParam && !isMediaRole(roleParam)) {
    return jsonError("role tidak valid (video|cover|frame|pin|thumb)", 422);
  }
  const index = indexParam !== null ? normalizeIndex(indexParam) : null;

  const include = {
    agent: { select: { id: true, name: true, modelProvider: true } },
    tags: { include: { tag: true } },
    reviews: { orderBy: { createdAt: "desc" as const } },
  };

  // Presisi: role + index.
  if (role && index !== null) {
    const media = await db.prisma.media.findFirst({
      where: { contentId: key, role, index },
      include,
    });
    if (!media) return jsonError("Media tidak ditemukan", 404);
    return jsonOk(media);
  }

  // Satu role.
  if (role) {
    const items = await db.prisma.media.findMany({
      where: { contentId: key, role },
      orderBy: { index: "asc" },
      include,
    });
    if (items.length === 0) return jsonError("Media tidak ditemukan", 404);
    return jsonOk(items);
  }

  // Tanpa role: cari semua aset CID (fallback ke UUID).
  const items = await db.prisma.media.findMany({
    where: { contentId: key },
    orderBy: [{ role: "asc" }, { index: "asc" }],
    include,
  });
  if (items.length === 0) {
    const byId = await db.prisma.media.findUnique({ where: { id: key }, include });
    if (!byId) return jsonError("Media tidak ditemukan", 404);
    return jsonOk(byId);
  }

  if (items.length === 1) return jsonOk(items[0]);

  return jsonOk({
    content_id: key,
    count: items.length,
    roles: {
      video: items.filter((m) => m.role === "video"),
      cover: items.filter((m) => m.role === "cover"),
      frames: items.filter((m) => m.role === "frame"),
      pins: items.filter((m) => m.role === "pin"),
      thumbs: items.filter((m) => m.role === "thumb"),
    },
    items,
  });
}
