"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Clapperboard,
  DatabaseBackup,
  GitCompareArrows,
  MessageSquare,
  Star,
  Trash2,
} from "lucide-react";

interface Notification {
  type: string;
  title: string;
  message?: string;
  timestamp: string;
}

const ICONS: Record<string, typeof Bell> = {
  "media.uploaded": Clapperboard,
  "media.updated": Clapperboard,
  "media.deleted": Trash2,
  "review.submitted": MessageSquare,
  "backup.completed": DatabaseBackup,
  "compare.voted": GitCompareArrows,
  "disk.warning": Star,
};

export default function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const source = new EventSource("/api/events");

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as Notification;
        if (data.type === "connected") {
          setConnected(true);
          return;
        }
        // Hindari duplikat (SSE bisa reconnect & mengirim ulang event tertentu)
        const key = `${data.type}:${data.timestamp}:${data.title}`;
        if (seenRef.current.has(key)) return;
        seenRef.current.add(key);
        setNotifications((prev) => [data, ...prev].slice(0, 30));

        // Refresh data halaman agar tabel/grafik selalu segar
        router.refresh();
      } catch {
        // abaikan pesan non-JSON
      }
    };

    return () => source.close();
  }, [router]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
      >
        <span className="relative">
          <Bell className="size-4" />
          {notifications.length > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-violet-500 text-[9px] font-bold text-white">
              {notifications.length > 9 ? "9+" : notifications.length}
            </span>
          )}
        </span>
        <span className="hidden lg:inline">Notifikasi</span>
        <span
          title={connected ? "Terhubung realtime" : "Terputus"}
          className={`size-2 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-600"}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <span className="text-xs font-semibold text-zinc-400">
              Notifikasi Realtime {connected ? "🟢" : "🔴"}
            </span>
            {notifications.length > 0 && (
              <button
                onClick={() => setNotifications([])}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white"
              >
                <CheckCheck className="size-3" /> Bersihkan
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-zinc-600">
                Belum ada notifikasi. Event platform (upload, review, backup, vote)
                akan muncul di sini secara realtime.
              </p>
            ) : (
              notifications.map((n, i) => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <div
                    key={`${n.timestamp}-${i}`}
                    className="flex items-start gap-3 border-b border-zinc-800 px-4 py-3 last:border-0 hover:bg-zinc-800/50"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-violet-400" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-200">{n.title}</p>
                      {n.message && (
                        <p className="truncate text-xs text-zinc-500">{n.message}</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-zinc-600">
                        {new Date(n.timestamp).toLocaleTimeString("id-ID")}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
