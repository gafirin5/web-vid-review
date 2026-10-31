import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { db } from "@/db/client";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CharacterInput {
  name?: unknown;
  game?: unknown;
  aliases?: unknown;
}

/**
 * POST /api/v1/characters/import — impor/merge karakter dari pipeline (admin).
 * Body: { characters: [{ name, game?, aliases? }], games?: string[] }
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const rows: CharacterInput[] = Array.isArray(body?.characters) ? body.characters : [];
  const games: string[] = Array.isArray(body?.games) ? body.games.map(String) : [];

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    const game = typeof row.game === "string" && row.game.trim() ? row.game.trim() : null;
    const aliases = Array.isArray(row.aliases)
      ? JSON.stringify(row.aliases.map(String).slice(0, 20))
      : null;

    const existing = await db.prisma.character.findFirst({ where: { name, game } });
    if (existing) {
      await db.prisma.character.update({
        where: { id: existing.id },
        data: { aliases: aliases ?? existing.aliases },
      });
      updated += 1;
    } else {
      await db.prisma.character.create({ data: { name, game, aliases } });
      created += 1;
    }
    if (game) {
      await db.prisma.game.upsert({ where: { name: game }, create: { name: game }, update: {} });
    }
  }

  for (const game of games) {
    const name = game.trim();
    if (!name) continue;
    await db.prisma.game.upsert({ where: { name }, create: { name }, update: {} });
  }

  return jsonOk({ created, updated, games: games.length }, { status: 201 });
}
