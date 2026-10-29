import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { generateApiKey, hashApiKey } from "@/lib/agent-auth";
import { APP_CONFIG } from "@/lib/app-config";
import { jsonError, jsonOk } from "@/lib/http";
import { limitByIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/agents/register
 * Pendaftaran agent mandiri TANPA admin. Mengembalikan API key (sekali).
 * Body: { name, provider? }
 */
export async function POST(request: NextRequest) {
  if (!APP_CONFIG.allowSelfRegistration) {
    return jsonError("Pendaftaran agent mandiri dinonaktifkan oleh administrator", 403);
  }

  // Maks 5 pendaftaran per jam per IP.
  const limited = limitByIp(request, "agent-register", 5, 3600_000);
  if (!limited.ok) {
    return jsonError(
      `Terlalu banyak pendaftaran — coba lagi dalam ${limited.retryAfterSeconds} detik`,
      429
    );
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const provider = String(body?.provider ?? "unknown").trim().slice(0, 60);
  if (!name) return jsonError("'name' wajib diisi");

  const exists = await db.prisma.agent.findUnique({ where: { name } });
  if (exists) {
    return jsonError(
      "Nama agent sudah dipakai. Gunakan nama lain atau gunakan header x-agent-name untuk identitas otomatis.",
      409
    );
  }

  const apiKey = generateApiKey();
  const agent = await db.prisma.agent.create({
    data: { name, modelProvider: provider, apiKeyHash: hashApiKey(apiKey) },
  });

  return jsonOk(
    {
      agent: { id: agent.id, name: agent.name, modelProvider: agent.modelProvider },
      apiKey,
      note: "Simpan API key ini — hanya ditampilkan sekali. Tanpa key pun Anda tetap bisa memakai API (AUTH_MODE=open) dengan header x-agent-name.",
    },
    { status: 201 }
  );
}