import type { NextRequest } from "next/server";
import { castVote } from "@/services/votes";
import { jsonError, jsonOk } from "@/lib/http";
import { limitByIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/compare/vote — vote A/B. Body: { winner_id, loser_id, voter_name?, comment? } */
export async function POST(request: NextRequest) {
  const limited = limitByIp(request, "compare-vote", 60, 60_000);
  if (!limited.ok) {
    return jsonError(`Rate limit vote — coba lagi dalam ${limited.retryAfterSeconds} detik`, 429);
  }

  const body = await request.json().catch(() => ({}));
  try {
    const vote = await castVote({
      winnerId: String(body?.winner_id ?? ""),
      loserId: String(body?.loser_id ?? ""),
      voterName: body?.voter_name,
      comment: body?.comment,
    });
    return jsonOk({ id: vote.id }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Vote gagal";
    return jsonError(message, message.includes("tidak ditemukan") ? 404 : 422);
  }
}