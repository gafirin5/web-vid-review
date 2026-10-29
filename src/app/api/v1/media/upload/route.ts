import type { NextRequest } from "next/server";
import { ingestMedia } from "@/lib/ingestion";
import { resolveAgent } from "@/lib/agent-auth";
import { APP_CONFIG } from "@/lib/app-config";
import { jsonError, jsonOk } from "@/lib/http";
import { clientIp, limitByIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/v1/media/upload
 * Dua mode:
 *  1. multipart/form-data dengan field "file" (+ title, description, tags, prompt...)
 *  2. application/json: { source_url | source_path | base64, file_name, title, ... }
 *
 * Autentikasi:
 *  - AUTH_MODE=open (default): tanpa key pun bisa; identitas agent dari header `x-agent-name`.
 *  - Dengan API key: agent terautentikasi penuh.
 */
export async function POST(request: NextRequest) {
  // Rate limit dasar per IP (semua pemanggil).
  const limited = limitByIp(request, "upload", RATE_LIMITS.uploadPerMinute);
  if (!limited.ok) {
    return jsonError(
      `Rate limit terlampaui — coba lagi dalam ${limited.retryAfterSeconds} detik`,
      429
    );
  }

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);

  const isOpenAnonymous = identity.anonymous && Boolean(identity.agent);
  if (isOpenAnonymous) {
    // Kuota khusus anonim (per IP per jam).
    const quota = rateLimit(
      `anon-upload:${clientIp(request)}`,
      APP_CONFIG.anonUploadPerHour,
      3600_000
    );
    if (!quota.ok) {
      return jsonError(
        `Kuota upload anonim tercapai (${APP_CONFIG.anonUploadPerHour}/jam). ` +
          `Daftarkan agent di /api/v1/agents/register untuk mendapatkan API key.`,
        429
      );
    }
  }

  const agentId = identity.agent?.id ?? null;
  const defaultStatus = isOpenAnonymous ? APP_CONFIG.anonStatus : "APPROVED";

  const contentType = request.headers.get("content-type") ?? "";
  let result;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonError("Missing 'file' field in multipart form data");
      }
      const tags = form.get("tags");
      result = await ingestMedia({
        buffer: Buffer.from(await file.arrayBuffer()),
        fileName: file.name,
        title: String(form.get("title") ?? file.name),
        description: (form.get("description") as string) || undefined,
        tags: tags ? String(tags).split(",").map((t) => t.trim()) : undefined,
        prompt: (form.get("prompt") as string) || undefined,
        negativePrompt: (form.get("negative_prompt") as string) || undefined,
        transcript: (form.get("transcript") as string) || undefined,
        contentId: (form.get("content_id") as string) || undefined,
        needsCharacterReview: form.get("needs_character_review") === "true",
        agentId,
        defaultStatus,
      });
    } else {
      const body = await request.json();
      if (!body?.title) return jsonError("'title' is required");
      result = await ingestMedia({
        sourceUrl: body.source_url,
        sourcePath: body.source_path,
        base64: body.base64,
        fileName: body.file_name,
        title: body.title,
        description: body.description,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        prompt: body.prompt,
        negativePrompt: body.negative_prompt,
        transcript: body.transcript,
        contentId: body.content_id,
        needsCharacterReview: body.needs_character_review === true,
        agentId,
        defaultStatus,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return jsonError(message, 422);
  }

  const media = await import("@/db/client").then(({ db }) =>
    db.prisma.media.findUnique({
      where: { id: result.mediaId },
      include: {
        agent: { select: { id: true, name: true, modelProvider: true } },
        tags: { include: { tag: true } },
      },
    })
  );

  return jsonOk(
    {
      id: result.mediaId,
      content_id: media?.contentId ?? null,
      duplicate: Boolean(result.duplicateOf),
      duplicate_of: result.duplicateOf,
      uploaded_by: identity.agent?.name ?? "manual",
      anonymous: identity.anonymous,
      media,
    },
    { status: 201 }
  );
}