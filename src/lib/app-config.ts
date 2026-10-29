/**
 * Konfigurasi runtime terpusat (dibaca dari environment).
 * Semua opsi dapat diubah tanpa mengubah kode.
 */

export type AuthMode = "open" | "optional" | "required";

function authMode(): AuthMode {
  const v = (process.env.AUTH_MODE ?? "open").toLowerCase();
  if (v === "required" || v === "optional" || v === "open") return v;
  return "open";
}

export const APP_CONFIG = {
  /** open: tanpa key tetap diterima (identitas dari x-agent-name)
   *  optional: tanpa key = anonim tanpa atribusi agent
   *  required: wajib API key */
  get authMode(): AuthMode {
    return authMode();
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