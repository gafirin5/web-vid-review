import { jsonOk } from "@/lib/http";
import { APP_CONFIG } from "@/lib/app-config";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { SERVER_VERSION } from "@/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_TOOLS = [
  "upload_media",
  "list_media",
  "search_media",
  "get_media_detail",
  "submit_review",
  "update_media",
  "delete_media",
  "bulk_upload",
  "check_duplicate",
  "create_collection",
  "list_collections",
  "add_to_collection",
  "remove_from_collection",
  "create_share_link",
  "compare_media",
  "get_agent_stats",
  "get_leaderboard",
  "list_tags",
  "list_agents",
  "bulk_review",
  "get_recent_activity",
  "get_system_metrics",
  "create_system_backup",
  "get_backup_status",
];

/**
 * GET /api/v1/capabilities — fitur & batas yang tersedia (tanpa auth).
 * Berguna agar AI agent/aplikasi bisa menemukan kemampuan server sendiri.
 */
export async function GET() {
  return jsonOk({
    service: "web-vid-review",
    version: SERVER_VERSION,
    auth: {
      mode: APP_CONFIG.authMode,
      apiKeyHeader: "Authorization: Bearer avr_...",
      anonymousHeader: "x-agent-name: <nama agent>",
      selfRegistration: APP_CONFIG.allowSelfRegistration
        ? "POST /api/v1/agents/register"
        : "disabled",
      note:
        APP_CONFIG.authMode === "open"
          ? "Tanpa API key tetap bisa; agent otomatis dibuat dari header x-agent-name."
          : APP_CONFIG.authMode === "optional"
            ? "Tanpa API key = anonim tanpa atribusi agent."
            : "API key wajib untuk endpoint agent.",
    },
    limits: {
      uploadPerMinute: RATE_LIMITS.uploadPerMinute,
      reviewPerMinute: RATE_LIMITS.reviewPerMinute,
      searchPerMinute: RATE_LIMITS.searchPerMinute,
      anonymousUploadsPerHour: APP_CONFIG.anonUploadPerHour,
      anonymousReviewsPerHour: APP_CONFIG.anonReviewPerHour,
      maxUploadBytes: 500 * 1024 * 1024,
    },
    media: {
      images: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"],
      videos: ["mp4", "webm", "mov", "mkv", "avi", "m4v", "ogv"],
      features: [
        "thumbnail otomatis",
        "deteksi durasi/resolusi/audio",
        "auto-tagging heuristik",
        "deduplikasi SHA-256",
        "transkrip teks",
        "pencarian relevansi",
      ],
    },
    mcp: { endpoint: "/api/mcp", transport: "streamable-http", tools: MCP_TOOLS },
    realtime: { sse: "/api/events", webhooks: "WEBHOOK_URLS" },
    cors: APP_CONFIG.corsOrigins,
  });
}