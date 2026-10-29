import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { generateApiKey, hashApiKey } from "@/lib/agent-auth";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/agents — buat agent baru, API key ditampilkan sekali. */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const provider = String(body?.provider ?? "unknown").trim();
  if (!name) return jsonError("'name' is required");

  const exists = await db.prisma.agent.findUnique({ where: { name } });
  if (exists) return jsonError("Nama agent sudah dipakai", 409);

  const apiKey = generateApiKey();
  const agent = await db.prisma.agent.create({
    data: { name, modelProvider: provider, apiKeyHash: hashApiKey(apiKey) },
  });

  return jsonOk(
    { agent: { id: agent.id, name: agent.name, modelProvider: agent.modelProvider }, apiKey },
    { status: 201 }
  );
}

/** GET /api/admin/agents — daftar semua agent. */
export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const agents = await db.prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { media: true, reviews: true } } },
  });
  return jsonOk(agents);
}
