import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (pengganti middleware di Next 16): menangani CORS untuk seluruh API
 * agar aplikasi web/AI agent dari domain lain bisa langsung terhubung.
 */

function allowedOrigin(request: NextRequest): string {
  const configured = (process.env.CORS_ORIGINS ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin") ?? "";
  if (configured.includes("*")) return "*";
  if (origin && configured.includes(origin)) return origin;
  return configured[0] ?? "*";
}

function corsHeaders(request: NextRequest): Record<string, string> {
  const allowOrigin = allowedOrigin(request);
  const headers: Record<string, string> = {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      "content-type, authorization, x-api-key, x-agent-name, mcp-session-id, last-event-id",
    "access-control-expose-headers": "mcp-session-id, content-range, accept-ranges",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (allowOrigin !== "*") headers["access-control-allow-credentials"] = "true";
  return headers;
}

export function proxy(request: NextRequest) {
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};