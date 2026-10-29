"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DatabaseBackup,
  Download,
  HardDriveDownload,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

interface BackupRow {
  fileName: string;
  mode: "metadata" | "full";
  sizeBytes: number;
  createdAt: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function AdminBackupsPage() {
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/backups");
    if (res.ok) setBackups(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/backups")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          setBackups(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createBackup(mode: "metadata" | "full") {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/backups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, notes: notes || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage({ ok: true, text: `Backup "${data.fileName}" (${formatBytes(data.sizeBytes)}) berhasil dibuat.` });
      setNotes("");
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? "Backup gagal dibuat" });
    }
    setBusy(false);
  }

  async function restore(fileName: string) {
    if (
      !confirm(
        `Pulihkan data dari "${fileName}"?\n\nDatabase saat ini akan ditimpa (rollback otomatis disimpan sebagai dev.db.rollback.bak). File media akan ditimpa/digabungkan.`
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(fileName)}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage({
        ok: true,
        text: `Restore selesai — database & ${data.restoredMediaFiles} file media dipulihkan. Refresh halaman untuk melihat data terbaru.`,
      });
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? "Restore gagal" });
    }
    setBusy(false);
  }

  async function remove(fileName: string) {
    if (!confirm(`Hapus arsip backup "${fileName}"?`)) return;
    setBusy(true);
    await fetch(`/api/admin/backups/${encodeURIComponent(fileName)}`, { method: "DELETE" });
    await load();
    setBusy(false);
  }

  return (
    <div>
      <h1 className="text-xl font-bold">Backup & Restore</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Metadata = database saja (cepat & kecil) · Full = database + seluruh file media
      </p>

      {/* Create */}
      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <DatabaseBackup className="size-4 text-violet-400" /> Buat Backup Baru
        </h2>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Catatan (opsional), mis.: sebelum batch upload besar"
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => createBackup("metadata")}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Plus className="size-4" /> Metadata Snapshot
          </button>
          <button
            onClick={() => createBackup("full")}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
          >
            <HardDriveDownload className="size-4" /> Full Archive (DB + Media)
          </button>
        </div>
      </div>

      {message && (
        <p
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            message.ok
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : "border-red-800 bg-red-950/40 text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* List */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Arsip</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Ukuran</th>
              <th className="px-4 py-3">Dibuat</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Memuat…
                </td>
              </tr>
            )}
            {!loading && backups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Belum ada backup. Buat backup pertama Anda!
                </td>
              </tr>
            )}
            {backups.map((b) => (
              <tr key={b.fileName} className="hover:bg-zinc-900/50">
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{b.fileName}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      b.mode === "full"
                        ? "bg-violet-600/15 text-violet-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {b.mode}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-400">{formatBytes(b.sizeBytes)}</td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {new Date(b.createdAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <a
                      href={`/api/admin/backups/${encodeURIComponent(b.fileName)}`}
                      title="Download arsip"
                      className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-white"
                    >
                      <Download className="size-4" />
                    </a>
                    <button
                      title="Restore dari arsip ini"
                      disabled={busy}
                      onClick={() => restore(b.fileName)}
                      className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-40"
                    >
                      <RotateCcw className="size-4" />
                    </button>
                    <button
                      title="Hapus arsip"
                      disabled={busy}
                      onClick={() => remove(b.fileName)}
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
    </div>
  );
}
