import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/events/history?limit=50&type=media.uploaded */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, parseInt(params.get("limit") ?? "50", 10) || 50));
  const type = params.get("type");

  const events = await db.prisma.eventLog.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return jsonOk(
    events.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      message: e.message,
      payload: e.payload ? JSON.parse(e.payload) : null,
      createdAt: e.createdAt,
    }))
  );
}