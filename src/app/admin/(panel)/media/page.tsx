import Link from "next/link";
import { db } from "@/db/client";
import MediaTable, { type AdminMediaRow } from "./MediaTable";

export const dynamic = "force-dynamic";

interface MediaAdminPageProps {
  searchParams: Promise<{ status?: string; media_type?: string; page?: string }>;
}

export default async function AdminMediaPage({ searchParams }: MediaAdminPageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 25;
  const status = ["PENDING_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"].includes(
    params.status ?? ""
  )
    ? params.status
    : undefined;
  const mediaType =
    params.media_type === "IMAGE" || params.media_type === "VIDEO" ? params.media_type : undefined;

  const where = {
    ...(status ? { status } : {}),
    ...(mediaType ? { mediaType } : {}),
  };

  const [items, total] = await Promise.all([
    db.prisma.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        agent: { select: { name: true } },
        _count: { select: { reviews: true } },
      },
    }),
    db.prisma.media.count({ where }),
  ]);

  const rows: AdminMediaRow[] = items.map((m) => ({
    id: m.id,
    title: m.title,
    contentId: m.contentId,
    role: m.role,
    index: m.index,
    mediaType: m.mediaType,
    status: m.status,
    sizeBytes: m.sizeBytes.toString(),
    createdAt: m.createdAt.toISOString(),
    thumbnailPath: m.thumbnailPath,
    agentName: m.agent?.name ?? null,
    reviewCount: m._count.reviews,
    quarantined: Boolean(m.quarantinedPath),
  }));

  const currentQuery = new URLSearchParams(
    Object.entries({ status, media_type: mediaType }).filter(([, v]) => v) as [string, string][]
  ).toString();

  const filters: Array<{ label: string; query: string }> = [
    { label: "Semua", query: "" },
    { label: "Disetujui", query: "status=APPROVED" },
    { label: "Menunggu", query: "status=PENDING_REVIEW" },
    { label: "Ditolak", query: "status=REJECTED" },
    { label: "Video", query: "media_type=VIDEO" },
    { label: "Foto", query: "media_type=IMAGE" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Kelola Media</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total} media — moderasi, karantina zero-delete, atau hapus permanen
          </p>
        </div>
        <Link
          href="/admin/rejected"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs text-zinc-300 hover:border-amber-600/50 hover:text-amber-300"
        >
          Lihat Karantina →
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={`/admin/media${f.query ? `?${f.query}` : ""}`}
            className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
              f.query === currentQuery
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        <MediaTable rows={rows} />
      </div>

      {total > limit && (
        <div className="mt-4 flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/media?page=${page - 1}`}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              ← Sebelumnya
            </Link>
          )}
          <span className="rounded-lg px-4 py-2 text-sm text-zinc-500">
            Hal. {page} / {Math.ceil(total / limit)}
          </span>
          {page * limit < total && (
            <Link
              href={`/admin/media?page=${page + 1}`}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Berikutnya →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
