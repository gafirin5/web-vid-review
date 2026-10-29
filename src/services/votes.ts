import { db } from "@/db/client";
import { publishEvent } from "@/lib/events";

export interface CastVoteInput {
  winnerId: string;
  loserId: string;
  voterName?: string;
  comment?: string;
}

/** Catat vote A/B + event realtime. Melempar Error untuk input tidak valid. */
export async function castVote(input: CastVoteInput) {
  const { winnerId, loserId } = input;
  if (!winnerId || !loserId) throw new Error("'winner_id' dan 'loser_id' wajib diisi");
  if (winnerId === loserId) throw new Error("Pemenang dan yang kalah harus berbeda");

  const [winner, loser] = await Promise.all([
    db.prisma.media.findUnique({ where: { id: winnerId }, select: { id: true, title: true } }),
    db.prisma.media.findUnique({ where: { id: loserId }, select: { id: true, title: true } }),
  ]);
  if (!winner || !loser) throw new Error("Media tidak ditemukan");

  const vote = await db.prisma.comparisonVote.create({
    data: {
      winnerId,
      loserId,
      voterName: (input.voterName ?? "Anonymous").slice(0, 120),
      comment: input.comment ? input.comment.slice(0, 1000) : null,
    },
  });

  publishEvent({
    type: "compare.voted",
    title: `Vote A/B: "${winner.title.slice(0, 40)}" menang`,
    message: `atas "${loser.title.slice(0, 40)}"`,
    payload: { winnerId, loserId },
  });

  return vote;
}

/** Statistik head-to-head antara dua media. */
export async function compareStats(aId: string, bId: string) {
  const [aWins, bWins, mediaA, mediaB] = await Promise.all([
    db.prisma.comparisonVote.count({ where: { winnerId: aId, loserId: bId } }),
    db.prisma.comparisonVote.count({ where: { winnerId: bId, loserId: aId } }),
    db.prisma.media.findUnique({
      where: { id: aId },
      include: {
        agent: { select: { name: true } },
        tags: { include: { tag: true } },
        reviews: { select: { rating: true } },
      },
    }),
    db.prisma.media.findUnique({
      where: { id: bId },
      include: {
        agent: { select: { name: true } },
        tags: { include: { tag: true } },
        reviews: { select: { rating: true } },
      },
    }),
  ]);

  if (!mediaA || !mediaB) return null;

  const summarize = (m: typeof mediaA) => ({
    id: m.id,
    title: m.title,
    mediaType: m.mediaType,
    thumbnailPath: m.thumbnailPath,
    prompt: m.prompt,
    agent: m.agent,
    tags: m.tags.map((t) => t.tag.name),
    averageRating:
      m.reviews.length > 0
        ? Number((m.reviews.reduce((s, r) => s + r.rating, 0) / m.reviews.length).toFixed(2))
        : null,
  });

  const total = aWins + bWins;
  return {
    a: summarize(mediaA),
    b: summarize(mediaB),
    headToHead: {
      aWins,
      bWins,
      total,
      winner: total === 0 ? null : aWins === bWins ? "tie" : aWins > bWins ? "a" : "b",
    },
  };
}