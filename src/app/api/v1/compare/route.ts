import type { NextRequest } from "next/server";
import { compareStats } from "@/services/votes";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/compare?a=<id>&b=<id> — statistik head-to-head. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const a = params.get("a");
  const b = params.get("b");
  if (!a || !b) return jsonError("Parameter 'a' dan 'b' wajib diisi");

  const stats = await compareStats(a, b);
  if (!stats) return jsonError("Salah satu media tidak ditemukan", 404);
  return jsonOk(stats);
}