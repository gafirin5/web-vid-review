import type { NextRequest } from "next/server";
import { searchMedia } from "@/services/search";
import { jsonOk } from "@/lib/http";
import { limitByIp, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/search?q=...&limit=20&all=true
 * Pencarian relevansi (judul, deskripsi, prompt, tag, transkrip) dengan sinonim ID/EN.
 */
export async function GET(request: NextRequest) {
  const limited = limitByIp(request, "search", RATE_LIMITS.searchPerMinute);
  if (!limited.ok) {
    return jsonOk(
      { error: `Rate limit pencarian — coba lagi dalam ${limited.retryAfterSeconds} detik` },
      { status: 429 }
    );
  }

  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const limit = Math.min(50, Math.max(1, parseInt(params.get("limit") ?? "20", 10) || 20));
  const all = params.get("all") === "true";

  if (!q) return jsonOk({ query: "", results: [], count: 0 });

  const hits = await searchMedia(q, { limit, includeAllStatuses: all });

  return jsonOk({
    query: q,
    count: hits.length,
    results: hits.map((h) => ({
      score: Number(h.score.toFixed(2)),
      media: h.media,
    })),
  });
}