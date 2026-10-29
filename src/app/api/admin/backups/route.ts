import type { NextRequest } from "next/server";
import { createBackup, listBackups } from "@/services/backup";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/admin/backups — daftar backup. */
export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  return jsonOk(await listBackups());
}

/** POST /api/admin/backups — buat backup baru. Body: { mode: "metadata"|"full", notes? } */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "full" ? "full" : "metadata";
  const notes = typeof body?.notes === "string" ? body.notes.slice(0, 300) : undefined;

  try {
    const info = await createBackup(mode, notes);
    return jsonOk(info, { status: 201 });
  } catch (err: unknown) {
    return jsonError(`Backup gagal: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}
