import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { db } from "@/db/client";
import { formatBytes, formatDuration } from "@/lib/http";
import ReviewCard from "./ReviewCard";

export const dynamic = "force-dynamic";

interface ReviewAdminPageProps {
  searchParams: Promise<{ kind?: string }>;
}

export default async function AdminReviewPage({ searchParams }: ReviewAdminPageProps) {
  const params = await searchParams;
  const kind = params.kind === "CHARACTER" ? "CHARACTER" : params.kind === "OTHER" ? "OTHER" : undefined;

  const where = {
    status: "PENDING_REVIEW",
    ...(kind === "CHARACTER"
      ? { reviewKind: "CHARACTER" }
      : kind === "OTHER"
        ? { OR: [{ reviewKind: { not: "CHARACTER" } }, { reviewKind: null }] }
        : {}),
  };

  const [items, counts] = await Promise.all([
    db.prisma.media.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        agent: { select: { name: true } },
        tags: { include: { tag: true } },
      },
    }),
    Promise.all([
      db.prisma.media.count({ where: { status: "PENDING_REVIEW" } }),
      db.prisma.media.count({ where: { status: "PENDING_REVIEW", reviewKind: "CHARACTER" } }),
      db.prisma.media.count({
        where: {
          status: "PENDING_REVIEW",
          OR: [{ reviewKind: { not: "CHARACTER" } }, { reviewKind: null }],
        },
      }),
    ]),
  ]);

  const [total, characterCount, otherCount] = counts;

  const filters = [
    { label: `Semua (${total})`, href: "/admin/review", active: !kind },
    {
      label: `Karakter (${characterCount})`,
      href: "/admin/review?kind=CHARACTER",
      active: kind === "CHARACTER",
    },
    {
      label: `Lainnya (${otherCount})`,
      href: "/admin/review?kind=OTHER",
      active: kind === "OTHER",
    },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold">Review Konten</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Antrean konten yang ditandai untuk ditinjau — identifikasi karakter atau periksa &amp; putuskan.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
              f.active
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-16 text-center">
          <ClipboardList className="mb-3 size-8 text-zinc-700" />
          <p className="text-sm font-medium text-zinc-400">Antrean review kosong</p>
          <p className="mt-1 text-xs text-zinc-600">
            Tidak ada konten menunggu tinjauan. Media baru default-nya langsung disetujui.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {items.map((m) => (
            <ReviewCard
              key={m.id}
              media={{
                id: m.id,
                contentId: m.contentId,
                title: m.title,
                mediaType: m.mediaType,
                thumbnailPath: m.thumbnailPath,
                durationSeconds: m.durationSeconds,
                sizeBytes: Number(m.sizeBytes),
                createdAt: m.createdAt.toISOString(),
                reviewKind: m.reviewKind,
                characterName: m.characterName,
                reviewNote: m.reviewNote,
                agentName: m.agent?.name ?? null,
                tags: m.tags.map((t) => t.tag.name),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}