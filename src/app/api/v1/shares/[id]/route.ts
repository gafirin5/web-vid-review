import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAgent } from "@/lib/agent-auth";
import { isAdminRequest } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/v1/shares/:id — revoke share link (pemilik/admin). */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/shares/[id]">
) {
  const { id } = await ctx.params;
  const share = await db.prisma.shareLink.findUnique({
    where: { id },
    include: {
      media: { select: { agentId: true } },
      collection: { select: { agentId: true } },
    },
  });
  if (!share) return jsonError("Share link tidak ditemukan", 404);

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);
  const admin = await isAdminRequest();

  const ownerId = share.media?.agentId ?? share.collection?.agentId ?? null;
  if (!admin && ownerId !== identity.agent?.id) {
    return jsonError("Anda bukan pemilik share link ini", 403);
  }

  await db.prisma.shareLink.update({ where: { id }, data: { revoked: true } });
  return jsonOk({ revoked: id });
}