/** Peran aset dalam satu bundle CID. */
export const MEDIA_ROLES = ["video", "cover", "frame", "pin", "thumb"] as const;
export type MediaRole = (typeof MEDIA_ROLES)[number];

export function isMediaRole(value: unknown): value is MediaRole {
  return typeof value === "string" && (MEDIA_ROLES as readonly string[]).includes(value);
}

/** Normalisasi input role; fallback ke "video". */
export function normalizeRole(value: unknown): MediaRole {
  return isMediaRole(value) ? value : "video";
}

/** Index aman (>= 0). */
export function normalizeIndex(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Role yang menyimpan file video utama. */
export function isPrimaryRole(role: string): boolean {
  return role === "video";
}
