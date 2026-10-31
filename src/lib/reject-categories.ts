/** Kategori penolakan/karantina — paritas dengan pipeline (tanpa dependensi Node). */
export const REJECT_CATEGORIES = [
  "DIRTY_TEXT",
  "SKIT",
  "SPONSOR",
  "NON_COSPLAY",
  "LOWRES",
  "DUPLICATE",
] as const;

export type RejectCategory = (typeof REJECT_CATEGORIES)[number];

export const REJECT_CATEGORY_LABELS: Record<RejectCategory, string> = {
  DIRTY_TEXT: "Teks kotor / subtitle",
  SKIT: "Skit / bercerita",
  SPONSOR: "Sponsor / iklan",
  NON_COSPLAY: "Bukan cosplay",
  LOWRES: "Resolusi rendah",
  DUPLICATE: "Duplikat",
};

/** Subfolder karantina per kategori (lowercase, aman filesystem). */
export const REJECT_CATEGORY_DIRS: Record<RejectCategory, string> = {
  DIRTY_TEXT: "dirty_text",
  SKIT: "skit",
  SPONSOR: "sponsor",
  NON_COSPLAY: "non_cosplay",
  LOWRES: "lowres",
  DUPLICATE: "duplicate",
};

export function isRejectCategory(value: unknown): value is RejectCategory {
  return typeof value === "string" && (REJECT_CATEGORIES as readonly string[]).includes(value);
}
