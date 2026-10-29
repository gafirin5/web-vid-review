import crypto from "node:crypto";
import { cookies } from "next/headers";
import { limitByIp, RATE_LIMITS } from "@/lib/rate-limit";

const COOKIE_NAME = "wvr_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 jam

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "admin123";
}

function secret(): Buffer {
  return crypto.createHash("sha256").update(`wvr:${adminPassword()}`).digest();
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const expires = Date.now() + SESSION_TTL_MS;
  return `${expires}.${sign(String(expires))}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  const expiresNum = Number(expires);
  if (!Number.isInteger(expiresNum) || expiresNum < Date.now()) return false;
  const expected = sign(expires);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Cek sesi admin dari cookie (untuk halaman & server action). */
export async function isAdminRequest(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

export async function setAdminCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Guard untuk API route admin. Mengembalikan Response error bila belum login. */
export async function requireAdminApi(request?: Request): Promise<Response | null> {
  if (!(await isAdminRequest())) {
    return Response.json({ error: "Unauthorized — login admin diperlukan" }, { status: 401 });
  }

  if (request) {
    // Rate limit per IP untuk seluruh API admin.
    const limited = limitByIp(request, "admin-api", RATE_LIMITS.adminPerMinute);
    if (!limited.ok) {
      return Response.json(
        { error: `Rate limit admin terlampaui — coba lagi dalam ${limited.retryAfterSeconds} detik` },
        { status: 429 }
      );
    }

    // Proteksi CSRF sederhana: Origin (bila ada) harus sama dengan Host.
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return Response.json({ error: "Origin tidak diizinkan" }, { status: 403 });
        }
      } catch {
        return Response.json({ error: "Origin tidak valid" }, { status: 403 });
      }
    }
  }

  return null;
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
