"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, X } from "lucide-react";

export default function MediaActions({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(status: "APPROVED" | "REJECTED") {
    setBusy(true);
    await fetch(`/api/admin/media/${mediaId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Hapus media ini beserta file fisiknya? Tidak bisa dibatalkan.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/media/${mediaId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Gagal menghapus");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        title="Setujui (tampilkan di galeri)"
        disabled={busy}
        onClick={() => setStatus("APPROVED")}
        className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-40"
      >
        <Check className="size-4" />
      </button>
      <button
        title="Tolak (sembunyikan dari galeri)"
        disabled={busy}
        onClick={() => setStatus("REJECTED")}
        className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-40"
      >
        <X className="size-4" />
      </button>
      <button
        title="Hapus permanen + file"
        disabled={busy}
        onClick={remove}
        className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
