import { subscribeEvents, clientConnected, clientDisconnected, type PlatformEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events — Server-Sent Events realtime.
 * Stream semua event platform (media baru, review, backup, vote) ke browser.
 * Dipakai oleh: galeri (auto-refresh) & notification center admin.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: PlatformEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream sudah ditutup client
        }
      };

      // Kirim hello agar koneksi langsung terbuka.
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "connected",
            title: "Terhubung ke stream event",
            timestamp: new Date().toISOString(),
          })}\n\n`
        )
      );

      const unsubscribe = subscribeEvents(send);
      clientConnected();

      // Keep-alive agar koneksi tidak diputus proxy idle.
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // diabaikan
        }
      }, 20_000);

      cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
        clientDisconnected();
        try {
          controller.close();
        } catch {
          // sudah tertutup
        }
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
