import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { APP_CONFIG } from "@/lib/app-config";

export function generateApiKey(): string {
  return `avr_${crypto.randomBytes(24).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function extractApiKey(request: NextRequest | Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  const direct = request.headers.get("x-api-key");
  if (direct) return direct.trim();
  return null;
}

export interface AgentIdentity {
  id: string;
  name: string;
  modelProvider: string;
  active: boolean;
}

export interface ResolvedIdentity {
  /** Agent teridentifikasi (null jika manusia/anonim tanpa atribusi). */
  agent: AgentIdentity | null;
  /** True bila tidak memakai API key. */
  anonymous: boolean;
  /** Pesan error bila API key ada tapi tidak valid. */
  error?: string;
}

function sanitizeAgentName(name: string): string {
  return name.replace(/[<>\"'`\\]/g, "").trim().slice(0, 80) || APP_CONFIG.defaultAgentName;
}

/** Cari atau buat agent berdasarkan nama (mode open, tanpa API key). */
export async function findOrCreateAgentByName(name: string): Promise<AgentIdentity> {
  const cleanName = sanitizeAgentName(name);
  const existing = await db.prisma.agent.findUnique({ where: { name: cleanName } });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      modelProvider: existing.modelProvider,
      active: existing.active,
    };
  }
  // Key acak internal — tidak pernah ditampilkan; hanya agar kolom hash unik.
  const internalKey = hashApiKey(generateApiKey());
  const created = await db.prisma.agent.create({
    data: {
      name: cleanName,
      apiKeyHash: internalKey,
      modelProvider: "anonymous",
    },
  });
  return {
    id: created.id,
    name: created.name,
    modelProvider: created.modelProvider,
    active: created.active,
  };
}

/**
 * Resolusi identitas pemanggil API:
 * - API key valid → agent terautentikasi
 * - Tanpa key + AUTH_MODE=open → agent otomatis dari header x-agent-name
 * - Tanpa key + AUTH_MODE=optional → anonim tanpa atribusi
 * - Tanpa key + AUTH_MODE=required → error
 */
export async function resolveAgent(request: NextRequest | Request): Promise<ResolvedIdentity> {
  const key = extractApiKey(request);

  if (key) {
    const agent = await db.prisma.agent.findUnique({ where: { apiKeyHash: hashApiKey(key) } });
    if (!agent) return { agent: null, anonymous: false, error: "API key tidak valid" };
    if (!agent.active) return { agent: null, anonymous: false, error: "Agent dinonaktifkan" };
    return {
      agent: {
        id: agent.id,
        name: agent.name,
        modelProvider: agent.modelProvider,
        active: agent.active,
      },
      anonymous: false,
    };
  }

  const mode = APP_CONFIG.authMode;
  if (mode === "required") {
    return {
      agent: null,
      anonymous: true,
      error: "API key wajib (AUTH_MODE=required). Kirim header Authorization: Bearer <key>.",
    };
  }

  if (mode === "open") {
    const name = request.headers.get("x-agent-name") ?? APP_CONFIG.defaultAgentName;
    const agent = await findOrCreateAgentByName(name);
    if (!agent.active) {
      return { agent: null, anonymous: true, error: "Agent dinonaktifkan" };
    }
    return { agent, anonymous: true };
  }

  // optional: tanpa key = manusia/anonim tanpa atribusi
  return { agent: null, anonymous: true };
}

/** Kompatibilitas: dipakai route lama. */
export async function authenticateAgent(
  request: NextRequest | Request
): Promise<{ agent: AgentIdentity } | { error: string }> {
  const resolved = await resolveAgent(request);
  if (resolved.error) return { error: resolved.error };
  if (!resolved.agent) return { error: "API key tidak valid" };
  return { agent: resolved.agent };
}