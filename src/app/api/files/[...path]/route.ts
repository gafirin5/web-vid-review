import fs from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { lookupMime } from "@/lib/media";
import { resolveStoredPath } from "@/lib/paths";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THUMBNAIL_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
};

/**
 * GET /api/files/<stored-path>
 * Serves original media & thumbnails from the uploads directory.
 * Supports HTTP Range requests so videos can be seeked without full download.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/files/[...path]">
) {
  const { path: segments } = await ctx.params;
  const relative = (Array.isArray(segments) ? segments.join("/") : segments) ?? "";

  let abs: string;
  try {
    abs = resolveStoredPath(relative);
  } catch {
    return jsonError("Invalid path", 400);
  }

  let size: number;
  try {
    const s = await stat(abs);
    if (!s.isFile()) return jsonError("Not found", 404);
    size = s.size;
  } catch {
    return jsonError("Not found", 404);
  }

  const ext = relative.split(".").pop()?.toLowerCase() ?? "";
  const contentType =
    THUMBNAIL_TYPES[ext] ?? lookupMime(relative) ?? "application/octet-stream";

  const range = request.headers.get("range");
  const baseHeaders: Record<string, string> = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
  };

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${size}` },
        });
      }
      const stream = fs.createReadStream(abs, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": String(end - start + 1),
        },
      });
    }
  }

  const stream = fs.createReadStream(abs);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "content-length": String(size) },
  });
}
