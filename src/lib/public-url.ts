/** Base URL publik (untuk tautan share/media). */
export function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
}