import fs from "node:fs/promises";
import type { NextRequest } from "next/server";
import { backupPath, deleteBackup, restoreBackup } from "@/services/backup";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/admin/backups/:file — download arsip backup. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/backups/[file]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { file } = await ctx.params;
  try {
    const buffer = await fs.readFile(backupPath(file));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${file}"`,
      },
    });
  } catch {
    return jsonError("Backup tidak ditemukan", 404);
  }
}

/** DELETE /api/admin/backups/:file — hapus arsip backup. */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/backups/[file]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { file } = await ctx.params;
  try {
    await deleteBackup(file);
    return jsonOk({ deleted: file });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Gagal menghapus backup", 400);
  }
}

/** POST /api/admin/backups/:file — restore dari arsip backup. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/backups/[file]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { file } = await ctx.params;
  try {
    const result = await restoreBackup(file);
    return jsonOk({
      ...result,
      note: "Database & koneksi telah diperbarui. Rollback tersedia di dev.db.rollback.bak",
    });
  } catch (err: unknown) {
    return jsonError(`Restore gagal: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}
