/**
 * Konfigurasi runtime terpusat (dibaca dari environment).
 * Semua opsi dapat diubah tanpa mengubah kode.
 */

export type AuthMode = "open" | "optional" | "required";

/** Demo anonim harus opt-in eksplisit — default produksi = keyed. */
export function anonymousDemoEnabled(): boolean {
  return process.env.ALLOW_ANONYMOUS_DEMO === "true";
}

function authMode(): AuthMode {
  const v = (process.env.AUTH_MODE ?? "").trim().toLowerCase();
  if (v === "required" || v === "optional" || v === "open") return v;
  // Tanpa AUTH_MODE eksplisit: keyed secara default. Mode terbuka hanya
  // untuk demo lokal dengan ALLOW_ANONYMOUS_DEMO=true.
  return anonymousDemoEnabled() ? "open" : "required";
}

export const APP_CONFIG = {
  /** open: tanpa key tetap diterima (identitas dari x-agent-name)
   *  optional: tanpa key = anonim tanpa atribusi agent
   *  required: wajib API key (default) */
  get authMode(): AuthMode {
    return authMode();
  },
  /** true bila akses anonim sengaja diaktifkan untuk demo. */
  get anonymousDemo(): boolean {
    return anonymousDemoEnabled();
  },
  /** Status media untuk upload anonim (open mode). */
  get anonStatus(): "APPROVED" | "PENDING_REVIEW" {
    return process.env.ANON_STATUS === "PENDING_REVIEW" ? "PENDING_REVIEW" : "APPROVED";
  },
  /** Nama agent default bila header x-agent-name tidak dikirim. */
  get defaultAgentName(): string {
    return process.env.DEFAULT_AGENT_NAME ?? "Anonymous Agent";
  },
  /** Kuota upload anonim per IP per jam. */
  get anonUploadPerHour(): number {
    return Number(process.env.ANON_UPLOAD_PER_HOUR ?? 20);
  },
  /** Kuota review anonim per IP per jam. */
  get anonReviewPerHour(): number {
    return Number(process.env.ANON_REVIEW_PER_HOUR ?? 120);
  },
  /** Origin yang diizinkan untuk CORS ("*" = semua). */
  get corsOrigins(): string[] {
    return (process.env.CORS_ORIGINS ?? "*")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  /** Izinkan pendaftaran agent mandiri tanpa admin. */
  get allowSelfRegistration(): boolean {
    return process.env.ALLOW_AGENT_SELF_REGISTER !== "false";
  },
};