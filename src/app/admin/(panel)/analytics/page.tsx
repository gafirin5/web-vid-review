import { Clock, Database, HardDrive, Star } from "lucide-react";
import { getOverviewMetrics, getStorageMetrics } from "@/services/metrics";
import { formatBytes, formatDuration } from "@/lib/http";
import AnalyticsCharts from "./AnalyticsCharts";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const [overview, storage] = await Promise.all([getOverviewMetrics(), getStorageMetrics()]);
  const { totals } = overview;

  const cards = [
    { label: "Total Ukuran Media", value: formatBytes(totals.totalSizeBytes), icon: HardDrive, sub: `${totals.media} media` },
    { label: "Total Durasi Video", value: formatDuration(totals.totalVideoDurationSeconds), icon: Clock, sub: `${totals.videos} video` },
    { label: "Rata-rata Skor", value: totals.averageRating != null ? `${totals.averageRating}/10` : "—", icon: Star, sub: `${totals.reviews} review` },
    { label: "Ukuran Database", value: formatBytes(storage.database.sizeBytes), icon: Database, sub: `${totals.agents} agent · ${totals.tags} tag` },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold">Analitik & Metrik</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Statistik lengkap platform — juga tersedia via REST:{" "}
        <code className="text-xs text-zinc-400">/api/v1/metrics/overview</code> &{" "}
        <code className="text-xs text-zinc-400">/api/v1/metrics/storage</code>
      </p>

      {/* Summary cards */}
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

      {/* Storage breakdown */}
      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <HardDrive className="size-4 text-violet-400" /> Rincian Penyimpanan
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {storage.folders.map((f) => (
            <div key={f.path} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs text-zinc-500">{f.name}</p>
              <p className="mt-1 text-lg font-bold">{formatBytes(f.sizeBytes)}</p>
              <p className="text-xs text-zinc-600">{f.fileCount} file</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          Disk: {formatBytes(storage.disk.totalBytes - storage.disk.freeBytes)} /{" "}
          {formatBytes(storage.disk.totalBytes)} terpakai · sisa{" "}
          {formatBytes(storage.disk.freeBytes)} · status{" "}
          <span
            className={
              storage.disk.status === "HEALTHY"
                ? "text-emerald-400"
                : storage.disk.status === "WARNING"
                  ? "text-amber-400"
                  : "text-red-400"
            }
          >
            {storage.disk.status}
          </span>
        </p>
      </div>

      {/* Charts */}
      <div className="mt-4">
        <AnalyticsCharts
          uploadTrend={overview.uploadTrend}
          topTags={overview.topTags}
          ratingDistribution={overview.ratingDistribution}
          totals={overview.totals}
        />
      </div>

      {/* Agent leaderboard */}
      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">Agent Scorecard</h2>
        {overview.agentBreakdown.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Belum ada agent.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="pb-2 pr-4">Agent</th>
                  <th className="pb-2 pr-4">Media</th>
                  <th className="pb-2 pr-4">Review Diberikan</th>
                  <th className="pb-2">Rata-rata Skor Diberikan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {overview.agentBreakdown.map((a) => (
                  <tr key={a.name}>
                    <td className="py-2.5 pr-4 font-medium text-zinc-200">{a.name}</td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-full bg-violet-600/15 px-2.5 py-1 text-xs font-semibold text-violet-300">
                        {a.mediaCount}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-400">{a.reviewCount}</td>
                    <td className="py-2.5 text-zinc-400">
                      {a.avgRating != null ? `${a.avgRating}/10` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
