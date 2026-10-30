import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { DUMPS_ROOT, resolveStoredPath } from "@/lib/paths";
import { publishEvent } from "@/lib/events";

/**
 * Fitur "dump" — snapshot data VALID (APPROVED) untuk handoff ke
 * nextgen_cosplay_pipeline. Menghasilkan artefak yang langsung dikenali pipeline:
 *
 *  1. nextgen_cosplay.sql   — dump SQLite tabel `contents` (schema = migrate_to_sqlite.py)
 *  2. arch_all.json         — `{"items":[...]}` inventori bentuk item DTK
 *                             (dipakai rank_candidates.py / auto_pipeline_cron.py)
 *  3. cid_overrides.json    — `{"cid_overrides":{...}}` hasil review karakter
 *                             (dimerge ke data/characters.json pipeline)
 *  4. media/                — salinan file fisik (opsional, via includeFiles)
 *  5. manifest.json         — metadata dump (jumlah, sumber, catatan)
 *
 * Catatan: `dtk_full.dump` TIDAK dihasilkan di sini — itu dump PostgreSQL sumber
 * DTK (Douyin watchlist + proxy), diproduksi terpisah oleh Douyin_TikTok_Download_API
 * (lihat pipeline AGENT_GUIDE.md: `pg_restore -U postgres -d dtk dtk_full.dump`).
 */

export interface DumpOptions {
  includeFiles?: boolean;
  notes?: string;
}

export interface DumpInfo {
  id: string;
  path: string;
  createdAt: string;
  count: number;
  fileCount: number;
  sizeBytes: number;
  notes?: string;
  includeFiles: boolean;
}

/** Satu aset fisik dalam bundle CID. */
interface DumpAsset {
  role: string;
  index: number;
  wvr_id: string;
  media_type: "IMAGE" | "VIDEO";
  title: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  storagePath: string;
  thumbnailPath: string | null;
  ext: string;
}

/** Satu CID (baris `contents`) beserta seluruh asetnya. */
interface DumpItem {
  content_id: string; // contentId ?? id (fallback UUID)
  wvr_id: string; // id media primary featherduster
  douyin_url: string | null;
  title: string;
  description: string | null;
  tags: string[];
  media_type: "IMAGE" | "VIDEO";
  duration_ms: number | null;
  height: number | null;
  width: number | null;
  agent: string | null;
  created_at: string;
  character_en: string | null; // hasil review karakter (parsed)
  game: string | null; // hasil review karakter (parsed)
  review_note: string | null;
  storagePath: string;
  thumbnailPath: string | null;
  ext: string;
  /** video (primary) + cover + frame/pin/thumb — untuk arch_all & salinan file. */
  assets: DumpAsset[];
}

export function dumpDirName(date = new Date()): string {
  const ts = date.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return `dump_${ts}`;
}

/** Parse teks bebas review karakter → { en, game }. Contoh: "Raiden Shogun (Genshin)". */
export function parseCharacterName(raw: string): { en: string; game: string | null } {
  let s = raw.trim();
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  if (!s) return { en: "", game: null };

  // Bentuk "Nama (Game)" / "Nama（Game）".
  const paren = s.match(/^(.+?)\s*[\(\uff08（]\s*(.+?)\s*[\)\uff09）]\s*$/u);
  if (paren && paren[1].trim() && paren[2].trim()) {
    return { en: paren[1].trim(), game: paren[2].trim() };
  }

  // Bentuk "Nama - Game" / "Nama — Game" / "Nama / Game".
  const sep = s.match(/^(.+?)\s*[-–—/]\s*(.+)$/u);
  if (sep && sep[1].trim() && sep[2].trim()) {
    return { en: sep[1].trim(), game: sep[2].trim() };
  }

  return { en: s, game: null };
}

/** Sanitasi nama file agar aman untuk filesystem. */
function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "item";
}

function douyinUrlFor(contentId: string | null): string | null {
  if (!contentId) return null;
  // ID Douyin = 15-25 digit; hanya bentuk seperti itu yang valid sebagai URL video.
  if (/^\d{15,25}$/.test(contentId)) return `https://www.douyin.com/video/${contentId}`;
  return null;
}

const PRIMARY_ROLE_ORDER = ["video", "cover", "thumb", "pin", "frame"] as const;

function roleRank(role: string): number {
  const idx = (PRIMARY_ROLE_ORDER as readonly string[]).indexOf(role);
  return idx === -1 ? PRIMARY_ROLE_ORDER.length : idx;
}

async function collectItems(): Promise<DumpItem[]> {
  const media = await db.prisma.media.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ createdAt: "asc" }, { index: "asc" }],
    include: {
      agent: { select: { name: true } },
      tags: { include: { tag: true } },
    },
  });

  // Kelompokkan per CID — satu baris `contents` per CID, bukan per aset.
  const groups = new Map<string, typeof media>();
  for (const m of media) {
    const cid = m.contentId?.trim() || m.id;
    const list = groups.get(cid);
    if (list) list.push(m);
    else groups.set(cid, [m]);
  }

  const items: DumpItem[] = [];
  for (const [content_id, rows] of groups) {
    // Primary: video index 0, lalu cover, lalu role lain; fallback baris pertama.
    const primary =
      [...rows].sort((a, b) => {
        const byRole = roleRank(a.role) - roleRank(b.role);
        return byRole !== 0 ? byRole : a.index - b.index;
      })[0] ?? rows[0];

    // Nama karakter/game bisa saja hanya terisi pada aset tertentu.
    const characterRow = rows.find((m) => m.characterName) ?? primary;
    let character_en: string | null = null;
    let game: string | null = null;
    if (characterRow.characterName) {
      const parsed = parseCharacterName(characterRow.characterName);
      character_en = parsed.en || null;
      game = parsed.game;
    }

    const assets: DumpAsset[] = rows.map((m) => ({
      role: m.role,
      index: m.index,
      wvr_id: m.id,
      media_type: (m.mediaType === "VIDEO" ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO",
      title: m.title || m.originalFileName,
      width: m.width,
      height: m.height,
      duration_ms: m.durationSeconds != null ? Math.round(m.durationSeconds * 1000) : null,
      storagePath: m.storagePath,
      thumbnailPath: m.thumbnailPath,
      ext: path.extname(m.originalFileName || m.storagePath || "") || "",
    }));

    items.push({
      content_id,
      wvr_id: primary.id,
      douyin_url: douyinUrlFor(primary.contentId?.trim() || null),
      title: primary.title || primary.originalFileName,
      description: primary.description,
      tags: primary.tags.map((t) => t.tag.name),
      media_type: (primary.mediaType === "VIDEO" ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO",
      duration_ms:
        primary.durationSeconds != null ? Math.round(primary.durationSeconds * 1000) : null,
      height: primary.height,
      width: primary.width,
      agent: primary.agent?.name ?? null,
      created_at: primary.createdAt.toISOString(),
      character_en,
      game,
      review_note: primary.reviewNote,
      storagePath: primary.storagePath,
      thumbnailPath: primary.thumbnailPath,
      ext: path.extname(primary.originalFileName || primary.storagePath || "") || "",
      assets,
    });
  }

  return items;
}

// --- pembangun artefak --------------------------------------------------------

function sqlStr(v: string | null): string {
  if (v === null) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function sqlInt(v: number | null): string {
  return v === null ? "NULL" : String(v);
}

const CONTENTS_COLS = [
  "content_id",
  "douyin_url",
  "title_original",
  "title_en",
  "duration_ms",
  "game_raw",
  "character_raw",
  "creator_raw",
  "creator",
  "fetched_at",
  "created_at",
  "updated_at",
] as const;

const CONTENTS_DDL = `CREATE TABLE IF NOT EXISTS "contents" (
    "content_id" TEXT PRIMARY KEY,
    "douyin_url" TEXT,
    "title_original" TEXT,
    "title_en" TEXT,
    "duration_ms" INTEGER,
    "game_raw" TEXT,
    "character_raw" TEXT,
    "creator_raw" TEXT,
    "game_id" INTEGER,
    "character_id" INTEGER,
    "creator" TEXT,
    "fetched_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    "updated_at" TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);`;

function buildContentsSql(items: DumpItem[], createdAt: string): string {
  const header = [
    "-- =============================================================================",
    "--  nextgen_cosplay.sql — handoff dari featherduster (web-vid-review)",
    `--  Dibuat         : ${createdAt}`,
    `--  Jumlah baris   : ${items.length} media APPROVED`,
    "--",
    "--  Cara pakai di pipeline (nextgen_cosplay_pipeline):",
    "--    sqlite3 data/nextgen_cosplay.db < nextgen_cosplay.sql",
    "--  Tabel dibuat dengan IF NOT EXISTS dan INSERT memakai ON CONFLICT(content_id)",
    "--  sehingga bisa diimpor berulang tanpa duplikat.",
    "-- =============================================================================",
    "",
    CONTENTS_DDL,
    "",
  ].join("\n");

  const colList = CONTENTS_COLS.map((c) => `"${c}"`).join(", ");
  const rows: string[] = [];
  for (const it of items) {
    const now = createdAt;
    const values = [
      sqlStr(it.content_id),
      sqlStr(it.douyin_url),
      sqlStr(it.title),
      "NULL", // title_en — pipeline yang menerjemahkan
      sqlInt(it.duration_ms),
      sqlStr(it.game),
      sqlStr(it.character_en),
      "NULL", // creator_raw — asal Douyin, tidak dilacak staging
      "NULL", // creator
      sqlStr(it.created_at),
      sqlStr(now),
      sqlStr(now),
    ].join(", ");
    rows.push(
      `INSERT INTO "contents" (${colList}) VALUES (${values})\n` +
        `ON CONFLICT("content_id") DO UPDATE SET\n` +
        `  "douyin_url"=excluded."douyin_url","title_original"=excluded."title_original",` +
        `"title_en"=excluded."title_en","duration_ms"=excluded."duration_ms",` +
        `"game_raw"=excluded."game_raw","character_raw"=excluded."character_raw",` +
        `"creator_raw"=excluded."creator_raw","creator"=excluded."creator",` +
        `"fetched_at"=excluded."fetched_at","updated_at"=excluded."updated_at";`
    );
  }
  return header + (rows.length ? rows.join("\n\n") + "\n" : "");
}

function buildArchAll(items: DumpItem[]): object {
  const archItems = items.map((it) => ({
    content_id: it.content_id,
    title: it.title,
    tags: it.tags,
    author: { nickname: null }, // creator Douyin tidak dilacak staging
    created_at: it.created_at,
    duration_ms: it.duration_ms,
    web_url: it.douyin_url,
    statistics: {}, // engagement tidak tersedia di staging
    height: it.height,
    width: it.width,
    // ekstensi featherduster (diabaikan pipeline, berguna untuk audit manusia)
    wvr_id: it.wvr_id,
    agent: it.agent,
    media_type: it.media_type,
    character_name: it.character_en,
    game_name: it.game,
    review_note: it.review_note,
    asset_count: it.assets.length,
    // Bundle multi-aset: pipeline memakai entry utama; aset lain untuk audit/handoff.
    assets: it.assets.map((a) => ({
      role: a.role,
      index: a.index,
      wvr_id: a.wvr_id,
      media_type: a.media_type,
      width: a.width,
      height: a.height,
      duration_ms: a.duration_ms,
    })),
  }));
  return { items: archItems };
}

function buildCidOverrides(items: DumpItem[], createdAt: string): object {
  const overrides: Record<string, Record<string, string | null>> = {};
  for (const it of items) {
    if (!it.character_en) continue;
    overrides[it.content_id] = {
      en: it.character_en,
      game: it.game,
      cn: null,
      note: it.review_note ?? `review featherduster ${createdAt.slice(0, 10)}`,
    };
  }
  return {
    _meta: {
      source: "featherduster",
      generated_at: createdAt,
      description: "Merge isi `cid_overrides` ini ke data/characters.json pipeline.",
    },
    cid_overrides: overrides,
  };
}

// --- operasi utama ------------------------------------------------------------

/** Buat dump baru. Mengembalikan info dump (path di disk). */
export async function createDump(opts: DumpOptions = {}): Promise<DumpInfo> {
  const { includeFiles = false, notes } = opts;
  await fs.mkdir(DUMPS_ROOT, { recursive: true });

  const items = await collectItems();
  const createdAt = new Date().toISOString();
  const id = dumpDirName(new Date(createdAt));
  const dumpDir = path.join(DUMPS_ROOT, id);
  await fs.mkdir(dumpDir, { recursive: true });

  // 1. SQL
  await fs.writeFile(path.join(dumpDir, "nextgen_cosplay.sql"), buildContentsSql(items, createdAt), "utf8");
  // 2. arch_all.json
  await fs.writeFile(path.join(dumpDir, "arch_all.json"), JSON.stringify(buildArchAll(items), null, 2), "utf8");
  // 3. cid_overrides.json
  await fs.writeFile(path.join(dumpDir, "cid_overrides.json"), JSON.stringify(buildCidOverrides(items, createdAt), null, 2), "utf8");

  // 4. Salin file fisik (opsional) — semua aset bundle.
  let fileCount = 0;
  if (includeFiles) {
    const mediaDir = path.join(dumpDir, "media");
    await fs.mkdir(mediaDir, { recursive: true });
    for (const it of items) {
      for (const asset of it.assets) {
        const suffix =
          asset.role === "video" && asset.index === 0
            ? ""
            : `__${safeName(asset.role)}${asset.index ? `_${asset.index}` : ""}`;
        const dst = path.join(mediaDir, `${safeName(it.content_id)}${suffix}${asset.ext}`);
        try {
          const src = resolveStoredPath(asset.storagePath);
          await fs.copyFile(src, dst);
          fileCount++;
        } catch {
          // file sumber hilang — lewati, tetap dicatat di manifest
        }
      }
    }
  }

  // 5. Manifest
  const characterCount = items.filter((it) => it.character_en).length;
  const assetCount = items.reduce((sum, it) => sum + it.assets.length, 0);
  const manifest = {
    type: "wvr-dump.json",
    id,
    createdAt,
    notes: notes ?? null,
    includeFiles,
    counts: {
      total: items.length,
      assets: assetCount,
      characters_reviewed: characterCount,
      videos: items.filter((it) => it.media_type === "VIDEO").length,
      images: items.filter((it) => it.media_type === "IMAGE").length,
      files_copied: fileCount,
    },
    files: ["nextgen_cosplay.sql", "arch_all.json", "cid_overrides.json", ...(includeFiles ? ["media/"] : [])],
    note_dtk_full_dump:
      "dtk_full.dump berasal dari Douyin_TikTok_Download_API (sumber DTK), bukan dari featherduster.",
  };
  await fs.writeFile(path.join(dumpDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const sizeBytes = await dirSize(dumpDir);

  publishEvent({
    type: "media.dumped",
    title: `Dump handoff dibuat (${items.length} media)`,
    message: `${id}${includeFiles ? " + file media" : ""}`,
    payload: { id, count: items.length, fileCount },
  });

  return {
    id,
    path: dumpDir,
    createdAt,
    count: items.length,
    fileCount,
    sizeBytes,
    notes: notes ?? undefined,
    includeFiles,
  };
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(abs);
    else total += (await fs.stat(abs).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

export async function listDumps(): Promise<DumpInfo[]> {
  try {
    const entries = await fs.readdir(DUMPS_ROOT);
    const infos: DumpInfo[] = [];
    for (const name of entries) {
      if (!name.startsWith("dump_")) continue;
      const abs = path.join(DUMPS_ROOT, name);
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const manifest = await fs
        .readFile(path.join(abs, "manifest.json"), "utf8")
        .then((r) => JSON.parse(r))
        .catch(() => null);
      infos.push({
        id: name,
        path: abs,
        createdAt: manifest?.createdAt ?? stat.mtime.toISOString(),
        count: manifest?.counts?.total ?? 0,
        fileCount: manifest?.counts?.files_copied ?? 0,
        sizeBytes: await dirSize(abs),
        notes: manifest?.notes ?? undefined,
        includeFiles: Boolean(manifest?.includeFiles),
      });
    }
    return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function dumpPath(name: string): string {
  if (!/^dump_[\w-]+$/.test(name)) throw new Error("Invalid dump folder name");
  return path.join(DUMPS_ROOT, name);
}

export async function deleteDump(name: string): Promise<void> {
  await fs.rm(dumpPath(name), { recursive: true, force: true });
}