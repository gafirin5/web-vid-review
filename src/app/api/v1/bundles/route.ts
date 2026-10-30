import type { NextRequest } from "next/server";
import { resolveAgent } from "@/lib/agent-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { limitByIp, RATE_LIMITS } from "@/lib/rate-limit";
import { normalizeManifest, createBundle, type BundleFile } from "@/services/bundles";
import { normalizeIndex, normalizeRole } from "@/lib/media-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function asFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

/**
 * POST /api/v1/bundles — intake satu paket (video + cover + frames) dalam 1 request.
 * Idempoten per (content_id, role, index): kirim ulang → duplicate:true tanpa baris baru.
 *
 * multipart/form-data:
 *  - video: File
 *  - cover: File (opsional)
 *  - frames: File[] (opsional, index 1..N)
 *  - manifest: JSON string { content_id, character, game, creator, ... }
 */
export async function POST(request: NextRequest) {
  const limited = limitByIp(request, "bundle", RATE_LIMITS.uploadPerMinute);
  if (!limited.ok) {
    return jsonError(`Rate limit terlampaui — coba lagi dalam ${limited.retryAfterSeconds} detik`, 429);
  }

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError("Gunakan multipart/form-data dengan field video/cover/frames + manifest", 415);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Body multipart tidak valid", 400);

  let manifest;
  try {
    const raw = form.get("manifest");
    const parsed = typeof raw === "string" ? JSON.parse(raw) : { content_id: form.get("content_id") };
    manifest = normalizeManifest(parsed);
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Manifest tidak valid", 422);
  }

  const files: BundleFile[] = [];
  const video = asFile(form.get("video"));
  if (video) {
    files.push({ role: "video", index: 0, buffer: Buffer.from(await video.arrayBuffer()), fileName: video.name });
  }
  const cover = asFile(form.get("cover"));
  if (cover) {
    files.push({ role: "cover", index: 0, buffer: Buffer.from(await cover.arrayBuffer()), fileName: cover.name });
  }

  const frames = form.getAll("frames").filter((f): f is File => f instanceof File && f.size > 0);
  for (let i = 0; i < frames.length; i++) {
    files.push({
      role: "frame",
      index: i + 1,
      buffer: Buffer.from(await frames[i].arrayBuffer()),
      fileName: frames[i].name,
    });
  }

  // Dukungan opsional: file generik dengan role/index eksplisit (mis. pin).
  for (const entry of form.getAll("assets")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    files.push({
      role: normalizeRole(form.get(`role_${entry.name}`)),
      index: normalizeIndex(form.get(`index_${entry.name}`)),
      buffer: Buffer.from(await entry.arrayBuffer()),
      fileName: entry.name,
    });
  }

  if (files.length === 0) return jsonError("Tidak ada file (video/cover/frames) pada request", 422);

  try {
    const result = await createBundle(manifest, files, {
      agentId: identity.agent?.id ?? null,
      actorName: identity.agent?.name ?? null,
    });
    return jsonOk(result, { status: result.created > 0 ? 201 : 200 });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Bundle gagal dibuat", 422);
  }
}
