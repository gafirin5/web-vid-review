import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { extractApiKey, resolveAgent } from "@/lib/agent-auth";
import { APP_CONFIG } from "@/lib/app-config";
import { jsonError, jsonOk } from "@/lib/http";
import { publishEvent } from "@/lib/events";
import { clientIp, limitByIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/media/:id/reviews
 * Body: { rating: 1-10, comment?, timestamp_seconds?, author_name? }
 *
 * Aturan identitas:
 *  - Ada API key  → review AI (nama agent).
 *  - Ada header x-agent-name (tanpa key, mode open) → review AI anonim.
 *  - Tanpa keduanya → review manusia (author_name).
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/media/[id]/reviews">
) {
  const limited = limitByIp(request, "review", RATE_LIMITS.reviewPerMinute);
  if (!limited.ok) {
    return jsonError(
      `Rate limit review terlampaui — coba lagi dalam ${limited.retryAfterSeconds} detik`,
      429
    );
  }

  const { id } = await ctx.params;

  const media = await db.prisma.media.findUnique({ where: { id }, select: { id: true } });
  if (!media) return jsonError("Media not found", 404);

  let body: {
    rating?: number;
    comment?: string;
    timestamp_seconds?: number;
    author_name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return jsonError("'rating' must be an integer between 1 and 10");
  }

  // Identitas agent hanya jika ada petunjuk eksplisit (API key / x-agent-name).
  const hasAgentHint = Boolean(
    extractApiKey(request) || request.headers.get("x-agent-name")
  );

  let agentName: string | null = null;
  let anonymousAgent = false;

  if (hasAgentHint) {
    const identity = await resolveAgent(request);
    if (identity.error) return jsonError(identity.error, 401);
    agentName = identity.agent?.name ?? null;
    anonymousAgent = identity.anonymous && Boolean(identity.agent);

    if (anonymousAgent) {
      const quota = rateLimit(
        `anon-review:${clientIp(request)}`,
        APP_CONFIG.anonReviewPerHour,
        3600_000
      );
      if (!quota.ok) {
        return jsonError(
          `Kuota review anonim tercapai (${APP_CONFIG.anonReviewPerHour}/jam). ` +
            `Daftarkan agent di /api/v1/agents/register.`,
          429
        );
      }
    }
  }

  const authorType = agentName ? "AI" : "HUMAN";
  const authorName = (agentName ?? body.author_name ?? "Anonymous Reviewer").slice(0, 120);

  const review = await db.prisma.review.create({
    data: {
      mediaId: id,
      authorType,
      authorName,
      rating,
      comment: body.comment?.slice(0, 4000) ?? null,
      timestampSeconds:
        typeof body.timestamp_seconds === "number" && body.timestamp_seconds >= 0
          ? body.timestamp_seconds
          : null,
    },
  });

  publishEvent({
    type: "review.submitted",
    title: `Review ${review.rating}/10 oleh ${authorName}`,
    message: `untuk media`,
    payload: { mediaId: id, reviewId: review.id, rating: review.rating, authorType },
  });

  return jsonOk(review, { status: 201 });
}