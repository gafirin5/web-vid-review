import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Film, ImageIcon, ShieldOff } from "lucide-react";
import { db } from "@/db/client";
import { formatBytes, formatDuration } from "@/lib/http";

export const dynamic = "force-dynamic";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  const share = await db.prisma.shareLink.findUnique({
    where: { token },
    include: {
      media: {
        include: {
          agent: { select: { name: true } },
          tags: { include: { tag: true } },
          reviews: { orderBy: { createdAt: "desc" } },
        },
      },
      collection: {
        include: {
          agent: { select: { name: true } },
          items: {
            orderBy: { position: "asc" },
            include: {
              media: { include: { tags: { include: { tag: true } } } },
            },
          },
        },
      },
    },
  });

  if (!share) notFound();

  const expired = share.expiresAt != null && share.expiresAt < new Date();
  if (share.revoked || expired) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <ShieldOff className="size-12 text-zinc-700" />
        <h1 className="mt-4 text-lg font-bold">Link tidak tersedia</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {share.revoked
            ? "Link berbagi ini sudah dicabut oleh pemiliknya."
            : "Link berbagi ini sudah kedaluwarsa."}
        </p>
        <Link href="/" className="mt-6 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white">
          Buka galeri publik
        </Link>
      </div>
    );
  }

  const expiryLabel = share.expiresAt
    ? `Berlaku hingga ${share.expiresAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`
    : "Tanpa batas waktu";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">
            {share.media ? share.media.title : share.collection?.name ?? "Media dibagikan"}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
            <Clock className="size-3.5" /> {expiryLabel} · 🔗 Link publik read-only
          </p>
        </div>
        <Link href="/" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" /> Galeri
        </Link>
      </div>

      {share.media && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
              {share.media.mediaType === "VIDEO" ? (
                <video controls preload="metadata" className="max-h-[70vh] w-full" src={`/api/files/${share.media.storagePath}`} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${share.media.storagePath}`} alt={share.media.title} className="max-h-[70vh] w-full object-contain" />
              )}
            </div>
            {share.media.description && (
              <p className="mt-3 text-sm text-zinc-400">{share.media.description}</p>
            )}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">Info</h2>
            <dl className="mt-3 space-y-2 text-sm text-zinc-400">
              <div className="flex items-center gap-2">
                {share.media.mediaType === "VIDEO" ? <Film className="size-4" /> : <ImageIcon className="size-4" />}
                <dd>
                  {share.media.mediaType === "VIDEO" ? "Video" : "Foto"} · {formatBytes(share.media.sizeBytes)}
                  {share.media.durationSeconds != null && ` · ${formatDuration(share.media.durationSeconds)}`}
                </dd>
              </div>
              {share.media.agent && <dd>🤖 {share.media.agent.name}</dd>}
            </dl>
            {share.media.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-800 pt-3">
                {share.media.tags.map((t) => (
                  <span key={t.tag.id} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    #{t.tag.name}
                  </span>
                ))}
              </div>
            )}
            {share.media.prompt && (
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
                {share.media.prompt}
              </pre>
            )}
          </div>
        </div>
      )}

      {share.collection && (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {share.collection.items.map((i) => (
            <div key={i.mediaId} className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              {i.media.thumbnailPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${i.media.thumbnailPath}`} alt={i.media.title} className="w-full" />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-zinc-950 text-3xl">
                  {i.media.mediaType === "VIDEO" ? "🎞️" : "🖼️"}
                </div>
              )}
              <div className="p-3">
                <p className="truncate text-sm font-medium">{i.media.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {i.media.mediaType === "VIDEO" ? formatDuration(i.media.durationSeconds) : "Foto"} ·{" "}
                  {formatBytes(i.media.sizeBytes)}
                </p>
                {i.media.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {i.media.tags.slice(0, 3).map((t) => (
                      <span key={t.tag.id} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        #{t.tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}