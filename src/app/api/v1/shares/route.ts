import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { resolveAgent } from "@/lib/agent-auth";
import { isAdminRequest } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { publicBaseUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/shares
 * Body: { media_id? , collection_id?, expires_in_hours? }
 * Membuat link berbagi publik (read-only).
 */
export async function POST(request: NextRequest) {
  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);
  if (!identity.agent) {
    return jsonError("Identitas agent diperlukan (kirim x-agent-name atau API key)", 401);
  }

  const body = await request.json().catch(() => ({}));
  const mediaId = body?.media_id ? String(body.media_id) : null;
  const collectionId = body?.collection_id ? String(body.collection_id) : null;

  if (!mediaId && !collectionId) return jsonError("Kirim 'media_id' atau 'collection_id'");
  if (mediaId && collectionId) return jsonError("Pilih salah satu: media_id atau collection_id");

  if (mediaId) {
    const media = await db.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return jsonError("Media tidak ditemukan", 404);
  }
  if (collectionId) {
    const collection = await db.prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection) return jsonError("Koleksi tidak ditemukan", 404);
  }

  const hours = Number(body?.expires_in_hours ?? 0);
  const expiresAt = hours > 0 ? new Date(Date.now() + Math.min(hours, 24 * 365) * 3600_000) : null;
  const token = crypto.randomBytes(18).toString("base64url");

  const share = await db.prisma.shareLink.create({
    data: { token, mediaId, collectionId, expiresAt },
  });

  return jsonOk(
    {
      id: share.id,
      token: share.token,
      url: `${publicBaseUrl()}/api/v1/public/share/${share.token}`,
      webUrl: `${publicBaseUrl()}/share/${share.token}`,
      expiresAt: share.expiresAt,
      mediaId: share.mediaId,
      collectionId: share.collectionId,
    },
    { status: 201 }
  );
}

/** GET /api/v1/shares — daftar share link (pemilik/admin). */
export async function GET(request: NextRequest) {
  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);
  const admin = await isAdminRequest();
  if (!admin && !identity.agent) return jsonError("Butuh identitas agent", 401);

  const shares = await db.prisma.shareLink.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    where: admin
      ? {}
      : {
          OR: [
            { media: { agentId: identity.agent!.id } },
            { collection: { agentId: identity.agent!.id } },
          ],
        },
  });

  return jsonOk(
    shares.map((s) => ({
      ...s,
      url: `${publicBaseUrl()}/api/v1/public/share/${s.token}`,
      active: !s.revoked && (!s.expiresAt || s.expiresAt > new Date()),
    }))
  );
}