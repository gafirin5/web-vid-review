"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Trash2, X } from "lucide-react";
import {
  REJECT_CATEGORIES,
  REJECT_CATEGORY_LABELS,
  type RejectCategory,
} from "@/lib/reject-categories";

interface MediaActionsProps {
  mediaId: string;
  status: string;
  /** Kode yang harus diketik untuk hapus permanen (contentId ?? id). */
  mediaKey: string;
  quarantined: boolean;
}

export default function MediaActions({
  mediaId,
  status,
  mediaKey,
  quarantined,
}: MediaActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [category, setCategory] = useState<RejectCategory>("other");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Aksi gagal");
      return false;
    }
    router.refresh();
    return true;
  }

  async function setStatus(next: "APPROVED" | "REJECTED") {
    await call(`/api/admin/media/${mediaId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  }

  async function reject() {
    const ok = await call(`/api/admin/media/${mediaId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, reason: reason || undefined }),
    });
    if (ok) {
      setShowReject(false);
      setReason("");
    }
  }

  async function restore() {
    await call(`/api/admin/media/${mediaId}/restore`, { method: "POST" });
  }

  async function remove() {
    const typed = prompt(
      `Hapus permanen media ini beserta filenya?\nKetik "${mediaKey}" untuk konfirmasi:`
    );
    if (typed === null) return;
    if (typed.trim() !== mediaKey) {
      alert("Konfirmasi tidak cocok — media tidak dihapus.");
      return;
    }
    await call(`/api/admin/media/${mediaId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: mediaKey }),
    });
  }

  return (
    <div className="relative flex items-center justify-end gap-1">
      {status === "REJECTED" ? (
        <button
          title="Pulihkan dari karantina"
          disabled={busy}
          onClick={restore}
          className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-sky-500/10 hover:text-sky-400 disabled:opacity-40"
        >
          <RotateCcw className="size-4" />
        </button>
      ) : (
        <>
          <button
            title="Setujui (tampilkan di galeri)"
            disabled={busy}
            onClick={() => setStatus("APPROVED")}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-40"
          >
            <Check className="size-4" />
          </button>
          <button
            title="Tolak & karantina"
            disabled={busy}
            onClick={() => setShowReject((v) => !v)}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </>
      )}
      <button
        title={quarantined ? "Hapus permanen dari karantina" : "Hapus permanen + file"}
        disabled={busy}
        onClick={remove}
        className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
      >
        <Trash2 className="size-4" />
      </button>

      {showReject && (
        <div className="absolute right-0 top-9 z-20 w-72 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-left shadow-xl">
          <p className="text-xs font-semibold text-zinc-200">Tolak &amp; pindahkan ke karantina</p>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as RejectCategory)}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-500 focus:outline-none"
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
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          />
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setShowReject(false)}
              className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Batal
            </button>
            <button
              onClick={reject}
              disabled={busy}
              className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              Karantina
            </button>
          </div>
        </div>
      )}

      {error && !showReject && (
        <p className="absolute right-0 top-9 z-20 w-64 rounded-lg border border-red-800 bg-red-950/90 p-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
