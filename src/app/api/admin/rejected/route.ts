import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import {
  isRejectCategory,
  listQuarantined,
  quarantineMedia,
  type RejectCategory,
} from "@/services/quarantine";
import { REJECT_CATEGORIES } from "@/lib/reject-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/rejected — daftar media terkarantina + statistik. */
export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  return jsonOk(await listQuarantined());
}

/**
 * POST /api/admin/rejected — tolak banyak media sekaligus (bulk).
 * Body: { ids: string[], category, reason? }
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((v: unknown): v is string => typeof v === "string").slice(0, 100)
    : [];
  if (ids.length === 0) return jsonError("'ids' wajib berisi minimal 1 media id", 422);
  if (!isRejectCategory(body?.category)) {
    return jsonError(`'category' wajib salah satu: ${REJECT_CATEGORIES.join(", ")}`, 422);
  }
  const category = body.category as RejectCategory;
  const reason = typeof body?.reason === "string" ? body.reason : null;

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      await quarantineMedia(id, { category, reason });
      results.push({ id, ok: true });
    } catch (err: unknown) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : "Gagal" });
    }
  }

  return jsonOk(
    {
      total: ids.length,
      rejected: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    },
    { status: 201 }
  );
}
