import Link from "next/link";
import { db } from "@/db/client";
import { formatBytes, formatDuration } from "@/lib/http";
import MediaActions from "./MediaActions";

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
      <h1 className="text-xl font-bold">Kelola Media</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {total} media — moderasi, ubah status, atau hapus permanen
      </p>

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

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
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
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-600">
                  Tidak ada media.
                </td>
              </tr>
            )}
            {items.map((m) => (
              <tr key={m.id} className="hover:bg-zinc-900/50">
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
                      <p className="text-xs text-zinc-600">{m._count.reviews} review</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-zinc-400">
                  {m.mediaType === "VIDEO"
                    ? `Video ${formatDuration(m.durationSeconds)}`
                    : "Foto"}
                </td>
                <td className="px-4 py-2.5 text-zinc-400">
                  {m.agent ? `🤖 ${m.agent.name}` : "—"}
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
                <td className="px-4 py-2.5 text-zinc-400">{formatBytes(m.sizeBytes)}</td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {new Date(m.createdAt).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-2.5">
                  <MediaActions mediaId={m.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
