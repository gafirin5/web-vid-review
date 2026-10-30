#!/usr/bin/env node
/**
 * Impor karakter & game dari database pipeline (nextgen_cosplay.db) atau JSON.
 *
 * Usage:
 *   npm run characters:import -- --db /path/nextgen_cosplay.db
 *   npm run characters:import -- --json ./characters.json
 *
 * JSON: [{ "name": "Hsin", "game": "Wuthering Waves", "aliases": ["..."] }]
 */
import "dotenv/config";
import fs from "node:fs";
import Database from "better-sqlite3";
import { db } from "../src/db/client";

interface Row {
  name: string;
  game: string | null;
  aliases?: string[];
}

function fromSqlite(file: string): Row[] {
  const sqlite = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const has = (t: string) => tables.some((row) => row.name === t);

    if (!has("characters")) throw new Error("Tabel `characters` tidak ditemukan di DB pipeline");

    const cols = (sqlite.prepare("PRAGMA table_info(characters)").all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    const nameCol = ["name", "character_name", "character"].find((c) => cols.includes(c));
    const gameCol = ["game", "game_name", "game_raw"].find((c) => cols.includes(c));
    if (!nameCol) throw new Error("Kolom nama karakter tidak dikenali");

    const rows = sqlite
      .prepare(
        `SELECT "${nameCol}" AS name${gameCol ? `, "${gameCol}" AS game` : ""} FROM characters`
      )
      .all() as Array<{ name: string; game?: string | null }>;

    return rows
      .map((r) => ({ name: String(r.name ?? "").trim(), game: r.game ? String(r.game).trim() : null }))
      .filter((r) => r.name);
  } finally {
    sqlite.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dbArg = args[args.indexOf("--db") + 1];
  const jsonArg = args[args.indexOf("--json") + 1];

  let rows: Row[];
  if (args.includes("--db")) {
    if (!dbArg) throw new Error("--db memerlukan path file");
    rows = fromSqlite(dbArg);
  } else if (args.includes("--json")) {
    if (!jsonArg) throw new Error("--json memerlukan path file");
    const parsed = JSON.parse(fs.readFileSync(jsonArg, "utf8"));
    rows = (Array.isArray(parsed) ? parsed : parsed.characters ?? []) as Row[];
  } else {
    throw new Error("Gunakan --db <path> atau --json <path>");
  }

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const game = row.game ? String(row.game).trim() : null;
    const aliases = row.aliases?.length ? JSON.stringify(row.aliases.slice(0, 20)) : null;

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

  console.log(`✅ Impor karakter selesai: ${created} baru, ${updated} diperbarui`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
