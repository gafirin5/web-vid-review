import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { extractApiKey, resolveAgent } from "@/lib/agent-auth";
import { APP_CONFIG } from "@/lib/app-config";
import { jsonError, jsonOk } from "@/lib/http";
import { publishEvent } from "@/lib/events";
import { clientIp, limitByIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BulkReviewItem {
  media_id?: string;
  rating?: number;
  comment?: string;
  timestamp_seconds?: number;
}

/**
 * POST /api/v1/reviews/bulk
 * Body: { items: [{ media_id, rating, comment?, timestamp_seconds? }], author_name? }
 */
export async function POST(request: NextRequest) {
  const limited = limitByIp(request, "review", 30, 60_000);
  if (!limited.ok) {
    return jsonError(`Rate limit — coba lagi dalam ${limited.retryAfterSeconds} detik`, 429);
  }

  const body = await request.json().catch(() => ({}));
  const items: BulkReviewItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return jsonError("'items' harus berupa array dan tidak kosong");
  if (items.length > 50) return jsonError("Maksimal 50 review per request");

  const hasAgentHint = Boolean(
    extractApiKey(request) || request.headers.get("x-agent-name")
  );
  let authorName = body?.author_name ? String(body.author_name).slice(0, 120) : "Anonymous Reviewer";
  let authorType = "HUMAN";

  if (hasAgentHint) {
    const identity = await resolveAgent(request);
    if (identity.error) return jsonError(identity.error, 401);
    if (identity.agent) {
      authorName = identity.agent.name;
      authorType = "AI";
      if (identity.anonymous) {
        const quota = rateLimit(
          `anon-review:${clientIp(request)}`,
          APP_CONFIG.anonReviewPerHour,
          3600_000
        );
        if (!quota.ok) {
          return jsonError(`Kuota review anonim tercapai (${APP_CONFIG.anonReviewPerHour}/jam)`, 429);
        }
      }
    }
  }

  const results: Array<Record<string, unknown>> = [];
  for (const [index, item] of items.entries()) {
    const rating = Number(item.rating);
    if (!item.media_id || !Number.isInteger(rating) || rating < 1 || rating > 10) {
      results.push({ index, ok: false, error: "media_id dan rating (1-10) wajib valid" });
      continue;
    }
    const media = await db.prisma.media.findUnique({
      where: { id: item.media_id },
      select: { id: true },
    });
    if (!media) {
      results.push({ index, ok: false, error: "Media tidak ditemukan" });
      continue;
    }
    const review = await db.prisma.review.create({
      data: {
        mediaId: item.media_id,
        authorType,
        authorName,
        rating,
        comment: item.comment ? String(item.comment).slice(0, 4000) : null,
        timestampSeconds:
          typeof item.timestamp_seconds === "number" && item.timestamp_seconds >= 0
            ? item.timestamp_seconds
            : null,
      },
    });
    publishEvent({
      type: "review.submitted",
      title: `Review ${rating}/10 oleh ${authorName}`,
      message: "bulk review",
      payload: { mediaId: item.media_id, reviewId: review.id, rating },
    });
    results.push({ index, ok: true, id: review.id });
  }

  const success = results.filter((r) => r.ok).length;
  return jsonOk({ total: items.length, success, failed: items.length - success, results }, { status: 201 });
}