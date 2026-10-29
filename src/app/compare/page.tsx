import Link from "next/link";
import { ArrowLeft, GitCompareArrows } from "lucide-react";
import { db } from "@/db/client";
import CompareClient from "./CompareClient";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;

  const options = await db.prisma.media.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, title: true, mediaType: true },
  });

  const selected = await db.prisma.media.findMany({
    where: {
      id: { in: [params.a, params.b].filter(Boolean) as string[] },
    },
    include: { agent: { select: { name: true } } },
  });

  const mediaA = selected.find((m) => m.id === params.a) ?? null;
  const mediaB = selected.find((m) => m.id === params.b) ?? null;

  let aWins = 0;
  let bWins = 0;
  if (mediaA && mediaB) {
    [aWins, bWins] = await Promise.all([
      db.prisma.comparisonVote.count({ where: { winnerId: mediaA.id, loserId: mediaB.id } }),
      db.prisma.comparisonVote.count({ where: { winnerId: mediaB.id, loserId: mediaA.id } }),
    ]);
  }

  const toCompareMedia = (m: typeof mediaA) =>
    m
      ? {
          id: m.id,
          title: m.title,
          mediaType: m.mediaType,
          storagePath: m.storagePath,
          prompt: m.prompt,
          agentName: m.agent?.name ?? null,
        }
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" /> Kembali ke galeri
      </Link>

      <h1 className="flex items-center gap-2 text-xl font-bold">
        <GitCompareArrows className="size-6 text-violet-400" />
        A/B Generation Comparison
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Bandingkan hasil generate dari dua model/prompt berbeda — slider foto, playback
        video sinkron, dan vote komunitas.
      </p>

      <div className="mt-6">
        <CompareClient
          key={`${mediaA?.id ?? "none"}-${mediaB?.id ?? "none"}`}
          mediaA={toCompareMedia(mediaA)}
          mediaB={toCompareMedia(mediaB)}
          options={options}
          headToHead={{ aWins, bWins }}
        />
      </div>
    </div>
  );
}
