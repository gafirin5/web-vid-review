"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const VIOLET = "#8b5cf6";
const SKY = "#38bdf8";
const EMERALD = "#34d399";
const AMBER = "#fbbf24";

interface ChartsProps {
  uploadTrend: Array<{ date: string; videos: number; images: number }>;
  topTags: Array<{ name: string; count: number }>;
  ratingDistribution: Array<{ rating: number; count: number }>;
  totals: {
    videos: number;
    images: number;
    humanReviews: number;
    aiReviews: number;
  };
}

const tooltipStyle = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e4e4e7",
};

export default function AnalyticsCharts({
  uploadTrend,
  topTags,
  ratingDistribution,
  totals,
}: ChartsProps) {
  const mediaTypeData = [
    { name: "Video", value: totals.videos },
    { name: "Foto", value: totals.images },
  ];
  const reviewSplit = [
    { name: "Review Manusia", value: totals.humanReviews },
    { name: "Review AI", value: totals.aiReviews },
  ];
  const PIE_COLORS = [VIOLET, SKY];
  const REVIEW_COLORS = [SKY, EMERALD];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Upload trend */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold">Tren Upload (14 Hari Terakhir)</h3>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={uploadTrend}>
              <defs>
                <linearGradient id="gVideos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VIOLET} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={VIOLET} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gImages" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SKY} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={SKY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Area
                type="monotone"
                dataKey="videos"
                name="Video"
                stroke={VIOLET}
                fill="url(#gVideos)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="images"
                name="Foto"
                stroke={SKY}
                fill="url(#gImages)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distribusi tipe media */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold">Distribusi Tipe Media</h3>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={mediaTypeData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={4}
              >
                {mediaTypeData.map((entry, i) => (
                  <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Review split */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold">Review: Manusia vs AI</h3>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={reviewSplit}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={4}
              >
                {reviewSplit.map((entry, i) => (
                  <Cell key={entry.name} fill={REVIEW_COLORS[i % REVIEW_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rating distribution */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold">Distribusi Skor Review</h3>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ratingDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="rating" stroke="#71717a" fontSize={11} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Jumlah review" fill={AMBER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top tags */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold">Tag Terpopuler</h3>
        <div className="mt-4 h-56">
          {topTags.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-zinc-600">
              Belum ada tag.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTags} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" stroke="#71717a" fontSize={11} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#71717a"
                  fontSize={11}
                  width={110}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Media" fill={VIOLET} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
