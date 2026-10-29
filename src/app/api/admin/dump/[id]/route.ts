import fs from "node:fs/promises";
import { PassThrough, Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { ZipArchive } from "archiver";
import { deleteDump, dumpPath } from "@/services/dump";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/dump/:id — unduh seluruh folder dump sebagai ZIP. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/dump/[id]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  let dir: string;
  try {
    dir = dumpPath(id);
  } catch {
    return jsonError("Dump tidak ditemukan", 404);
  }
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) return jsonError("Dump tidak ditemukan", 404);

  const passthrough = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("error", (err) => passthrough.destroy(err));
  archive.pipe(passthrough);
  archive.directory(dir, false);
  archive.finalize().catch((err) => passthrough.destroy(err));

  return new Response(Readable.toWeb(passthrough) as ReadableStream, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${id}.zip"`,
    },
  });
}

/** DELETE /api/admin/dump/:id — hapus folder dump. */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/dump/[id]">
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  try {
    await deleteDump(id);
    return jsonOk({ deleted: id });
  } catch {
    return jsonError("Dump tidak ditemukan", 404);
  }
}