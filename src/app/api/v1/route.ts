import { jsonOk } from "@/lib/http";
import { APP_CONFIG } from "@/lib/app-config";
import { SERVER_VERSION } from "@/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1 — indeks API (tanpa auth).
 */
export async function GET() {
  return jsonOk({
    service: "web-vid-review",
    version: SERVER_VERSION,
    authMode: APP_CONFIG.authMode,
    docs: "/api/v1/docs",
    openapi: "/api/v1/openapi",
    capabilities: "/api/v1/capabilities",
    endpoints: {
      media: {
        list: "GET /api/v1/media",
        detail: "GET /api/v1/media/:id",
        upload: "POST /api/v1/media/upload",
        bulkUpload: "POST /api/v1/media/bulk",
        update: "PATCH /api/v1/media/:id",
        delete: "DELETE /api/v1/media/:id",
        checkDuplicate: "POST /api/v1/media/check-duplicate",
      },
      reviews: {
        create: "POST /api/v1/media/:id/reviews",
        bulk: "POST /api/v1/reviews/bulk",
      },
      collections: {
        list: "GET /api/v1/collections",
        create: "POST /api/v1/collections",
        detail: "GET /api/v1/collections/:id",
        update: "PATCH /api/v1/collections/:id",
        delete: "DELETE /api/v1/collections/:id",
        addItem: "POST /api/v1/collections/:id/items",
        removeItem: "DELETE /api/v1/collections/:id/items/:mediaId",
      },
      shares: {
        create: "POST /api/v1/shares",
        list: "GET /api/v1/shares",
        revoke: "DELETE /api/v1/shares/:id",
        public: "GET /api/v1/public/share/:token",
      },
      tags: {
        list: "GET /api/v1/tags",
        popular: "GET /api/v1/tags/popular",
      },
      search: "GET /api/v1/search?q=...",
      compare: {
        stats: "GET /api/v1/compare?a=:id&b=:id",
        vote: "POST /api/v1/compare/vote",
      },
      stats: {
        agents: "GET /api/v1/stats/agents",
        tags: "GET /api/v1/stats/tags",
        uploads: "GET /api/v1/stats/uploads",
      },
      activity: "GET /api/v1/events/history",
      agents: {
        directory: "GET /api/v1/agents",
        register: "POST /api/v1/agents/register",
      },
      metrics: {
        storage: "GET /api/v1/metrics/storage",
        overview: "GET /api/v1/metrics/overview",
      },
      mcp: "/api/mcp",
      events: "/api/events",
      health: "GET /api/v1/system/health",
    },
  });
}