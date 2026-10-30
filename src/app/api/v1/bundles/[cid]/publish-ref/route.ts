import type { NextRequest } from "next/server";
import { resolveAgent } from "@/lib/agent-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { setPublishRefs } from "@/services/bundles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/bundles/:cid/publish-ref
 * Body: { youtube_video_id?, zernio_post_id?, pinterest_pin_id?, tiktok_post_id?, ... }
 * Menyimpan externalRefs + publishedAt + pipelineStage=published.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/bundles/[cid]/publish-ref">
) {
  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);

  const { cid } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Body JSON wajib diisi", 400);

  const allowed = ["youtube_video_id", "zernio_post_id", "pinterest_pin_id", "tiktok_post_id"] as const;
  const refs: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) refs[key] = value.trim();
  }
  // Terima juga externalRefs bebas (mis. platform lain).
  const extra = (body as Record<string, unknown>).external_refs;
  if (extra && typeof extra === "object") Object.assign(refs, extra);

  if (Object.keys(refs).length === 0) {
    return jsonError("Minimal satu referensi publish wajib diisi", 422);
  }

  try {
    return jsonOk(await setPublishRefs(cid, refs));
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Gagal menyimpan referensi", 422);
  }
}
