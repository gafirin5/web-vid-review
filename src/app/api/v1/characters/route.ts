import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/characters?q=&game=&limit=
 * Sumber autocomplete karakter (diisi dari DB pipeline lewat `npm run characters:import`).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const game = (url.searchParams.get("game") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));

  const items = await db.prisma.character.findMany({
    where: {
      ...(q ? { name: { contains: q } } : {}),
      ...(game ? { game } : {}),
    },
    orderBy: { name: "asc" },
    take: limit,
  });
  const games = await db.prisma.game.findMany({ orderBy: { name: "asc" } });

  return jsonOk({
    items: items.map((c) => ({
      id: c.id,
      name: c.name,
      game: c.game,
      aliases: c.aliases ? (JSON.parse(c.aliases) as string[]) : [],
    })),
    games: games.map((g) => g.name),
    count: items.length,
  });
}
