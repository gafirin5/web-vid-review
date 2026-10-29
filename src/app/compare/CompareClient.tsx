"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompareArrows, Pause, Play, RotateCcw, Trophy } from "lucide-react";

export interface CompareMedia {
  id: string;
  title: string;
  mediaType: string;
  storagePath: string;
  prompt: string | null;
  agentName: string | null;
}

interface CompareClientProps {
  mediaA: CompareMedia | null;
  mediaB: CompareMedia | null;
  options: Array<{ id: string; title: string; mediaType: string }>;
  headToHead: { aWins: number; bWins: number };
}

export default function CompareClient({
  mediaA,
  mediaB,
  options,
  headToHead: initialHeadToHead,
}: CompareClientProps) {
  const router = useRouter();
  const [headToHead, setHeadToHead] = useState(initialHeadToHead);
  const [voteMsg, setVoteMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Video sync state
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // Image slider state
  const [splitPos, setSplitPos] = useState(50);
  const draggingRef = useRef(false);

  const updateUrl = useCallback(
    (newA: string, newB: string) => {
      const params = new URLSearchParams();
      if (newA) params.set("a", newA);
      if (newB) params.set("b", newB);
      router.push(`/compare${params.toString() ? `?${params.toString()}` : ""}`);
    },
    [router]
  );

  const bothSelected = mediaA && mediaB;
  const bothVideos =
    bothSelected && mediaA.mediaType === "VIDEO" && mediaB.mediaType === "VIDEO";
  const bothImages =
    bothSelected && mediaA.mediaType === "IMAGE" && mediaB.mediaType === "IMAGE";

  async function vote(winner: "a" | "b") {
    if (!mediaA || !mediaB) return;
    setBusy(true);
    const winnerId = winner === "a" ? mediaA.id : mediaB.id;
    const loserId = winner === "a" ? mediaB.id : mediaA.id;
    const res = await fetch("/api/compare/vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        winner_id: winnerId,
        loser_id: loserId,
        voter_name: "Pengunjung Web",
      }),
    });
    if (res.ok) {
      setHeadToHead((h) =>
        winner === "a" ? { ...h, aWins: h.aWins + 1 } : { ...h, bWins: h.bWins + 1 }
      );
      setVoteMsg(
        winner === "a"
          ? `✅ Vote untuk "${mediaA.title.slice(0, 40)}" tercatat!`
          : `✅ Vote untuk "${mediaB.title.slice(0, 40)}" tercatat!`
      );
    } else {
      const data = await res.json().catch(() => ({}));
      setVoteMsg(`❌ ${data.error ?? "Gagal vote"}`);
    }
    setBusy(false);
  }

  function togglePlay() {
    const va = videoARef.current;
    const vb = videoBRef.current;
    if (!va || !vb) return;
    if (playing) {
      va.pause();
      vb.pause();
    } else {
      void va.play();
      void vb.play();
    }
    setPlaying(!playing);
  }

  function restart() {
    const va = videoARef.current;
    const vb = videoBRef.current;
    if (!va || !vb) return;
    va.currentTime = 0;
    vb.currentTime = 0;
    if (playing) {
      void va.play();
      void vb.play();
    }
  }

  function onVideoTimeUpdate() {
    // Jaga sinkron: bila selisih > 0.5 detik, samakan.
    const va = videoARef.current;
    const vb = videoBRef.current;
    if (!va || !vb) return;
    if (Math.abs(va.currentTime - vb.currentTime) > 0.5) {
      vb.currentTime = va.currentTime;
    }
  }

  // Image split slider
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const container = document.getElementById("split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.min(96, Math.max(4, pct)));
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const selectClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none";

  return (
    <div>
      {/* Selectors */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-sky-400">Media A</label>
          <select
            value={mediaA?.id ?? ""}
            onChange={(e) => updateUrl(e.target.value, mediaB?.id ?? "")}
            className={selectClass}
          >
            <option value="">— pilih media A —</option>
            {options
              .filter((o) => o.id !== mediaB?.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  [{o.mediaType === "VIDEO" ? "Video" : "Foto"}] {o.title}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-violet-400">Media B</label>
          <select
            value={mediaB?.id ?? ""}
            onChange={(e) => updateUrl(mediaA?.id ?? "", e.target.value)}
            className={selectClass}
          >
            <option value="">— pilih media B —</option>
            {options
              .filter((o) => o.id !== mediaA?.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  [{o.mediaType === "VIDEO" ? "Video" : "Foto"}] {o.title}
                </option>
              ))}
          </select>
        </div>
      </div>

      {!bothSelected && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20 text-center">
          <GitCompareArrows className="size-12 text-zinc-700" />
          <p className="mt-4 text-sm text-zinc-500">
            Pilih dua media untuk membandingkan hasil generate AI secara berdampingan.
          </p>
        </div>
      )}

      {/* Image split slider */}
      {bothImages && (
        <div className="mt-6">
          <div
            id="split-container"
            className="relative select-none overflow-hidden rounded-xl border border-zinc-800"
            onMouseDown={(e) => {
              draggingRef.current = true;
              const rect = e.currentTarget.getBoundingClientRect();
              setSplitPos(((e.clientX - rect.left) / rect.width) * 100);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${mediaB.storagePath}`} alt={mediaB.title} className="block w-full" />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${splitPos}%` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${mediaA.storagePath}`}
                alt={mediaA.title}
                className="absolute inset-0 block h-full object-cover object-left"
                style={{ width: `${(100 / splitPos) * 100}%`, maxWidth: "none" }}
              />
            </div>
            {/* Divider handle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 cursor-ew-resize bg-violet-500"
              style={{ left: `${splitPos}%` }}
            >
              <span className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-violet-500 bg-zinc-950/80 text-violet-300">
                ⇄
              </span>
            </div>
            <span className="absolute left-3 top-3 rounded bg-sky-500/80 px-2 py-0.5 text-xs font-bold text-black">
              A
            </span>
            <span className="absolute right-3 top-3 rounded bg-violet-500/80 px-2 py-0.5 text-xs font-bold text-white">
              B
            </span>
          </div>
          <p className="mt-2 text-center text-xs text-zinc-600">
            Geser garis ungu untuk membandingkan — kiri: A, kanan: B
          </p>
        </div>
      )}

      {/* Synced videos */}
      {bothVideos && (
        <div className="mt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {[mediaA, mediaB].map((m, i) => (
              <div key={m.id} className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
                <video
                  ref={i === 0 ? videoARef : videoBRef}
                  src={`/api/files/${m.storagePath}`}
                  className="w-full"
                  muted
                  playsInline
                  onTimeUpdate={i === 0 ? onVideoTimeUpdate : undefined}
                />
                <span
                  className={`absolute left-3 top-3 rounded px-2 py-0.5 text-xs font-bold ${
                    i === 0 ? "bg-sky-500/80 text-black" : "bg-violet-500/80 text-white"
                  }`}
                >
                  {i === 0 ? "A" : "B"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              onClick={togglePlay}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing ? "Jeda Keduanya" : "Putar Sinkron"}
            </button>
            <button
              onClick={restart}
              className="flex items-center gap-2 rounded-lg bg-zinc-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-600"
            >
              <RotateCcw className="size-4" /> Ulang dari Awal
            </button>
          </div>
        </div>
      )}

      {/* Mixed types */}
      {bothSelected && !bothVideos && !bothImages && (
        <p className="mt-6 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-300">
          Perbandingan slider tersedia untuk dua foto, dan playback sinkron untuk dua video.
          Pasangan campuran (foto vs video) ditampilkan berdampingan di halaman detail masing-masing.
        </p>
      )}

      {/* Vote */}
      {bothSelected && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4 text-amber-400" /> Vote: Mana yang Lebih Baik?
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => vote("a")}
              disabled={busy}
              className="rounded-lg border border-sky-600/50 bg-sky-600/10 px-4 py-2.5 text-sm font-medium text-sky-300 transition-colors hover:bg-sky-600/20 disabled:opacity-50"
            >
              👈 A: {mediaA.title.slice(0, 30)}
            </button>
            <button
              onClick={() => vote("b")}
              disabled={busy}
              className="rounded-lg border border-violet-600/50 bg-violet-600/10 px-4 py-2.5 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-600/20 disabled:opacity-50"
            >
              B: {mediaB.title.slice(0, 30)} 👉
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Rekor head-to-head saat ini:{" "}
            <span className="font-semibold text-sky-400">A menang {headToHead.aWins}×</span>{" "}
            ·{" "}
            <span className="font-semibold text-violet-400">B menang {headToHead.bWins}×</span>
          </p>
          {voteMsg && (
            <p className="mt-2 text-center text-xs text-emerald-400">{voteMsg}</p>
          )}
        </div>
      )}

      {/* Prompt comparison */}
      {bothSelected && (mediaA.prompt || mediaB.prompt) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[mediaA, mediaB].map((m, i) => (
            <div key={m.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className={`text-xs font-semibold ${i === 0 ? "text-sky-400" : "text-violet-400"}`}>
                {i === 0 ? "A" : "B"} — {m.title.slice(0, 50)}
              </p>
              {m.agentName && <p className="mt-0.5 text-xs text-zinc-600">🤖 {m.agentName}</p>}
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                {m.prompt ?? "(tanpa prompt)"}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
