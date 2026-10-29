"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import MediaActions from "./MediaActions";
import {
  REJECT_CATEGORIES,
  REJECT_CATEGORY_LABELS,
  type RejectCategory,
} from "@/lib/reject-categories";

export interface AdminMediaRow {
  id: string;
  title: string;
  contentId: string | null;
  mediaType: string;
  status: string;
  sizeBytes: string;
  createdAt: string;
  thumbnailPath: string | null;
  agentName: string | null;
  reviewCount: number;
  quarantined: boolean;
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

export default function MediaTable({ rows }: { rows: AdminMediaRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<RejectCategory>("other");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  async function bulkReject() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/rejected", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ids: Array.from(selected),
        category,
        reason: reason || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Gagal menolak media");
      return;
    }
    setSelected(new Set());
    setReason("");
    router.refresh();
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
            <Archive className="size-4" /> {selected.size} media dipilih
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as RejectCategory)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
          >
            {REJECT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {REJECT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan (opsional)"
            className="min-w-40 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
          />
          <button
            onClick={bulkReject}
            disabled={busy}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            Karantina terpilih
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            Batal
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Pilih semua"
                  className="size-4 rounded border-zinc-600 bg-zinc-900 accent-violet-600"
                />
              </th>
              <th className="px-4 py-3">Media</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ukuran</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-600">
                  Tidak ada media.
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-zinc-900/50">
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    aria-label={`Pilih ${m.title}`}
                    className="size-4 rounded border-zinc-600 bg-zinc-900 accent-violet-600"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    {m.thumbnailPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${m.thumbnailPath}`}
                        alt=""
                        className="h-10 w-14 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-14 items-center justify-center rounded bg-zinc-800 text-sm">
                        {m.mediaType === "VIDEO" ? "🎞️" : "🖼️"}
                      </span>
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/media/${m.id}`}
                        className="block max-w-56 truncate font-medium text-zinc-200 hover:text-violet-300"
                      >
                        {m.title}
                      </Link>
                      <p className="text-xs text-zinc-600">
                        {m.contentId ? (
                          <span className="font-mono">{m.contentId}</span>
                        ) : (
                          `${m.reviewCount} review`
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-zinc-400">
                  {m.mediaType === "VIDEO" ? "Video" : "Foto"}
                </td>
                <td className="px-4 py-2.5 text-zinc-400">
                  {m.agentName ? `🤖 ${m.agentName}` : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      m.status === "APPROVED"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : m.status === "PENDING_REVIEW"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-400">
                  {formatBytes(Number(m.sizeBytes))}
                </td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {new Date(m.createdAt).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-2.5">
                  <MediaActions
                    mediaId={m.id}
                    status={m.status}
                    mediaKey={m.contentId ?? m.id}
                    quarantined={m.quarantined}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
