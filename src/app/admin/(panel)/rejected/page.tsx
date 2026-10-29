"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import {
  REJECT_CATEGORIES,
  REJECT_CATEGORY_LABELS,
  type RejectCategory,
} from "@/lib/reject-categories";

interface QuarantinedRow {
  id: string;
  contentId: string | null;
  title: string;
  mediaType: string;
  sizeBytes: number;
  category: RejectCategory;
  reason: string | null;
  rejectedAt: string;
  quarantinedPath: string;
  fileExists: boolean;
}

interface Stats {
  total: { count: number; sizeBytes: number };
  byCategory: Record<RejectCategory, { count: number; sizeBytes: number }>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function AdminRejectedPage() {
  const [items, setItems] = useState<QuarantinedRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<RejectCategory | "ALL">("ALL");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/rejected");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
      setStats(data.stats ?? null);
      setError(null);
    } else {
      setError("Gagal memuat data karantina (sesi admin habis?)");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/rejected")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setItems(data.items ?? []);
          setStats(data.stats ?? null);
        } else {
          setError("Gagal memuat data karantina (sesi admin habis?)");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function restore(row: QuarantinedRow) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/media/${row.id}/restore`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Gagal memulihkan media");
      return;
    }
    await load();
  }

  async function purge(row: QuarantinedRow) {
    const key = row.contentId ?? row.id;
    const typed = prompt(
      `Hapus permanen "${row.title}" dari karantina?\nKetik "${key}" untuk konfirmasi:`
    );
    if (typed === null) return;
    if (typed.trim() !== key) {
      alert("Konfirmasi tidak cocok — media tidak dihapus.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/rejected/${row.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: key }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Gagal menghapus media");
      return;
    }
    await load();
  }

  const visible = filter === "ALL" ? items : items.filter((i) => i.category === filter);

  return (
    <div>
      <h1 className="text-xl font-bold">Karantina (Rejected)</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Media ditolak dipindahkan ke <code className="text-zinc-300">rejected/</code> — tidak
        dihapus, bisa dipulihkan. Terpisah dari fitur Dump.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <button
          onClick={() => setFilter("ALL")}
          className={`rounded-xl border p-3 text-left transition-colors ${
            filter === "ALL"
              ? "border-violet-600 bg-violet-600/10"
              : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
          }`}
        >
          <p className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Archive className="size-3.5" /> Semua
          </p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">
            {stats?.total.count ?? 0}
          </p>
          <p className="text-xs text-zinc-500">{formatBytes(stats?.total.sizeBytes ?? 0)}</p>
        </button>
        {REJECT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              filter === c
                ? "border-amber-600 bg-amber-600/10"
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
            }`}
          >
            <p className="text-xs text-zinc-400">{REJECT_CATEGORY_LABELS[c]}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">
              {stats?.byCategory[c].count ?? 0}
            </p>
            <p className="text-xs text-zinc-500">
              {formatBytes(stats?.byCategory[c].sizeBytes ?? 0)}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Media</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Alasan</th>
              <th className="px-4 py-3">Ukuran</th>
              <th className="px-4 py-3">Ditolak</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-600">
                  Memuat…
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-600">
                  Karantina kosong. Media yang ditolak akan muncul di sini.
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <tr key={row.id} className="hover:bg-zinc-900/50">
                <td className="px-4 py-2.5">
                  <p className="max-w-64 truncate font-medium text-zinc-200">{row.title}</p>
                  <p className="font-mono text-xs text-zinc-600">
                    {row.contentId ?? row.id}
                    {!row.fileExists && (
                      <span className="ml-2 rounded bg-red-500/10 px-1.5 py-0.5 text-red-400">
                        file hilang
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                    {REJECT_CATEGORY_LABELS[row.category]}
                  </span>
                </td>
                <td className="max-w-64 truncate px-4 py-2.5 text-zinc-400" title={row.reason ?? ""}>
                  {row.reason ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-zinc-400">{formatBytes(row.sizeBytes)}</td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {new Date(row.rejectedAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      title="Pulihkan ke uploads (APPROVED)"
                      disabled={busy}
                      onClick={() => restore(row)}
                      className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-sky-500/10 hover:text-sky-400 disabled:opacity-40"
                    >
                      <RotateCcw className="size-4" />
                    </button>
                    <button
                      title="Hapus permanen (wajib konfirmasi)"
                      disabled={busy}
                      onClick={() => purge(row)}
                      className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-600">
        <ShieldAlert className="size-3.5" /> Zero-delete: penghapusan permanen hanya manual dan
        wajib mengetik kode media.
      </p>
    </div>
  );
}
