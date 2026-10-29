import path from "node:path";
import fs from "node:fs/promises";

export const PROJECT_ROOT = process.cwd();

export const UPLOADS_ROOT = path.join(PROJECT_ROOT, "uploads");
export const VIDEOS_DIR = path.join(UPLOADS_ROOT, "videos");
export const IMAGES_DIR = path.join(UPLOADS_ROOT, "images");
export const THUMBNAILS_DIR = path.join(UPLOADS_ROOT, "thumbnails");

export async function ensureUploadDirs(): Promise<void> {
  await Promise.all(
    [UPLOADS_ROOT, VIDEOS_DIR, IMAGES_DIR, THUMBNAILS_DIR].map((dir) =>
      fs.mkdir(dir, { recursive: true })
    )
  );
}

/** Month-bucketed directory, e.g. uploads/videos/2026-10 */
export async function monthBucketDir(baseDir: string): Promise<string> {
  const now = new Date();
  const bucket = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(baseDir, bucket);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Resolve a stored relative path (e.g. "videos/2026-10/abc.mp4") to an absolute
 * path inside UPLOADS_ROOT. Rejects anything that escapes the uploads root.
 */
export function resolveStoredPath(relative: string): string {
  const abs = path.resolve(UPLOADS_ROOT, relative);
  if (!abs.startsWith(UPLOADS_ROOT + path.sep) && abs !== UPLOADS_ROOT) {
    throw new Error("Path traversal detected");
  }
  return abs;
}
