import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { generateApiKey, hashApiKey } from "@/lib/agent-auth";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/agents/:id/regenerate — buat API key baru (key lama hangus). */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/agents/[id]/regenerate">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const apiKey = generateApiKey();
  try {
    await db.prisma.agent.update({
      where: { id },
      data: { apiKeyHash: hashApiKey(apiKey) },
    });
  } catch {
    return jsonError("Agent tidak ditemukan", 404);
  }
  return jsonOk({ apiKey });
}
