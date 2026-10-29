import type { NextRequest } from "next/server";
import { createDump, listDumps } from "@/services/dump";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/admin/dump — daftar dump handoff. */
export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  return jsonOk(await listDumps());
}

/** POST /api/admin/dump — buat dump baru. Body: { includeFiles?: boolean, notes? } */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const includeFiles = body?.includeFiles === true;
  const notes = typeof body?.notes === "string" ? body.notes.slice(0, 300) : undefined;

  try {
    const info = await createDump({ includeFiles, notes });
    return jsonOk(info, { status: 201 });
  } catch (err: unknown) {
    return jsonError(`Dump gagal: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}