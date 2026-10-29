/**
 * Rate limiter in-memory (sliding window sederhana).
 * Cocok untuk deployment single-instance (SQLite + lokal).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __wvrRate?: Map<string, Bucket> };

function store(): Map<string, Bucket> {
  if (!g.__wvrRate) g.__wvrRate = new Map();
  return g.__wvrRate;
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Hitung request untuk key tertentu dalam window waktu. */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const map = store();
  const bucket = map.get(key);

  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count++;
  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Ambil IP klien dari header proxy standar. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

/** Helper: terapkan limit per IP untuk route tertentu. */
export function limitByIp(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000
): RateResult {
  return rateLimit(`${scope}:${clientIp(request)}`, limit, windowMs);
}

/** Bersihkan bucket kedaluwarsa (dipanggil berkala oleh route). */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, bucket] of store()) {
    if (bucket.resetAt <= now) store().delete(key);
  }
}

export const RATE_LIMITS = {
  uploadPerMinute: Number(process.env.RATE_LIMIT_UPLOAD ?? 30),
  reviewPerMinute: Number(process.env.RATE_LIMIT_REVIEW ?? 60),
  searchPerMinute: Number(process.env.RATE_LIMIT_SEARCH ?? 120),
  adminPerMinute: Number(process.env.RATE_LIMIT_ADMIN ?? 300),
  loginPer5Minutes: Number(process.env.RATE_LIMIT_LOGIN ?? 10),
};