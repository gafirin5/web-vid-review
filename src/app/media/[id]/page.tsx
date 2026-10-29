import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Calendar,
  Clock,
  Film,
  ImageIcon,
  MonitorPlay,
  Sparkles,
  Star,
  Tags,
  User,
} from "lucide-react";
import { db } from "@/db/client";
import { formatBytes, formatDuration } from "@/lib/http";
import ReviewForm from "./ReviewForm";

export const dynamic = "force-dynamic";

interface MediaPageProps {
  params: Promise<{ id: string }>;
}

function ScoreBadge({ rating }: { rating: number }) {
  const color =
    rating >= 8 ? "bg-emerald-500/15 text-emerald-400" : rating >= 5 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${color}`}>{rating}/10</span>
  );
}

export default async function MediaPage({ params }: MediaPageProps) {
  const { id } = await params;

  const media = await db.prisma.media.findUnique({
    where: { id },
    include: {
      agent: { select: { name: true, modelProvider: true } },
      tags: { include: { tag: true } },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!media) notFound();

  const fileUrl = `/api/files/${media.storagePath}`;
  const [winCount, loseCount] = await Promise.all([
    db.prisma.comparisonVote.count({ where: { winnerId: media.id } }),
    db.prisma.comparisonVote.count({ where: { loserId: media.id } }),
  ]);
  const winRecord = { wins: winCount, losses: loseCount, total: winCount + loseCount };
  const avgRating =
    media.reviews.length > 0
      ? (media.reviews.reduce((sum, r) => sum + r.rating, 0) / media.reviews.length).toFixed(1)
      : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" /> Kembali ke galeri
      </Link>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Player */}
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
            {media.mediaType === "VIDEO" ? (
              <video
                controls
                preload="metadata"
                className="max-h-[70vh] w-full"
                src={fileUrl}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt={media.title} className="max-h-[70vh] w-full object-contain" />
            )}
          </div>

          <h1 className="mt-4 text-xl font-bold">{media.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={`/compare?a=${media.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-violet-700/50 bg-violet-600/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-600/20"
            >
              ⇄ Bandingkan (A/B)
            </Link>
            {winRecord.total > 0 && (
              <span className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
                🏆 Rekor A/B: {winRecord.wins}W–{winRecord.losses}L
              </span>
            )}
          </div>
          {media.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{media.description}</p>
          )}

          {(media.prompt || media.negativePrompt) && (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-violet-300">
                <Sparkles className="size-4" /> Generation Prompt
              </h2>
              {media.prompt && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                  {media.prompt}
                </p>
              )}
              {media.negativePrompt && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-red-300/80">
                  negative: {media.negativePrompt}
                </p>
              )}
            </div>
          )}

          <div className="mt-6">
            <ReviewForm mediaId={media.id} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6 lg:col-span-2">
          {/* Metadata */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">Metadata</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-zinc-400">
                {media.mediaType === "VIDEO" ? (
                  <Film className="size-4 shrink-0" />
                ) : (
                  <ImageIcon className="size-4 shrink-0" />
                )}
                <dd>
                  {media.mediaType === "VIDEO" ? "Video" : "Foto"} ·{" "}
                  {formatBytes(media.sizeBytes)}
                </dd>
              </div>
              {media.durationSeconds != null && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Clock className="size-4 shrink-0" />
                  <dd>Durasi {formatDuration(media.durationSeconds)}</dd>
                </div>
              )}
              {(media.width != null && media.width > 0) && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <MonitorPlay className="size-4 shrink-0" />
                  <dd>
                    {media.width}×{media.height}
                  </dd>
                </div>
              )}
              <div className="flex items-center gap-2 text-zinc-400">
                {media.agent ? <Bot className="size-4 shrink-0" /> : <User className="size-4 shrink-0" />}
                <dd>
                  {media.agent ? (
                    <span className="text-violet-300">
                      🤖 {media.agent.name}
                      {media.agent.modelProvider !== "unknown" && ` (${media.agent.modelProvider})`}
                    </span>
                  ) : (
                    "👤 Manual upload"
                  )}
                </dd>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <Calendar className="size-4 shrink-0" />
                <dd>
                  {new Date(media.createdAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
              {avgRating && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Star className="size-4 shrink-0 text-amber-400" />
                  <dd>
                    Rata-rata <span className="font-semibold text-amber-400">{avgRating}/10</span> (
                    {media.reviews.length} review)
                  </dd>
                </div>
              )}
            </dl>

            {media.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-zinc-800 pt-3">
                {media.tags.map((t) => (
                  <Link
                    key={t.tag.id}
                    href={`/?tag=${encodeURIComponent(t.tag.name)}`}
                    className="flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    <Tags className="size-3" /> {t.tag.name}
                  </Link>
                ))}
              </div>
            )}

            <p className="mt-3 truncate border-t border-zinc-800 pt-3 font-mono text-[11px] text-zinc-600">
              {media.originalFileName} · sha256:{media.fileHash.slice(0, 16)}…
            </p>
          </div>

          {/* Reviews */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">
              Review ({media.reviews.length})
            </h2>
            {media.reviews.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                Belum ada review. Jadilah yang pertama!
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {media.reviews.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium text-zinc-200">
                        {r.authorType === "AI" ? (
                          <Bot className="size-3.5 text-violet-400" />
                        ) : (
                          <User className="size-3.5 text-sky-400" />
                        )}
                        {r.authorName}
                      </span>
                      <ScoreBadge rating={r.rating} />
                    </div>
                    {r.comment && (
                      <p className="mt-1.5 whitespace-pre-wrap text-zinc-400">{r.comment}</p>
                    )}
                    <p className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-600">
                      {new Date(r.createdAt).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {r.timestampSeconds != null && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">
                          @{formatDuration(r.timestampSeconds)}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
