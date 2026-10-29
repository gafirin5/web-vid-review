"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Sparkles } from "lucide-react";

/**
 * Menyambung ke /api/events: saat ada media/review baru,
 * galeri di-refresh otomatis + toast notifikasi.
 */
export default function RealtimeGallery() {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/events");

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type: string; title: string };
        if (data.type === "connected") {
          setConnected(true);
          return;
        }
        if (data.type === "media.uploaded" || data.type === "review.submitted") {
          setToast(data.title);
          router.refresh();
          setTimeout(() => setToast(null), 5000);
        }
      } catch {
        // abaikan
      }
    };

    return () => source.close();
  }, [router]);

  return (
    <>
      <span
        title={connected ? "Live — galeri diperbarui otomatis" : "Offline"}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
          connected ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
        }`}
      >
        <span
          className={`size-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-zinc-500"}`}
        />
        {connected ? "Live" : "Offline"}
      </span>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-violet-700/60 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-600/20">
            {toast.startsWith("Review") ? (
              <Sparkles className="size-4 text-violet-300" />
            ) : (
              <Clapperboard className="size-4 text-violet-300" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100">{toast}</p>
            <p className="text-xs text-zinc-500">Galeri diperbarui otomatis</p>
          </div>
        </div>
      )}
    </>
  );
}
