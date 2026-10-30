import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { db } from "@/db/client";

/**
 * Event bus realtime global (bertahan lintas hot-reload).
 * Publisher: ingestion, review, backup, admin API.
 * Subscriber: SSE endpoint /api/events → browser (galeri & notification center).
 * Juga mendispatch event ke webhook eksternal (WEBHOOK_URLS).
 */

export interface PlatformEvent {
  type:
    | "media.uploaded"
    | "media.updated"
    | "media.deleted"
    | "media.review_resolved"
    | "media.dumped"
    | "media.rejected"
    | "media.restored"
    | "media.purged"
    | "remote.synced"
    | "review.submitted"
    | "backup.completed"
    | "compare.voted"
    | "disk.warning";
  title: string;
  message?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

const g = globalThis as unknown as { __wvrBus?: EventEmitter; __wvrClients?: number };

function bus(): EventEmitter {
  if (!g.__wvrBus) {
    g.__wvrBus = new EventEmitter();
    g.__wvrBus.setMaxListeners(100);
  }
  return g.__wvrBus;
}

export function publishEvent(event: Omit<PlatformEvent, "timestamp">): void {
  const full: PlatformEvent = { ...event, timestamp: new Date().toISOString() };
  bus().emit("event", full);
  persistEvent(full);
  dispatchWebhooks(full);
}

/** Simpan event ke database untuk riwayat (tidak memblokir pemanggil). */
function persistEvent(event: PlatformEvent): void {
  db.prisma.eventLog
    .create({
      data: {
        type: event.type,
        title: event.title.slice(0, 300),
        message: event.message?.slice(0, 1000) ?? null,
        payload: event.payload ? JSON.stringify(event.payload) : null,
        createdAt: new Date(event.timestamp),
      },
    })
    .catch((err) => {
      console.error("[events] gagal menyimpan riwayat:", err instanceof Error ? err.message : err);
    });
}

/** Kirim event ke webhook eksternal (fire-and-forget, tidak memblokir). */
function dispatchWebhooks(event: PlatformEvent): void {
  const urls = (process.env.WEBHOOK_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"));
  if (urls.length === 0) return;

  const body = JSON.stringify(event);
  const secret = process.env.WEBHOOK_SECRET;
  const signature = secret
    ? crypto.createHmac("sha256", secret).update(body).digest("hex")
    : null;

  for (const url of urls) {
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "web-vid-review-webhook/1.0",
        ...(signature ? { "x-wvr-signature": `sha256=${signature}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      console.error(`[webhook] gagal mengirim ke ${url}:`, err instanceof Error ? err.message : err);
    });
  }
}

export function subscribeEvents(listener: (event: PlatformEvent) => void): () => void {
  bus().on("event", listener);
  return () => bus().off("event", listener);
}

export function clientConnected(): void {
  g.__wvrClients = (g.__wvrClients ?? 0) + 1;
}

export function clientDisconnected(): void {
  g.__wvrClients = Math.max(0, (g.__wvrClients ?? 1) - 1);
}

export function connectedClients(): number {
  return g.__wvrClients ?? 0;
}
