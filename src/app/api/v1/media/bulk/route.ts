import type { NextRequest } from "next/server";
import { ingestMedia } from "@/lib/ingestion";
import { resolveAgent } from "@/lib/agent-auth";
import { APP_CONFIG } from "@/lib/app-config";
import { jsonError, jsonOk } from "@/lib/http";
import { clientIp, limitByIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

interface BulkItem {
  source_url?: string;
  source_path?: string;
  base64?: string;
  file_name?: string;
  title?: string;
  description?: string;
  tags?: string[];
  prompt?: string;
  negative_prompt?: string;
  transcript?: string;
}

/**
 * POST /api/v1/media/bulk
 * Body: { items: BulkItem[] } (maks 20)
 * Upload banyak media sekaligus. Hasil per-item selalu dilaporkan.
 */
export async function POST(request: NextRequest) {
  const limited = limitByIp(request, "bulk-upload", 10, 60_000);
  if (!limited.ok) {
    return jsonError(`Rate limit bulk upload — coba lagi dalam ${limited.retryAfterSeconds} detik`, 429);
  }

  const identity = await resolveAgent(request);
  if (identity.error) return jsonError(identity.error, 401);

  const isOpenAnonymous = identity.anonymous && Boolean(identity.agent);
  if (isOpenAnonymous) {
    const quota = rateLimit(
      `anon-upload:${clientIp(request)}`,
      APP_CONFIG.anonUploadPerHour,
      3600_000
    );
    if (!quota.ok) {
      return jsonError(
        `Kuota upload anonim tercapai (${APP_CONFIG.anonUploadPerHour}/jam)`,
        429
      );
    }
  }

  const body = await request.json().catch(() => ({}));
  const items: BulkItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return jsonError("'items' harus berupa array dan tidak kosong");
  if (items.length > 20) return jsonError("Maksimal 20 item per request");

  const defaultStatus = isOpenAnonymous ? APP_CONFIG.anonStatus : "APPROVED";
  const results: Array<Record<string, unknown>> = [];

  for (const [index, item] of items.entries()) {
    try {
      const result = await ingestMedia({
        sourceUrl: item.source_url,
        sourcePath: item.source_path,
        base64: item.base64,
        fileName: item.file_name,
        title: item.title ?? item.file_name ?? `Bulk upload #${index + 1}`,
        description: item.description,
        tags: item.tags,
        prompt: item.prompt,
        negativePrompt: item.negative_prompt,
        transcript: item.transcript,
        agentId: identity.agent?.id ?? null,
        defaultStatus,
      });
      results.push({
        index,
        ok: true,
        id: result.mediaId,
        duplicate: Boolean(result.duplicateOf),
      });
    } catch (err: unknown) {
      results.push({
        index,
        ok: false,
        error: err instanceof Error ? err.message : "Upload gagal",
      });
    }
  }

  const success = results.filter((r) => r.ok).length;
  return jsonOk(
    { total: items.length, success, failed: items.length - success, results },
    { status: success > 0 ? 201 : 422 }
  );
}