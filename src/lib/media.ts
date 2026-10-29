import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg",
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4", "webm", "mov", "mkv", "avi", "m4v", "ogv",
]);

export type MediaType = "IMAGE" | "VIDEO";

export function extensionOf(fileName: string): string {
  return path.extname(fileName).replace(".", "").toLowerCase();
}

export function detectMediaType(
  fileName: string,
  mimeType?: string | null
): MediaType | null {
  const ext = extensionOf(fileName);
  if (IMAGE_EXTENSIONS.has(ext)) return "IMAGE";
  if (VIDEO_EXTENSIONS.has(ext)) return "VIDEO";
  if (mimeType?.startsWith("image/")) return "IMAGE";
  if (mimeType?.startsWith("video/")) return "VIDEO";
  return null;
}

export function lookupMime(fileName: string): string {
  const ext = extensionOf(fileName);
  const table: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    m4v: "video/x-m4v",
    ogv: "video/ogg",
  };
  return table[ext] ?? "application/octet-stream";
}

export interface VideoInfo {
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

/** Extract duration & resolution by parsing ffmpeg's stderr output. */
export async function probeVideo(filePath: string): Promise<VideoInfo> {
  if (!ffmpegPath) throw new Error("ffmpeg binary unavailable");
  try {
    await execFileAsync(ffmpegPath, ["-i", filePath], { timeout: 30_000 });
    return {};
  } catch (err: unknown) {
    const e = err as { stderr?: string };
    const stderr = e.stderr ?? "";
    const info: VideoInfo = {};
    const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (dur) {
      info.durationSeconds =
        parseInt(dur[1], 10) * 3600 + parseInt(dur[2], 10) * 60 + parseFloat(dur[3]);
    }
    const dim = stderr.match(/,\s(\d{2,5})x(\d{2,5})[,\s]/);
    if (dim) {
      info.width = parseInt(dim[1], 10);
      info.height = parseInt(dim[2], 10);
    }
    info.hasAudio = /Stream #\d+:\d+.*Audio:/.test(stderr);
    return info;
  }
}

export interface ProcessedImage {
  width: number;
  height: number;
  thumbnailPath: string | null;
}

export async function processImage(
  filePath: string,
  thumbnailPath: string
): Promise<ProcessedImage> {
  const meta = await sharp(filePath).metadata();
  await sharp(filePath)
    .resize(640, 640, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbnailPath);
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    thumbnailPath,
  };
}

export interface ProcessedVideo extends VideoInfo {
  thumbnailPath: string | null;
}

export async function processVideo(
  filePath: string,
  thumbnailPath: string
): Promise<ProcessedVideo> {
  if (!ffmpegPath) throw new Error("ffmpeg binary unavailable");
  const info = await probeVideo(filePath);

  // Grab a cover frame at 1s (or at 25% of duration for very short clips).
  const seek = Math.min(info.durationSeconds ? info.durationSeconds * 0.25 : 1, 1);
  try {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-ss", seek.toFixed(2),
        "-i", filePath,
        "-frames:v", "1",
        "-vf", "scale=640:-2",
        "-q:v", "4",
        thumbnailPath.replace(/\.webp$/, ".jpg"),
      ],
      { timeout: 60_000 }
    );
    // Convert the JPG frame to an optimized WebP thumbnail via sharp.
    const jpg = thumbnailPath.replace(/\.webp$/, ".jpg");
    try {
      await sharp(jpg).webp({ quality: 80 }).toFile(thumbnailPath);
      await fs.unlink(jpg);
    } catch {
      // If webp conversion fails, keep the jpg as the thumbnail.
      return { ...info, thumbnailPath: jpg };
    }
  } catch {
    return { ...info, thumbnailPath: null };
  }
  return { ...info, thumbnailPath };
}

export type ProcessedVideoInfo = {
  width?: number;
  height?: number;
  durationSeconds?: number;
  hasAudio?: boolean;
  thumbnailPath: string | null;
};

export async function processMedia(
  mediaType: MediaType,
  filePath: string,
  thumbnailPath: string
): Promise<ProcessedVideoInfo> {
  if (mediaType === "IMAGE") {
    const r = await processImage(filePath, thumbnailPath);
    return r;
  }
  return processVideo(filePath, thumbnailPath);
}
