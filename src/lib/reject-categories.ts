/** Kategori penolakan/karantina — dipakai server & client (tanpa dependensi Node). */
export const REJECT_CATEGORIES = ["dirty_video", "lowres", "skit", "other"] as const;

export type RejectCategory = (typeof REJECT_CATEGORIES)[number];

export const REJECT_CATEGORY_LABELS: Record<RejectCategory, string> = {
  dirty_video: "Dirty video",
  lowres: "Lowres",
  skit: "Skit",
  other: "Lainnya",
};

export function isRejectCategory(value: unknown): value is RejectCategory {
  return typeof value === "string" && (REJECT_CATEGORIES as readonly string[]).includes(value);
}
