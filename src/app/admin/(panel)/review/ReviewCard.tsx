"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, X } from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/http";

export interface ReviewMedia {
  id: string;
  contentId: string | null;
  title: string;
  mediaType: string;
  thumbnailPath: string | null;
  durationSeconds: number | null;
  sizeBytes: number;
  createdAt: string;
  reviewKind: string | null;
  characterName: string | null;
  reviewNote: string | null;
  agentName: string | null;
  tags: string[];
}

export default function ReviewCard({ media }: { media: ReviewMedia }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [characterName, setCharacterName] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  const isCharacter = media.reviewKind === "CHARACTER";

  async function resolve(status: "APPROVED" | "REJECTED") {
    setBusy(status);
    const body: Record<string, unknown> = { status };
    if (isCharacter && characterName.trim()) {
      body.character_name = characterName.trim();
    }
    if (reviewNote.trim()) {
      body.review_note = reviewNote.trim();
    }
    const res = await fetch(`/api/admin/media/${media.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Gagal memperbarui");
      setBusy(null);
      return;
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Thumbnail */}
        {media.thumbnailPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${media.thumbnailPath}`}
            alt=""
            className="h-28 w-full shrink-0 rounded-lg object-cover sm:w-44"
          />
        ) : (
          <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-4xl sm:w-44">
            {media.mediaType === "VIDEO" ? "🎞️" : "🖼️"}
          </div>
        )}

        {/* Info + form */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/media/${media.id}`}
                className="block truncate font-semibold text-zinc-100 hover:text-violet-300"
              >
                {media.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                {media.contentId && (
                  <span className="rounded bg-violet-500/10 px-2 py-0.5 font-mono text-violet-300">
                    {media.contentId}
                  </span>
                )}
                <span>{media.mediaType === "VIDEO" ? "Video" : "Foto"}</span>
                {media.mediaType === "VIDEO" && <span>{formatDuration(media.durationSeconds)}</span>}
                <span>{formatBytes(media.sizeBytes)}</span>
                <span>{media.agentName ? `🤖 ${media.agentName}` : "—"}</span>
                <span>{new Date(media.createdAt).toLocaleString("id-ID")}</span>
              </div>
              {media.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {media.tags.map((t) => (
                    <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                isCharacter ? "bg-violet-500/10 text-violet-300" : "bg-amber-500/10 text-amber-300"
              }`}
            >
              {isCharacter ? "Identifikasi karakter" : "Perlu tinjauan"}
            </span>
          </div>

          {isCharacter && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="Nama karakter (mis. Raiden Shogun — Genshin)"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
              />
              <input
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Catatan untuk agent (opsional)"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          {!isCharacter && (
            <input
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Catatan reviewer (opsional)"
              className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
            />
          )}

          {media.characterName && (
            <p className="mt-2 text-xs text-emerald-400">
              Teridentifikasi: {media.characterName}
              {media.reviewNote ? ` — ${media.reviewNote}` : ""}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              disabled={busy !== null}
              onClick={() => resolve("APPROVED")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              <Check className="size-4" />
              {busy === "APPROVED" ? "Menyimpan…" : "Setujui"}
            </button>
            <button
              disabled={busy !== null}
              onClick={() => resolve("REJECTED")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/80 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-40"
            >
              <X className="size-4" />
              Tolak
            </button>
            <Link
              href={`/media/${media.id}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              <ExternalLink className="size-4" />
              Buka
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}