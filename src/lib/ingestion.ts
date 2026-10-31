import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { ensureUploadDirs, monthBucketDir, UPLOADS_ROOT } from "@/lib/paths";
import { publishEvent } from "@/lib/events";
import { detectSensitive, generateAutoTags } from "@/services/intelligence";
import { normalizeIndex, normalizeRole } from "@/lib/media-role";
import { checkFileSignature } from "@/lib/file-signature";
import {
  detectMediaType,
  extensionOf,
  lookupMime,
  processMedia,
} from "@/lib/media";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

export interface IngestInput {
  buffer?: Buffer;
  sourceUrl?: string;
  sourcePath?: string;
  base64?: string;
  fileName?: string;
  title: string;
  description?: string;
  tags?: string[];
  prompt?: string;
  negativePrompt?: string;
  transcript?: string;
  agentId?: string | null;
  /** Kode identifikasi (CID) dari pipeline/DTK — kunci dedup utama. */
  contentId?: string | null;
  /** Peran aset dalam satu CID (video|cover|frame|pin|thumb). */
  role?: string;
  /** Urutan frame/pin; 0 untuk video/cover. */
  index?: number;
  characterName?: string | null;
  characterCandidates?: string[];
  game?: string | null;
  creatorName?: string | null;
  creatorSecUid?: string | null;
  sourceUrlMeta?: string | null;
  sourcePlatform?: string | null;
  playlistId?: string | null;
  pinterestBoard?: string | null;
  visionVerdict?: string | null;
  pipelineStage?: string | null;
  externalRefs?: Record<string, unknown> | null;
  publishedAt?: Date | null;
  phash?: string | null;
  /** Bila true, media masuk antrean review karakter (status PENDING_REVIEW). */
  needsCharacterReview?: boolean;
  /** Status default untuk media baru (default APPROVED). */
  defaultStatus?: "APPROVED" | "PENDING_REVIEW";
  /** Aktor untuk audit (default SYSTEM). */
  actorName?: string | null;
}

export interface IngestResult {
  mediaId: string;
  duplicateOf?: string;
  role: string;
  index: number;
  status: string;
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(-180) || "unnamed";
}

async function downloadFromUrl(
  url: string,
  maxBytes: number
): Promise<{ buffer: Buffer; fileName: string; mimeType: string | null }> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const lengthHeader = res.headers.get("content-length");
  if (lengthHeader && parseInt(lengthHeader, 10) > maxBytes) {
    throw new Error(`Remote file exceeds limit of ${maxBytes} bytes`);
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Remote file exceeds limit of ${maxBytes} bytes`);
  }
  const urlName = decodeURIComponent(path.basename(parsed.pathname)) || "download";
  return {
    buffer,
    fileName: urlName,
    mimeType: res.headers.get("content-type"),
  };
}

export async function ingestMedia(input: IngestInput): Promise<IngestResult> {
  await ensureUploadDirs();
  const contentId = input.contentId?.trim() || null;
  const role = normalizeRole(input.role);
  const index = normalizeIndex(input.index);

  // 1. Obtain the raw bytes from one of the supported sources.
  let buffer: Buffer;
  let fileName: string;
  let remoteMime: string | null = null;

  if (input.buffer) {
    buffer = input.buffer;
    fileName = input.fileName ?? "upload.bin";
  } else if (input.base64) {
    buffer = Buffer.from(input.base64, "base64");
    fileName = input.fileName ?? "upload.bin";
  } else if (input.sourceUrl) {
    const dl = await downloadFromUrl(input.sourceUrl, MAX_UPLOAD_BYTES);
    buffer = dl.buffer;
    fileName = input.fileName ?? dl.fileName;
    remoteMime = dl.mimeType;
  } else if (input.sourcePath) {
    const abs = path.resolve(input.sourcePath);
    const stat = await fs.stat(abs);
    if (!stat.isFile()) throw new Error("sourcePath is not a file");
    if (stat.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File exceeds limit of ${MAX_UPLOAD_BYTES} bytes`);
    }
    buffer = await fs.readFile(abs);
    fileName = input.fileName ?? path.basename(abs);
  } else {
    throw new Error("No media source provided (use buffer, base64, sourceUrl, or sourcePath)");
  }

  if (buffer.byteLength === 0) throw new Error("Empty file");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds limit of ${MAX_UPLOAD_BYTES} bytes`);
  }

  // 2. Validate the media type.
  fileName = sanitizeFileName(fileName);
  const mimeType = remoteMime ?? lookupMime(fileName);
  const mediaType = detectMediaType(fileName, mimeType);
  if (!mediaType) {
    throw new Error(
      "Unsupported media format. Allowed images: jpg, png, gif, webp, avif; videos: mp4, webm, mov, mkv, avi"
    );
  }

  // 2b. Validasi magic bytes — isi file harus sesuai ekstensinya.
  const signature = checkFileSignature(buffer, extensionOf(fileName));
  if (!signature.valid) {
    throw new Error(signature.reason ?? "Isi file tidak sesuai dengan formatnya");
  }

  // 3. Dedup — L1: (contentId, role, index) adalah kunci utama.
  //    L2 (SHA-256) hanya dipakai bila tidak ada CID, agar role berbeda tidak saling menabrak.
  const fileHash = sha256(buffer);

  if (contentId) {
    const byKey = await db.prisma.media.findUnique({
      where: { contentId_role_index: { contentId, role, index } },
    });
    if (byKey) {
      return {
        mediaId: byKey.id,
        duplicateOf: byKey.id,
        role: byKey.role,
        index: byKey.index,
        status: byKey.status,
      };
    }
  } else {
    const existing = await db.prisma.media.findFirst({ where: { fileHash } });
    if (existing) {
      return {
        mediaId: existing.id,
        duplicateOf: existing.id,
        role: existing.role,
        index: existing.index,
        status: existing.status,
      };
    }
  }

  // 4. Persist the original file.
  const ext = extensionOf(fileName) || (mediaType === "IMAGE" ? "bin" : "mp4");
  const id = crypto.randomUUID();
  const baseDir = mediaType === "VIDEO" ? "videos" : "images";
  const bucketDir = await monthBucketDir(path.join(UPLOADS_ROOT, baseDir));
  const storedName = `${id}.${ext}`;
  const absOriginal = path.join(bucketDir, storedName);
  await fs.writeFile(absOriginal, buffer);
  const storagePath = path.posix.join(baseDir, path.basename(bucketDir), storedName);

  // 5. Generate thumbnail + metadata in the background-friendly step.
  const thumbnailAbs = path.join(UPLOADS_ROOT, "thumbnails", `${id}.webp`);
  let width: number | undefined;
  let height: number | undefined;
  let durationSeconds: number | undefined;
  let hasAudio = false;
  let thumbnailPath: string | null = null;

  try {
    const processed = await processMedia(mediaType, absOriginal, thumbnailAbs);
    width = processed.width;
    height = processed.height;
    durationSeconds = processed.durationSeconds;
    hasAudio = processed.hasAudio ?? false;
    thumbnailPath = processed.thumbnailPath
      ? path.posix.join("thumbnails", path.basename(processed.thumbnailPath))
      : null;
  } catch (err) {
    console.error("[ingestion] media processing failed:", err);
  }

  // 6. Smart intelligence: auto-tagging + deteksi konten sensitif.
  let autoTags: string[] = [];
  if (process.env.AUTO_TAG !== "false") {
    try {
      autoTags = await generateAutoTags({
        mediaType,
        width,
        height,
        durationSeconds,
        hasAudio,
        thumbPath: thumbnailPath
          ? path.join(UPLOADS_ROOT, thumbnailPath)
          : null,
        prompt: input.prompt,
        title: input.title,
        description: input.description,
      });
    } catch (err) {
      console.error("[ingestion] auto-tagging failed:", err);
    }
  }

  const sensitive = detectSensitive([
    input.title,
    input.description,
    input.prompt,
    input.negativePrompt,
    fileName,
  ]);

  // 7. Persist tags (gabungan tag manual + auto-tag).
  const tagNames = Array.from(
    new Set(
      [...(input.tags ?? []), ...autoTags]
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 64)
    )
  ).slice(0, 24);

  const status =
    input.needsCharacterReview || sensitive
      ? "PENDING_REVIEW"
      : (input.defaultStatus ?? "APPROVED");
  const pipelineStage =
    input.pipelineStage ?? (status === "APPROVED" ? "gated" : "intake");

  const media = await db.prisma.media.create({
    data: {
      id,
      contentId,
      role,
      index,
      title: input.title.slice(0, 300),
      description: input.description?.slice(0, 4000) ?? null,
      mediaType,
      status,
      reviewKind: input.needsCharacterReview ? "CHARACTER" : null,
      characterName: input.characterName?.trim().slice(0, 200) || null,
      characterCandidates: input.characterCandidates?.length
        ? JSON.stringify(input.characterCandidates.slice(0, 20))
        : null,
      game: input.game?.trim().slice(0, 120) || null,
      creatorName: input.creatorName?.trim().slice(0, 200) || null,
      creatorSecUid: input.creatorSecUid?.trim().slice(0, 200) || null,
      sourceUrl: input.sourceUrlMeta?.slice(0, 1000) || input.sourceUrl || null,
      sourcePlatform: input.sourcePlatform?.slice(0, 40) || null,
      playlistId: input.playlistId?.slice(0, 100) || null,
      pinterestBoard: input.pinterestBoard?.slice(0, 200) || null,
      visionVerdict: input.visionVerdict?.slice(0, 40) || null,
      pipelineStage,
      externalRefs: input.externalRefs ? JSON.stringify(input.externalRefs) : null,
      publishedAt: input.publishedAt ?? null,
      phash: input.phash?.slice(0, 100) || null,
      nsfwFlag: sensitive,
      originalFileName: fileName,
      storagePath,
      thumbnailPath,
      mimeType,
      sizeBytes: BigInt(buffer.byteLength),
      durationSeconds,
      width,
      height,
      hasAudio,
      autoTagged: autoTags.length > 0,
      transcript: input.transcript?.slice(0, 20000) ?? null,
      fileHash,
      prompt: input.prompt?.slice(0, 8000) ?? null,
      negativePrompt: input.negativePrompt?.slice(0, 4000) ?? null,
      agentId: input.agentId ?? null,
      tags: {
        create: tagNames.map((name) => ({
          tag: {
            connectOrCreate: { where: { name }, create: { name } },
          },
        })),
      },
    },
  });

  await db.prisma.mediaAudit.create({
    data: {
      mediaId: media.id,
      action: "created",
      toStatus: status,
      actorType: input.agentId ? "AGENT" : "SYSTEM",
      actorName: input.actorName ?? null,
      agentId: input.agentId ?? null,
      note: contentId ? `CID ${contentId} · ${role}#${index}` : null,
    },
  });

  publishEvent({
    type: "media.uploaded",
    title: `Media baru: ${media.title.slice(0, 60)}`,
    message: `${media.mediaType === "VIDEO" ? "Video" : "Foto"} baru ditambahkan ke galeri`,
    payload: { mediaId: media.id, mediaType: media.mediaType, contentId, role, index },
  });

  return { mediaId: media.id, role, index, status };
}
