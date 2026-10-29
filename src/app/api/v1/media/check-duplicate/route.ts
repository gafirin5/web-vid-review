import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/http";
import { limitByIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * POST /api/v1/media/check-duplicate
 * Body salah satu dari:
 *  - { hash: "<sha256>" }
 *  - { base64: "...", file_name? }
 *  - { source_path: "C:/..." }
 * Memeriksa apakah media yang sama sudah ada, tanpa mengunggahnya.
 */
export async function POST(request: NextRequest) {
  const limited = limitByIp(request, "check-duplicate", 120, 60_000);
  if (!limited.ok) {
    return jsonError(`Rate limit tercapai — coba lagi dalam ${limited.retryAfterSeconds} detik`, 429);
  }

  const body = await request.json().catch(() => ({}));

  let hash: string | null = null;
  if (typeof body?.hash === "string" && /^[a-f0-9]{64}$/i.test(body.hash)) {
    hash = body.hash.toLowerCase();
  } else if (typeof body?.base64 === "string") {
    hash = sha256(Buffer.from(body.base64, "base64"));
  } else if (typeof body?.source_path === "string") {
    try {
      const abs = path.resolve(body.source_path);
      const stat = await fs.stat(abs);
      if (!stat.isFile()) return jsonError("source_path bukan file");
      if (stat.size > 500 * 1024 * 1024) return jsonError("File terlalu besar");
      hash = sha256(await fs.readFile(abs));
    } catch {
      return jsonError("File tidak dapat dibaca");
    }
  }

  if (!hash) {
    return jsonError("Kirim salah satu: 'hash' (sha256), 'base64', atau 'source_path'");
  }

  const existing = await db.prisma.media.findFirst({
    where: { fileHash: hash },
    select: {
      id: true,
      title: true,
      mediaType: true,
      status: true,
      createdAt: true,
      storagePath: true,
    },
  });

  return jsonOk({
    hash,
    exists: Boolean(existing),
    media: existing,
  });
}