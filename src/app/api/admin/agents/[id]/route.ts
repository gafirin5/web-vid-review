import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/agents/:id — ubah nama/provider/status agent. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/agents/[id]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.modelProvider === "string") data.modelProvider = body.modelProvider.trim();
  if (typeof body?.active === "boolean") data.active = body.active;
  if (Object.keys(data).length === 0) return jsonError("Tidak ada field yang diubah");

  try {
    const agent = await db.prisma.agent.update({ where: { id }, data });
    return jsonOk({ id: agent.id, name: agent.name, active: agent.active });
  } catch {
    return jsonError("Agent tidak ditemukan", 404);
  }
}

/** DELETE /api/admin/agents/:id — hapus agent (media tetap ada, tanpa atribusi). */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/agents/[id]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  try {
    await db.prisma.agent.delete({ where: { id } });
    return jsonOk({ deleted: id });
  } catch {
    return jsonError("Agent tidak ditemukan", 404);
  }
}
