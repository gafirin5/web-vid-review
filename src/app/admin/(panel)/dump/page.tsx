"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Download, FileJson, Plus, Trash2 } from "lucide-react";

interface DumpRow {
  id: string;
  createdAt: string;
  count: number;
  fileCount: number;
  sizeBytes: number;
  notes?: string;
  includeFiles: boolean;
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

export default function AdminDumpPage() {
  const [dumps, setDumps] = useState<DumpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/dump");
    if (res.ok) setDumps(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/dump")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          setDumps(data);
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

  async function createDump(includeFiles: boolean) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/dump", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includeFiles, notes: notes || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage({
        ok: true,
        text: `Dump "${data.id}" dibuat — ${data.count} media APPROVED${includeFiles ? ` + ${data.fileCount} file` : ""}.`,
      });
      setNotes("");
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? "Dump gagal dibuat" });
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm(`Hapus folder dump "${id}"?`)) return;
    setBusy(true);
    await fetch(`/api/admin/dump/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
    setBusy(false);
  }

  return (
    <div>
      <h1 className="text-xl font-bold">Dump Handoff</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Snapshot seluruh media <span className="text-emerald-400">APPROVED</span> sebagai artefak untuk
        nextgen_cosplay_pipeline — tanpa menyentuh file asli.
      </p>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Archive className="size-4 text-violet-400" /> Buat Dump Baru
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Menghasilkan <code className="text-zinc-300">nextgen_cosplay.sql</code>,{" "}
          <code className="text-zinc-300">arch_all.json</code>, dan{" "}
          <code className="text-zinc-300">cid_overrides.json</code> (hasil review karakter).{" "}
          <code className="text-zinc-400">dtk_full.dump</code> berasal dari sumber DTK, bukan dari sini.
        </p>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Catatan (opsional)"
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => createDump(false)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Plus className="size-4" /> Metadata (SQL + JSON)
          </button>
          <button
            onClick={() => createDump(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
          >
            <FileJson className="size-4" /> Metadata + Salinan File
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Dump</th>
              <th className="px-4 py-3">Media</th>
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
            {!loading && dumps.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Belum ada dump. Buat dump handoff pertama Anda!
                </td>
              </tr>
            )}
            {dumps.map((d) => (
              <tr key={d.id} className="hover:bg-zinc-900/50">
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{d.id}</td>
                <td className="px-4 py-2.5 text-zinc-400">
                  {d.count} media
                  {d.includeFiles && d.fileCount > 0 && (
                    <span className="text-zinc-500"> · {d.fileCount} file</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-zinc-400">{formatBytes(d.sizeBytes)}</td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {new Date(d.createdAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <a
                      href={`/api/admin/dump/${encodeURIComponent(d.id)}`}
                      title="Unduh semua artefak (ZIP)"
                      className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-white"
                    >
                      <Download className="size-4" />
                    </a>
                    <button
                      title="Hapus dump"
                      disabled={busy}
                      onClick={() => remove(d.id)}
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