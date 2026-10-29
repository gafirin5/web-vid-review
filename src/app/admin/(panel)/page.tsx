import Link from "next/link";
import {
  Bot,
  Clapperboard,
  HardDrive,
  ImageIcon,
  MessageSquare,
  Star,
} from "lucide-react";
import { statfs } from "node:fs/promises";
import { prisma } from "@/db/client";
import { UPLOADS_ROOT, ensureUploadDirs } from "@/lib/paths";
import { formatBytes, formatDuration } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await ensureUploadDirs();

  const [
    totalMedia,
    totalVideos,
    totalImages,
    totalReviews,
    totalAgents,
    totalTags,
    mediaAgg,
    videoAgg,
    recentMedia,
    topAgents,
  ] = await Promise.all([
    prisma.media.count(),
    prisma.media.count({ where: { mediaType: "VIDEO" } }),
    prisma.media.count({ where: { mediaType: "IMAGE" } }),
    prisma.review.count(),
    prisma.agent.count(),
    prisma.tag.count(),
    prisma.media.aggregate({ _sum: { sizeBytes: true } }),
    prisma.media.aggregate({
      where: { mediaType: "VIDEO" },
      _sum: { durationSeconds: true },
    }),
    prisma.media.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { agent: { select: { name: true } } },
    }),
    prisma.agent.findMany({
      include: { _count: { select: { media: true, reviews: true } } },
      orderBy: { media: { _count: "desc" } },
      take: 5,
    }),
  ]);

  const disk = await statfs(UPLOADS_ROOT).catch(() => null);
  const diskTotal = disk ? Number(disk.blocks) * Number(disk.bsize) : 0;
  const diskFree = disk ? Number(disk.bavail) * Number(disk.bsize) : 0;
  const diskUsedPct = diskTotal ? ((diskTotal - diskFree) / diskTotal) * 100 : 0;

  const cards = [
    { label: "Total Media", value: totalMedia, icon: Clapperboard, sub: `${totalVideos} video · ${totalImages} foto` },
    { label: "Ukuran Media", value: formatBytes(mediaAgg._sum.sizeBytes ?? 0), icon: HardDrive, sub: `total durasi video ${formatDuration(videoAgg._sum.durationSeconds ?? 0)}` },
    { label: "Review", value: totalReviews, icon: MessageSquare, sub: `${totalTags} tag unik` },
    { label: "AI Agents", value: totalAgents, icon: Bot, sub: "terdaftar" },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">Ringkasan platform OmniMedia AI Review Hub</p>

      {/* Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">{c.label}</span>
              <c.icon className="size-4 text-violet-400" />
            </div>
            <p className="mt-2 text-2xl font-bold">{c.value}</p>
            <p className="mt-1 text-xs text-zinc-600">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Disk */}
      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-medium">
            <HardDrive className="size-4 text-violet-400" /> Penyimpanan Disk
          </span>
          <span className="text-zinc-400">
            {formatBytes(diskTotal - diskFree)} / {formatBytes(diskTotal)} ·{" "}
            <span className={diskUsedPct > 90 ? "font-semibold text-red-400" : "text-zinc-500"}>
              sisa {formatBytes(diskFree)}
            </span>
          </span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all ${
              diskUsedPct > 90 ? "bg-red-500" : diskUsedPct > 80 ? "bg-amber-500" : "bg-violet-500"
            }`}
            style={{ width: `${Math.min(diskUsedPct, 100)}%` }}
          />
        </div>
        {diskUsedPct > 80 && (
          <p className="mt-2 text-xs text-amber-400">
            ⚠️ Disk terpakai {diskUsedPct.toFixed(0)}% — pertimbangkan backup & pembersihan.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Recent media */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ImageIcon className="size-4 text-violet-400" /> Media Terbaru
          </h2>
          <ul className="mt-3 divide-y divide-zinc-800">
            {recentMedia.length === 0 && (
              <li className="py-3 text-sm text-zinc-600">Belum ada media.</li>
            )}
            {recentMedia.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/media/${m.id}`}
                    className="truncate text-sm font-medium text-zinc-200 hover:text-violet-300"
                  >
                    {m.title}
                  </Link>
                  <p className="text-xs text-zinc-600">
                    {m.mediaType === "VIDEO" ? "🎞️" : "🖼️"}{" "}
                    {m.agent ? `🤖 ${m.agent.name}` : "👤 manual"} ·{" "}
                    {formatBytes(m.sizeBytes)} · {m.status}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-zinc-600">
                  {new Date(m.createdAt).toLocaleDateString("id-ID")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Agent leaderboard */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Star className="size-4 text-violet-400" /> Agent Teraktif
          </h2>
          <ul className="mt-3 divide-y divide-zinc-800">
            {topAgents.length === 0 && (
              <li className="py-3 text-sm text-zinc-600">
                Belum ada agent. <Link href="/admin/agents" className="text-violet-400">Buat agent →</Link>
              </li>
            )}
            {topAgents.map((a, i) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-200">
                      {a.name} {!a.active && <span className="text-xs text-red-400">(nonaktif)</span>}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {a.modelProvider} · {a._count.reviews} review
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-violet-600/15 px-2.5 py-1 text-xs font-semibold text-violet-300">
                  {a._count.media} media
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
