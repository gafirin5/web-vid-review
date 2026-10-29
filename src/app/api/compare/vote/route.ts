import type { NextRequest } from "next/server";
import { castVote } from "@/services/votes";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/compare/vote (legacy) — dipertahankan untuk kompatibilitas. */
export async function POST(request: NextRequest) {
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