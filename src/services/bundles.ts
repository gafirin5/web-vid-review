import { db } from "@/db/client";
import { ingestMedia } from "@/lib/ingestion";
import { isMediaRole, type MediaRole } from "@/lib/media-role";

/**
 * Bundle = satu CID dengan beberapa aset (video + cover + frame + pin).
 * Idempotensi dijamin oleh unique (contentId, role, index).
 */

export interface BundleFile {
  role: MediaRole;
  index: number;
  buffer: Buffer;
  fileName: string;
}

export interface BundleManifest {
  contentId: string;
  title?: string;
  description?: string;
  tags?: string[];
  character?: string | null;
  game?: string | null;
  characterCandidates?: string[];
  creator?: { name?: string; secUid?: string };
  sourceUrl?: string;
  sourcePlatform?: string;
  visionVerdict?: string;
  playlistId?: string;
  pinterestBoard?: string;
  needsCharacterReview?: boolean;
  prompt?: string;
  negativePrompt?: string;
}

export interface BundleItemResult {
  role: string;
  index: number;
  mediaId: string | null;
  status: string | null;
  duplicate: boolean;
  error?: string;
}

export interface BundleResult {
  contentId: string;
  bundleId: string;
  duplicate: boolean;
  created: number;
  items: BundleItemResult[];
}

export function normalizeManifest(raw: unknown): BundleManifest {
  const m = (raw ?? {}) as Record<string, unknown>;
  const contentId = String(m.content_id ?? m.contentId ?? "").trim();
  if (!contentId) throw new Error("manifest.content_id wajib diisi");

  const creator = (m.creator ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(m.character_candidates)
    ? m.character_candidates.map(String)
    : Array.isArray(m.characterCandidates)
      ? m.characterCandidates.map(String)
      : undefined;

  return {
    contentId,
    title: typeof m.title === "string" ? m.title : undefined,
    description: typeof m.description === "string" ? m.description : undefined,
    tags: Array.isArray(m.tags) ? m.tags.map(String) : undefined,
    character:
      typeof m.character === "string"
        ? m.character
        : typeof m.characterName === "string"
          ? m.characterName
          : null,
    game: typeof m.game === "string" ? m.game : null,
    characterCandidates: candidates,
    creator: {
      name: typeof creator.name === "string" ? creator.name : undefined,
      secUid:
        typeof creator.sec_uid === "string"
          ? creator.sec_uid
          : typeof creator.secUid === "string"
            ? creator.secUid
            : undefined,
    },
    sourceUrl: typeof m.source_url === "string" ? m.source_url : undefined,
    sourcePlatform: typeof m.source_platform === "string" ? m.source_platform : undefined,
    visionVerdict: typeof m.vision_verdict === "string" ? m.vision_verdict : undefined,
    playlistId: typeof m.playlist_id === "string" ? m.playlist_id : undefined,
    pinterestBoard: typeof m.pinterest_board === "string" ? m.pinterest_board : undefined,
    needsCharacterReview: m.needs_character_review === true,
    prompt: typeof m.prompt === "string" ? m.prompt : undefined,
    negativePrompt: typeof m.negative_prompt === "string" ? m.negative_prompt : undefined,
  };
}

/** Simpan seluruh aset bundle secara idempoten. */
export async function createBundle(
  manifest: BundleManifest,
  files: BundleFile[],
  opts: { agentId?: string | null; actorName?: string | null } = {}
): Promise<BundleResult> {
  if (files.length === 0) throw new Error("Bundle harus berisi minimal 1 file");
  const seen = new Set<string>();
  for (const f of files) {
    if (!isMediaRole(f.role)) throw new Error(`Role tidak valid: ${f.role}`);
    const key = `${f.role}#${f.index}`;
    if (seen.has(key)) throw new Error(`Duplikat role/index dalam bundle: ${key}`);
    seen.add(key);
  }

  const items: BundleItemResult[] = [];
  let created = 0;

  for (const file of files) {
    const existing = await db.prisma.media.findUnique({
      where: {
        contentId_role_index: {
          contentId: manifest.contentId,
          role: file.role,
          index: file.index,
        },
      },
    });
    if (existing) {
      items.push({
        role: file.role,
        index: file.index,
        mediaId: existing.id,
        status: existing.status,
        duplicate: true,
      });
      continue;
    }

    const label =
      file.role === "video"
        ? "video"
        : file.role === "cover"
          ? "cover"
          : `${file.role} ${file.index}`;

    try {
      const result = await ingestMedia({
        buffer: file.buffer,
        fileName: file.fileName,
        title: manifest.title?.trim() || `${manifest.contentId} — ${label}`,
        description: manifest.description,
        tags: manifest.tags,
        prompt: manifest.prompt,
        negativePrompt: manifest.negativePrompt,
        agentId: opts.agentId ?? null,
        actorName: opts.actorName ?? null,
        contentId: manifest.contentId,
        role: file.role,
        index: file.index,
        characterName: manifest.character,
        characterCandidates: manifest.characterCandidates,
        game: manifest.game,
        creatorName: manifest.creator?.name,
        creatorSecUid: manifest.creator?.secUid,
        sourceUrlMeta: manifest.sourceUrl,
        sourcePlatform: manifest.sourcePlatform,
        playlistId: manifest.playlistId,
        pinterestBoard: manifest.pinterestBoard,
        visionVerdict: manifest.visionVerdict,
        needsCharacterReview: manifest.needsCharacterReview,
      });
      created += 1;
      items.push({
        role: file.role,
        index: file.index,
        mediaId: result.mediaId,
        status: result.status,
        duplicate: Boolean(result.duplicateOf),
      });
    } catch (err: unknown) {
      items.push({
        role: file.role,
        index: file.index,
        mediaId: null,
        status: null,
        duplicate: false,
        error: err instanceof Error ? err.message : "Gagal menyimpan aset",
      });
    }
  }

  if (created === 0 && items.every((i) => i.error)) {
    throw new Error(items.map((i) => `${i.role}#${i.index}: ${i.error}`).join("; "));
  }

  return {
    contentId: manifest.contentId,
    bundleId: manifest.contentId,
    duplicate: created === 0,
    created,
    items,
  };
}

export interface BundleView {
  contentId: string;
  count: number;
  roles: {
    video: unknown[];
    cover: unknown[];
    frames: unknown[];
    pins: unknown[];
    thumbs: unknown[];
  };
  items: unknown[];
}

/** Ambil semua aset satu CID, dikelompokkan per role. */
export async function getBundle(contentId: string): Promise<BundleView | null> {
  const items = await db.prisma.media.findMany({
    where: { contentId },
    orderBy: [{ role: "asc" }, { index: "asc" }],
    include: {
      agent: { select: { id: true, name: true, modelProvider: true } },
      tags: { include: { tag: true } },
    },
  });
  if (items.length === 0) return null;

  return {
    contentId,
    count: items.length,
    roles: {
      video: items.filter((m) => m.role === "video"),
      cover: items.filter((m) => m.role === "cover"),
      frames: items.filter((m) => m.role === "frame"),
      pins: items.filter((m) => m.role === "pin"),
      thumbs: items.filter((m) => m.role === "thumb"),
    },
    items,
  };
}

/** Catat externalRefs (YouTube/Pinterest/TikTok/Zernio) untuk seluruh aset CID. */
export async function setPublishRefs(
  contentId: string,
  refs: Record<string, unknown>
): Promise<{ contentId: string; updated: number; externalRefs: Record<string, unknown> }> {
  const items = await db.prisma.media.findMany({ where: { contentId } });
  if (items.length === 0) throw new Error("CID tidak ditemukan");

  // Merge dengan refs yang sudah ada (ambil yang paling lengkap).
  let merged: Record<string, unknown> = {};
  for (const m of items) {
    if (!m.externalRefs) continue;
    try {
      merged = { ...merged, ...(JSON.parse(m.externalRefs) as Record<string, unknown>) };
    } catch {
      /* abaikan JSON rusak */
    }
  }
  merged = { ...merged, ...refs };

  const now = new Date();
  const hasRef = Object.values(refs).some((v) => v !== null && v !== undefined && v !== "");
  await db.prisma.media.updateMany({
    where: { contentId },
    data: {
      externalRefs: JSON.stringify(merged),
      publishedAt: hasRef ? now : undefined,
      pipelineStage: hasRef ? "published" : "scheduled",
    },
  });

  return { contentId, updated: items.length, externalRefs: merged };
}
