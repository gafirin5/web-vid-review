import Link from "next/link";
import { Film, ImageIcon, Clapperboard, Tags } from "lucide-react";
import { db } from "@/db/client";
import { formatBytes, formatDuration } from "@/lib/http";
import RealtimeGallery from "@/components/RealtimeGallery";

export const dynamic = "force-dynamic";

interface GalleryPageProps {
  searchParams: Promise<{ media_type?: string; tag?: string }>;
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const params = await searchParams;
  const mediaType =
    params.media_type === "IMAGE" || params.media_type === "VIDEO" ? params.media_type : undefined;
  const tag = params.tag?.toLowerCase();

  const where = {
    status: "APPROVED" as const,
    ...(mediaType ? { mediaType } : {}),
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
  };

  const [items, stats] = await Promise.all([
    db.prisma.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        agent: { select: { name: true } },
        tags: { include: { tag: true } },
      },
    }),
    Promise.all([
      db.prisma.media.count(),
      db.prisma.media.count({ where: { mediaType: "VIDEO" } }),
      db.prisma.media.count({ where: { mediaType: "IMAGE" } }),
    ]),
  ]);

  const [total, videos, images] = stats;

  const filters = [
    { label: "Semua", href: "/", active: !mediaType && !tag },
    { label: "Video", href: "/?media_type=VIDEO", active: mediaType === "VIDEO" },
    { label: "Foto", href: "/?media_type=IMAGE", active: mediaType === "IMAGE" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Hero / stats */}
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Clapperboard className="size-6 text-violet-400" />
          Koleksi Media AI
          <RealtimeGallery />
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {total} media · {videos} video · {images} foto — diunggah oleh AI Agent & manusia
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                f.active
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {f.label}
            </Link>
          ))}
          {tag && (
            <span className="flex items-center gap-1 rounded-full bg-violet-600/20 px-4 py-1.5 text-sm text-violet-300">
              <Tags className="size-3.5" /> #{tag}
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-24 text-center">
          <Clapperboard className="size-12 text-zinc-700" />
          <h2 className="mt-4 text-lg font-semibold text-zinc-300">Galeri masih kosong</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Unggah media pertama Anda lewat AI agent (MCP/REST API) atau minta agent
            menjalankan tool <code className="text-zinc-400">upload_media</code>.
          </p>
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {items.map((m) => (
            <Link
              key={m.id}
              href={`/media/${m.id}`}
              className="group mb-4 block break-inside-avoid overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
            >
              <div className="relative w-full overflow-hidden bg-zinc-950">
                {m.thumbnailPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${m.thumbnailPath}`}
                    alt={m.title}
                    className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center">
                    <span className="text-4xl text-zinc-700">
                      {m.mediaType === "VIDEO" ? "🎞️" : "🖼️"}
                    </span>
                  </div>
                )}
                <div className="absolute left-2 top-2 flex gap-1.5">
                  {m.mediaType === "VIDEO" ? (
                    <span className="flex items-center gap-1 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
                      <Film className="size-3" />
                      {formatDuration(m.durationSeconds)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
                      <ImageIcon className="size-3" /> Foto
                    </span>
                  )}
                  {m.durationSeconds == null && m.mediaType === "IMAGE" && (
                    <span className="rounded bg-black/70 px-2 py-0.5 text-xs text-zinc-300">
                      {formatBytes(m.sizeBytes)}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3">
                <h3 className="truncate text-sm font-medium text-zinc-100">{m.title}</h3>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {m.agent ? `🤖 ${m.agent.name}` : "👤 Manual upload"} ·{" "}
                  {new Date(m.createdAt).toLocaleDateString("id-ID")}
                </p>
                {m.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.tags.slice(0, 3).map((t) => (
                      <span
                        key={t.tag.id}
                        className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                      >
                        #{t.tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
