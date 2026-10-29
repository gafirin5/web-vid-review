import { statfs } from "node:fs/promises";
import os from "node:os";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db/client";
import { ingestMedia } from "@/lib/ingestion";
import { findOrCreateAgentByName } from "@/lib/agent-auth";
import { UPLOADS_ROOT, ensureUploadDirs } from "@/lib/paths";
import { createBackup, listBackups } from "@/services/backup";
import { searchMedia as relevanceSearch } from "@/services/search";
import { compareStats as compareMediaStats } from "@/services/votes";
import { deleteMediaWithFiles, setMediaTags } from "@/services/media-ops";
import { formatBytes, formatDuration, jsonReplacer } from "@/lib/http";
import { publishEvent } from "@/lib/events";

export const SERVER_NAME = "web-vid-review";
export const SERVER_VERSION = "1.1.0";

function mediaUrl(id: string): string {
  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  return `${base}/media/${id}`;
}

function serializeMedia(m: unknown): unknown {
  return JSON.parse(JSON.stringify(m, jsonReplacer));
}

/**
 * Builds the MCP server exposing media-gallery tools to AI agents.
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Media gallery for AI agents. Upload generated videos/photos, browse the collection, " +
        "inspect metadata & prompts, and submit reviews. Use upload_media to add media from a " +
        "URL, local file path, or base64 payload. Use get_system_metrics to check disk space " +
        "before uploading large batches.",
    }
  );

  server.registerTool(
    "upload_media",
    {
      title: "Upload media",
      description:
        "Upload a photo or video to the gallery. Sources: source_url (http/https download), " +
        "source_path (absolute path on the server's machine), or base64 (inline payload).",
      inputSchema: {
        source_type: z.enum(["url", "file_path", "base64"]).describe("Where the media comes from"),
        source: z.string().describe("The URL, absolute file path, or base64 string"),
        file_name: z.string().optional().describe("Optional file name with extension (required for base64)"),
        title: z.string().describe("Title of the media"),
        description: z.string().optional().describe("Description of the media"),
        tags: z.array(z.string()).optional().describe("List of tags, e.g. ['cinematic', '3d']"),
        media_type: z.enum(["image", "video", "auto"]).optional().default("auto"),
        prompt_used: z.string().optional().describe("The prompt used to generate this media"),
        negative_prompt: z.string().optional().describe("Negative prompt used"),
        transcript: z.string().optional().describe("Optional transcript/caption of spoken content (for videos)"),
        agent_name: z
          .string()
          .optional()
          .describe("Agent identity (auto-created if new). Defaults to 'MCP Agent'."),
        content_id: z
          .string()
          .optional()
          .describe("Content ID (CID) from the pipeline/DTK — dedup key and lookup code"),
        needs_character_review: z
          .boolean()
          .optional()
          .describe("Set true if unsure which game character this media depicts (goes to review queue)"),
      },
    },
    async (args) => {
      let result;
      try {
        const identity = await findOrCreateAgentByName(args.agent_name ?? "MCP Agent");
        const source =
          args.source_type === "url"
            ? { sourceUrl: args.source }
            : args.source_type === "file_path"
              ? { sourcePath: args.source }
              : { base64: args.source };
        result = await ingestMedia({
          ...source,
          fileName: args.file_name,
          title: args.title,
          description: args.description,
          tags: args.tags,
          prompt: args.prompt_used,
          negativePrompt: args.negative_prompt,
          transcript: args.transcript,
          contentId: args.content_id,
          needsCharacterReview: args.needs_character_review === true,
          agentId: identity.id,
        });
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Upload failed: ${err instanceof Error ? err.message : String(err)}` },
          ],
        };
      }

      const media = await db.prisma.media.findUnique({
        where: { id: result.mediaId },
        include: { agent: { select: { name: true } }, tags: { include: { tag: true } } },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: result.mediaId,
                content_id: media?.contentId ?? null,
                duplicate: Boolean(result.duplicateOf),
                note: result.duplicateOf
                  ? "Identical content (matching content_id or SHA-256 hash) already exists in the gallery."
                  : "Upload successful.",
                url: mediaUrl(result.mediaId),
                media_type: media?.mediaType,
                size_bytes: media?.sizeBytes?.toString(),
                tags: media?.tags.map((t) => t.tag.name),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "list_media",
    {
      title: "List recent media",
      description: "List the most recent media in the gallery.",
      inputSchema: {
        media_type: z.enum(["image", "video"]).optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional().default(10),
      },
    },
    async (args) => {
      const items = await db.prisma.media.findMany({
        where: {
          ...(args.media_type ? { mediaType: args.media_type.toUpperCase() } : {}),
          ...(args.tag ? { tags: { some: { tag: { name: args.tag.toLowerCase() } } } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: args.limit ?? 10,
        include: { tags: { include: { tag: true } } },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              items.map((m) => ({
                id: m.id,
                title: m.title,
                media_type: m.mediaType,
                created_at: m.createdAt.toISOString(),
                tags: m.tags.map((t) => t.tag.name),
                url: mediaUrl(m.id),
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "search_media",
    {
      title: "Search media (relevance)",
      description:
        "Search media by meaning-aware relevance across title, description, prompt, tags and transcript. " +
        "Supports Indonesian/English synonyms.",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().int().min(1).max(50).optional().default(10),
      },
    },
    async (args) => {
      const hits = await relevanceSearch(args.query, { limit: args.limit ?? 10 });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              hits.map((h) => {
                const m = h.media as {
                  id: string;
                  title: string;
                  mediaType: string;
                  tags: Array<{ tag: { name: string } }>;
                };
                return {
                  id: m.id,
                  title: m.title,
                  media_type: m.mediaType,
                  relevance: Number(h.score.toFixed(2)),
                  tags: m.tags.map((t) => t.tag.name),
                  url: mediaUrl(m.id),
                };
              }),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_media_detail",
    {
      title: "Get media details",
      description: "Get full metadata of a media item by ID, including prompt, tags, and reviews.",
      inputSchema: { id: z.string().describe("Media ID (UUID)") },
    },
    async (args) => {
      const media = await db.prisma.media.findUnique({
        where: { id: args.id },
        include: {
          agent: { select: { name: true } },
          tags: { include: { tag: true } },
          reviews: { orderBy: { createdAt: "desc" } },
        },
      });
      if (!media) {
        return { content: [{ type: "text", text: `Media ${args.id} not found.` }], isError: true };
      }
      const data = serializeMedia(media) as Record<string, unknown>;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...data,
                url: mediaUrl(media.id),
                file_url: `${process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/files/${media.storagePath}`,
                reviews: media.reviews.map((r) => ({
                  author: `${r.authorName} (${r.authorType})`,
                  rating: r.rating,
                  comment: r.comment,
                  at_second: r.timestampSeconds,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_review_result",
    {
      title: "Get review result",
      description:
        "Look up the human review result for a media by its content_id (CID) or ID. Returns status, " +
        "the identified game character name, and the reviewer's note. Use this after the owner has " +
        "reviewed a media that was flagged with needs_character_review.",
      inputSchema: {
        code: z.string().describe("Content ID (CID) or media ID (UUID)"),
      },
    },
    async (args) => {
      const key = args.code.trim();
      const media = await db.prisma.media.findFirst({
        where: { OR: [{ contentId: key }, { id: key }] },
      });
      if (!media) {
        return {
          isError: true,
          content: [{ type: "text", text: `Tidak ada media dengan kode ${key}.` }],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: media.id,
                content_id: media.contentId,
                status: media.status,
                review_kind: media.reviewKind,
                character_name: media.characterName,
                review_note: media.reviewNote,
                reviewed_at: media.reviewedAt,
                pending: media.status === "PENDING_REVIEW",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "submit_review",
    {
      title: "Submit a review",
      description: "Rate and review a media item (score 1-10, optional comment, optional video timestamp).",
      inputSchema: {
        media_id: z.string().describe("Media ID (UUID)"),
        rating: z.number().int().min(1).max(10).describe("Score from 1 (bad) to 10 (excellent)"),
        comment: z.string().optional().describe("Review text"),
        timestamp_seconds: z.number().min(0).optional().describe("Video timestamp the comment refers to"),
        reviewer_name: z.string().optional().describe("Name of the reviewing AI agent"),
      },
    },
    async (args) => {
      const media = await db.prisma.media.findUnique({
        where: { id: args.media_id },
        select: { id: true },
      });
      if (!media) {
        return { content: [{ type: "text", text: `Media ${args.media_id} not found.` }], isError: true };
      }
      const review = await db.prisma.review.create({
        data: {
          mediaId: args.media_id,
          authorType: "AI",
          authorName: args.reviewer_name?.slice(0, 120) ?? "MCP Reviewer",
          rating: args.rating,
          comment: args.comment?.slice(0, 4000) ?? null,
          timestampSeconds: args.timestamp_seconds ?? null,
        },
      });
      publishEvent({
        type: "review.submitted",
        title: `Review AI ${args.rating}/10 oleh ${review.authorName}`,
        message: "dikirim via MCP",
        payload: { mediaId: args.media_id, reviewId: review.id, rating: args.rating, authorType: "AI" },
      });
      return {
        content: [
          { type: "text", text: `Review recorded (id: ${review.id}, rating: ${args.rating}/10).` },
        ],
      };
    }
  );

  server.registerTool(
    "get_system_metrics",
    {
      title: "Get system metrics",
      description:
        "Check disk space, media counts, and total data volume. Call this before uploading large batches.",
      inputSchema: {},
    },
    async () => {
      await ensureUploadDirs();
      const [disk, mediaAgg, videoAgg, imageAgg, reviewCount, agentCount, tagCount] =
        await Promise.all([
          statfs(UPLOADS_ROOT).catch(() => null),
          db.prisma.media.aggregate({ _count: true, _sum: { sizeBytes: true, durationSeconds: true } }),
          db.prisma.media.aggregate({ where: { mediaType: "VIDEO" }, _count: true, _sum: { sizeBytes: true, durationSeconds: true } }),
          db.prisma.media.aggregate({ where: { mediaType: "IMAGE" }, _count: true, _sum: { sizeBytes: true } }),
          db.prisma.review.count(),
          db.prisma.agent.count(),
          db.prisma.tag.count(),
        ]);

      const freeBytes = disk ? Number(disk.bavail) * Number(disk.bsize) : null;
      const totalBytes = disk ? Number(disk.blocks) * Number(disk.bsize) : null;
      const usedPct =
        freeBytes != null && totalBytes
          ? ((totalBytes - freeBytes) / totalBytes) * 100
          : null;
      const status =
        usedPct == null ? "UNKNOWN" : usedPct > 90 ? "CRITICAL" : usedPct > 80 ? "WARNING" : "HEALTHY";

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                storage: {
                  disk_total: totalBytes != null ? formatBytes(totalBytes) : null,
                  disk_free: freeBytes != null ? formatBytes(freeBytes) : null,
                  used_percent: usedPct != null ? Number(usedPct.toFixed(1)) : null,
                  status,
                },
                total_media: mediaAgg._count,
                total_media_size: formatBytes(mediaAgg._sum.sizeBytes ?? 0),
                videos: { count: videoAgg._count, total_size: formatBytes(videoAgg._sum.sizeBytes ?? 0), total_duration: formatDuration(videoAgg._sum.durationSeconds ?? 0) },
                images: { count: imageAgg._count, total_size: formatBytes(imageAgg._sum.sizeBytes ?? 0) },
                reviews: reviewCount,
                agents: agentCount,
                tags: tagCount,
                host: os.hostname(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "create_system_backup",
    {
      title: "Create a system backup",
      description:
        "Create a backup archive. Mode 'metadata' saves the database only (fast, small). " +
        "Mode 'full' saves the database plus all media files (larger). " +
        "Run before uploading large batches or before risky operations.",
      inputSchema: {
        mode: z.enum(["metadata", "full"]).optional().default("metadata"),
        notes: z.string().optional().describe("Note describing why this backup was created"),
      },
    },
    async (args) => {
      try {
        const info = await createBackup(args.mode ?? "metadata", args.notes);
        return {
          content: [
            {
              type: "text",
              text: `Backup created: ${info.fileName} (${info.mode}, ${formatBytes(info.sizeBytes)}).`,
            },
          ],
        };
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "get_backup_status",
    {
      title: "Get backup status",
      description:
        "Check the most recent backups and disk space. Use to verify that a backup exists before heavy operations.",
      inputSchema: {},
    },
    async () => {
      const backups = await listBackups();
      const recent = backups.slice(0, 5).map((b) => ({
        file: b.fileName,
        mode: b.mode,
        size: formatBytes(b.sizeBytes),
        created_at: b.createdAt,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_backups: backups.length,
                most_recent: recent[0] ?? null,
                recent,
                note: "Restore is available from the admin panel (/admin/backups) or the REST API.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ===== Media management =====
  server.registerTool(
    "update_media",
    {
      title: "Update media metadata",
      description:
        "Update title, description, tags, prompt or transcript of a media you own (identified by agent_name).",
      inputSchema: {
        media_id: z.string().describe("Media ID"),
        agent_name: z.string().optional().describe("Agent identity (must own the media)"),
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional().describe("Replaces all tags if provided"),
        prompt: z.string().optional(),
        transcript: z.string().optional(),
      },
    },
    async (args) => {
      const media = await db.prisma.media.findUnique({ where: { id: args.media_id } });
      if (!media) {
        return { isError: true, content: [{ type: "text", text: "Media tidak ditemukan." }] };
      }
      const identity = await findOrCreateAgentByName(args.agent_name ?? "MCP Agent");
      if (media.agentId !== identity.id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Media ini bukan milik agent tersebut." }],
        };
      }
      const data: Record<string, unknown> = {};
      if (args.title) data.title = args.title.slice(0, 300);
      if (args.description !== undefined) data.description = args.description.slice(0, 4000);
      if (args.prompt !== undefined) data.prompt = args.prompt.slice(0, 8000);
      if (args.transcript !== undefined) data.transcript = args.transcript.slice(0, 20000);
      if (Object.keys(data).length > 0) {
        await db.prisma.media.update({ where: { id: media.id }, data });
      }
      if (args.tags) await setMediaTags(media.id, args.tags);
      publishEvent({
        type: "media.updated",
        title: `Media diperbarui via MCP: ${(args.title ?? media.title).slice(0, 50)}`,
        payload: { mediaId: media.id },
      });
      return {
        content: [{ type: "text", text: `Media ${media.id} berhasil diperbarui.` }],
      };
    }
  );

  server.registerTool(
    "delete_media",
    {
      title: "Delete media",
      description: "Delete a media you own (also removes its files).",
      inputSchema: {
        media_id: z.string(),
        agent_name: z.string().optional().describe("Agent identity (must own the media)"),
      },
    },
    async (args) => {
      const media = await db.prisma.media.findUnique({ where: { id: args.media_id } });
      if (!media) {
        return { isError: true, content: [{ type: "text", text: "Media tidak ditemukan." }] };
      }
      const identity = await findOrCreateAgentByName(args.agent_name ?? "MCP Agent");
      if (media.agentId !== identity.id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Media ini bukan milik agent tersebut." }],
        };
      }
      const removed = await deleteMediaWithFiles(media.id);
      publishEvent({
        type: "media.deleted",
        title: `Media dihapus via MCP: ${media.title.slice(0, 50)}`,
        payload: { mediaId: media.id },
      });
      return {
        content: [
          {
            type: "text",
            text: `Media dihapus. File: ${removed.length > 0 ? removed.join(", ") : "(tidak ada)"}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "bulk_upload",
    {
      title: "Bulk upload",
      description: "Upload up to 20 media in one call. Each item supports url, file_path or base64.",
      inputSchema: {
        items: z
          .array(
            z.object({
              source_type: z.enum(["url", "file_path", "base64"]),
              source: z.string(),
              file_name: z.string().optional(),
              title: z.string(),
              description: z.string().optional(),
              tags: z.array(z.string()).optional(),
              prompt_used: z.string().optional(),
              transcript: z.string().optional(),
            })
          )
          .min(1)
          .max(20),
        agent_name: z.string().optional(),
      },
    },
    async (args) => {
      const identity = await findOrCreateAgentByName(args.agent_name ?? "MCP Agent");
      const results: Array<Record<string, unknown>> = [];
      for (const [index, item] of args.items.entries()) {
        try {
          const source =
            item.source_type === "url"
              ? { sourceUrl: item.source }
              : item.source_type === "file_path"
                ? { sourcePath: item.source }
                : { base64: item.source };
          const r = await ingestMedia({
            ...source,
            fileName: item.file_name,
            title: item.title,
            description: item.description,
            tags: item.tags,
            prompt: item.prompt_used,
            transcript: item.transcript,
            agentId: identity.id,
          });
          results.push({ index, ok: true, id: r.mediaId, duplicate: Boolean(r.duplicateOf) });
        } catch (err: unknown) {
          results.push({
            index,
            ok: false,
            error: err instanceof Error ? err.message : "gagal",
          });
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "check_duplicate",
    {
      title: "Check duplicate",
      description: "Check whether media with the same SHA-256 hash already exists before uploading.",
      inputSchema: {
        hash: z.string().optional().describe("SHA-256 hex of the file"),
        file_path: z.string().optional().describe("Absolute path to check"),
      },
    },
    async (args) => {
      if (!args.hash && !args.file_path) {
        return {
          isError: true,
          content: [{ type: "text", text: "Kirim 'hash' atau 'file_path'." }],
        };
      }
      let hash = args.hash?.toLowerCase() ?? null;
      if (!hash && args.file_path) {
        const crypto = await import("node:crypto");
        const fs = await import("node:fs/promises");
        const buf = await fs.readFile(args.file_path);
        hash = crypto.createHash("sha256").update(buf).digest("hex");
      }
      const existing = await db.prisma.media.findFirst({
        where: { fileHash: hash! },
        select: { id: true, title: true, mediaType: true, status: true },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ hash, exists: Boolean(existing), media: existing }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "bulk_review",
    {
      title: "Bulk review",
      description: "Submit reviews for multiple media at once (max 50).",
      inputSchema: {
        items: z
          .array(
            z.object({
              media_id: z.string(),
              rating: z.number().int().min(1).max(10),
              comment: z.string().optional(),
              timestamp_seconds: z.number().min(0).optional(),
            })
          )
          .min(1)
          .max(50),
        reviewer_name: z.string().optional(),
      },
    },
    async (args) => {
      const results: Array<Record<string, unknown>> = [];
      for (const [index, item] of args.items.entries()) {
        const media = await db.prisma.media.findUnique({
          where: { id: item.media_id },
          select: { id: true },
        });
        if (!media) {
          results.push({ index, ok: false, error: "media tidak ditemukan" });
          continue;
        }
        const review = await db.prisma.review.create({
          data: {
            mediaId: item.media_id,
            authorType: "AI",
            authorName: (args.reviewer_name ?? "MCP Reviewer").slice(0, 120),
            rating: item.rating,
            comment: item.comment?.slice(0, 4000) ?? null,
            timestampSeconds: item.timestamp_seconds ?? null,
          },
        });
        publishEvent({
          type: "review.submitted",
          title: `Review ${item.rating}/10 oleh ${args.reviewer_name ?? "MCP Reviewer"}`,
          message: "bulk review via MCP",
          payload: { mediaId: item.media_id, reviewId: review.id, rating: item.rating },
        });
        results.push({ index, ok: true, id: review.id });
      }
      return { content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }] };
    }
  );

  // ===== Collections =====
  server.registerTool(
    "create_collection",
    {
      title: "Create collection",
      description: "Create a media collection/album owned by an agent.",
      inputSchema: {
        name: z.string(),
        description: z.string().optional(),
        is_public: z.boolean().optional().default(true),
        agent_name: z.string().optional(),
        media_ids: z.array(z.string()).optional().describe("Optional media to add immediately"),
      },
    },
    async (args) => {
      const identity = await findOrCreateAgentByName(args.agent_name ?? "MCP Agent");
      const base =
        args.name
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "koleksi";
      let slug = base;
      for (let i = 2; i < 100; i++) {
        const exists = await db.prisma.collection.findUnique({ where: { slug } });
        if (!exists) break;
        slug = `${base}-${i}`;
      }
      const collection = await db.prisma.collection.create({
        data: {
          name: args.name.slice(0, 120),
          slug,
          description: args.description?.slice(0, 2000) ?? null,
          isPublic: args.is_public !== false,
          agentId: identity.id,
        },
      });
      let added = 0;
      if (args.media_ids?.length) {
        for (const [i, mediaId] of args.media_ids.slice(0, 50).entries()) {
          const media = await db.prisma.media.findUnique({ where: { id: mediaId } });
          if (!media) continue;
          await db.prisma.collectionItem.create({
            data: { collectionId: collection.id, mediaId, position: i },
          });
          added++;
        }
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { id: collection.id, name: collection.name, slug: collection.slug, added },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "list_collections",
    {
      title: "List collections",
      description: "List public collections with item counts.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional().default(20) },
    },
    async (args) => {
      const collections = await db.prisma.collection.findMany({
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        take: args.limit ?? 20,
        include: { _count: { select: { items: true } }, agent: { select: { name: true } } },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              collections.map((c) => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                items: c._count.items,
                agent: c.agent?.name ?? null,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "add_to_collection",
    {
      title: "Add media to collection",
      description: "Add one or more media to a collection you own.",
      inputSchema: {
        collection_id: z.string().describe("Collection ID or slug"),
        media_ids: z.array(z.string()).min(1).max(50),
        agent_name: z.string().optional(),
      },
    },
    async (args) => {
      const collection = await db.prisma.collection.findFirst({
        where: { OR: [{ id: args.collection_id }, { slug: args.collection_id }] },
      });
      if (!collection) {
        return { isError: true, content: [{ type: "text", text: "Koleksi tidak ditemukan." }] };
      }
      const identity = await findOrCreateAgentByName(args.agent_name ?? "MCP Agent");
      if (collection.agentId !== identity.id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Koleksi bukan milik agent tersebut." }],
        };
      }
      const count = await db.prisma.collectionItem.count({
        where: { collectionId: collection.id },
      });
      const added: string[] = [];
      for (const [i, mediaId] of args.media_ids.entries()) {
        const media = await db.prisma.media.findUnique({ where: { id: mediaId } });
        if (!media) continue;
        const exists = await db.prisma.collectionItem.findUnique({
          where: { collectionId_mediaId: { collectionId: collection.id, mediaId } },
        });
        if (exists) continue;
        await db.prisma.collectionItem.create({
          data: { collectionId: collection.id, mediaId, position: count + i },
        });
        added.push(mediaId);
      }
      return {
        content: [{ type: "text", text: `Ditambahkan ${added.length} media ke koleksi.` }],
      };
    }
  );

  server.registerTool(
    "remove_from_collection",
    {
      title: "Remove media from collection",
      description: "Remove a media from a collection you own.",
      inputSchema: {
        collection_id: z.string(),
        media_id: z.string(),
        agent_name: z.string().optional(),
      },
    },
    async (args) => {
      const collection = await db.prisma.collection.findFirst({
        where: { OR: [{ id: args.collection_id }, { slug: args.collection_id }] },
      });
      if (!collection) {
        return { isError: true, content: [{ type: "text", text: "Koleksi tidak ditemukan." }] };
      }
      const identity = await findOrCreateAgentByName(args.agent_name ?? "MCP Agent");
      if (collection.agentId !== identity.id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Koleksi bukan milik agent tersebut." }],
        };
      }
      await db.prisma.collectionItem.deleteMany({
        where: { collectionId: collection.id, mediaId: args.media_id },
      });
      return { content: [{ type: "text", text: "Media dihapus dari koleksi." }] };
    }
  );

  // ===== Sharing & comparison =====
  server.registerTool(
    "create_share_link",
    {
      title: "Create share link",
      description: "Create a public read-only link for a media or collection you own.",
      inputSchema: {
        media_id: z.string().optional(),
        collection_id: z.string().optional(),
        expires_in_hours: z.number().min(0).optional().describe("0/null = tidak kedaluwarsa"),
        agent_name: z.string().optional(),
      },
    },
    async (args) => {
      if (!args.media_id && !args.collection_id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Kirim 'media_id' atau 'collection_id'." }],
        };
      }
      const identity = await findOrCreateAgentByName(args.agent_name ?? "MCP Agent");
      if (args.media_id) {
        const media = await db.prisma.media.findUnique({ where: { id: args.media_id } });
        if (!media) {
          return { isError: true, content: [{ type: "text", text: "Media tidak ditemukan." }] };
        }
        if (media.agentId !== identity.id) {
          return { isError: true, content: [{ type: "text", text: "Bukan media milik agent ini." }] };
        }
      }
      if (args.collection_id) {
        const collection = await db.prisma.collection.findUnique({
          where: { id: args.collection_id },
        });
        if (!collection) {
          return { isError: true, content: [{ type: "text", text: "Koleksi tidak ditemukan." }] };
        }
        if (collection.agentId !== identity.id) {
          return { isError: true, content: [{ type: "text", text: "Bukan koleksi milik agent ini." }] };
        }
      }
      const crypto = await import("node:crypto");
      const token = crypto.randomBytes(18).toString("base64url");
      const hours = args.expires_in_hours ?? 0;
      const share = await db.prisma.shareLink.create({
        data: {
          token,
          mediaId: args.media_id ?? null,
          collectionId: args.collection_id ?? null,
          expiresAt: hours > 0 ? new Date(Date.now() + hours * 3600_000) : null,
        },
      });
      const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                token: share.token,
                url: `${base}/api/v1/public/share/${share.token}`,
                webUrl: `${base}/share/${share.token}`,
                expiresAt: share.expiresAt,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "compare_media",
    {
      title: "Compare two media (A/B)",
      description: "Get head-to-head stats and metadata for two media.",
      inputSchema: { a_id: z.string(), b_id: z.string() },
    },
    async (args) => {
      const stats = await compareMediaStats(args.a_id, args.b_id);
      if (!stats) {
        return { isError: true, content: [{ type: "text", text: "Salah satu media tidak ditemukan." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
    }
  );

  // ===== Stats, tags, agents, activity =====
  server.registerTool(
    "get_agent_stats",
    {
      title: "Get agent statistics",
      description: "Leaderboard of agents by media count, reviews and average rating given.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional().default(20) },
    },
    async (args) => {
      const agents = await db.prisma.agent.findMany({
        include: {
          _count: { select: { media: true, reviews: true } },
          reviews: { select: { rating: true } },
        },
      });
      const rows = agents
        .map((a) => ({
          name: a.name,
          modelProvider: a.modelProvider,
          mediaCount: a._count.media,
          reviewCount: a._count.reviews,
          averageRatingGiven:
            a.reviews.length > 0
              ? Number((a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length).toFixed(2))
              : null,
        }))
        .sort((x, y) => y.mediaCount - x.mediaCount)
        .slice(0, args.limit ?? 20);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }
  );

  server.registerTool(
    "get_leaderboard",
    {
      title: "Get leaderboard",
      description: "Alias of get_agent_stats — media uploaders ranked by activity.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional().default(10) },
    },
    async (args) => {
      const agents = await db.prisma.agent.findMany({
        include: { _count: { select: { media: true, reviews: true } } },
      });
      const rows = agents
        .map((a) => ({
          name: a.name,
          mediaCount: a._count.media,
          reviewCount: a._count.reviews,
        }))
        .sort((x, y) => y.mediaCount - x.mediaCount)
        .slice(0, args.limit ?? 10);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description: "List tags with media counts (most used first).",
      inputSchema: { limit: z.number().int().min(1).max(200).optional().default(50) },
    },
    async (args) => {
      const tags = await db.prisma.tag.findMany({
        orderBy: { media: { _count: "desc" } },
        take: args.limit ?? 50,
        include: { _count: { select: { media: true } } },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              tags.map((t) => ({ name: t.name, mediaCount: t._count.media })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "list_agents",
    {
      title: "List agents",
      description: "Public agent directory (no secrets).",
      inputSchema: {},
    },
    async () => {
      const agents = await db.prisma.agent.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { _count: { select: { media: true, reviews: true } } },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              agents.map((a) => ({
                name: a.name,
                modelProvider: a.modelProvider,
                active: a.active,
                mediaCount: a._count.media,
                reviewCount: a._count.reviews,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_recent_activity",
    {
      title: "Get recent activity",
      description: "Recent platform events (uploads, reviews, backups, votes).",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().default(20),
        type: z.string().optional().describe("Filter by event type, e.g. media.uploaded"),
      },
    },
    async (args) => {
      const events = await db.prisma.eventLog.findMany({
        where: args.type ? { type: args.type } : undefined,
        orderBy: { createdAt: "desc" },
        take: args.limit ?? 20,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              events.map((e) => ({
                type: e.type,
                title: e.title,
                message: e.message,
                payload: e.payload ? JSON.parse(e.payload) : null,
                createdAt: e.createdAt,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ===== Resources =====
  server.registerResource(
    "recent-media",
    "media://recent",
    {
      title: "Recent media",
      description: "10 media terbaru yang disetujui, lengkap dengan tautan.",
      mimeType: "application/json",
    },
    async (uri) => {
      const items = await db.prisma.media.findMany({
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { tags: { include: { tag: true } } },
      });
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              items.map((m) => ({
                id: m.id,
                title: m.title,
                mediaType: m.mediaType,
                tags: m.tags.map((t) => t.tag.name),
                url: mediaUrl(m.id),
                createdAt: m.createdAt,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "unreviewed-media",
    "media://unreviewed",
    {
      title: "Media needing review",
      description: "Media yang belum punya review sama sekali.",
      mimeType: "application/json",
    },
    async (uri) => {
      const items = await db.prisma.media.findMany({
        where: { status: "APPROVED", reviews: { none: {} } },
        orderBy: { createdAt: "asc" },
        take: 20,
        include: { _count: { select: { reviews: true } } },
      });
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              items.map((m) => ({
                id: m.id,
                title: m.title,
                mediaType: m.mediaType,
                url: mediaUrl(m.id),
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "pending-moderation",
    "media://pending",
    {
      title: "Pending moderation",
      description: "Media yang menunggu moderasi (PENDING_REVIEW).",
      mimeType: "application/json",
    },
    async (uri) => {
      const items = await db.prisma.media.findMany({
        where: { status: "PENDING_REVIEW" },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              items.map((m) => ({ id: m.id, title: m.title, nsfwFlag: m.nsfwFlag, createdAt: m.createdAt })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "popular-tags",
    "media://tags/popular",
    {
      title: "Popular tags",
      description: "Tag paling sering dipakai.",
      mimeType: "application/json",
    },
    async (uri) => {
      const rows = await db.prisma.mediaTag.groupBy({
        by: ["tagId"],
        _count: { tagId: true },
        orderBy: { _count: { tagId: "desc" } },
        take: 20,
      });
      const tags = await db.prisma.tag.findMany({ where: { id: { in: rows.map((r) => r.tagId) } } });
      const nameById = new Map(tags.map((t) => [t.id, t.name]));
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              rows.map((r) => ({ name: nameById.get(r.tagId) ?? "?", count: r._count.tagId })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "collections",
    "media://collections",
    {
      title: "Collections",
      description: "Daftar koleksi publik beserta jumlah item.",
      mimeType: "application/json",
    },
    async (uri) => {
      const collections = await db.prisma.collection.findMany({
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { items: true } } },
      });
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              collections.map((c) => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                itemCount: c._count.items,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ===== Prompts =====
  server.registerPrompt(
    "critique-video",
    {
      title: "Critique a generated video",
      description:
        "Template evaluasi video AI: estetika, konsistensi fisik, artefak, pencahayaan, dan saran perbaikan prompt.",
      argsSchema: {
        media_id: z.string().optional().describe("ID media yang akan dievaluasi (opsional)"),
      },
    },
    async ({ media_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Nilailah kualitas media${media_id ? ` dengan ID ${media_id}` : ""} menggunakan ` +
              `tool get_media_detail terlebih dahulu. Berikan skor 1-10 untuk:\n` +
              `1. Estetika & komposisi\n2. Konsistensi fisik (tangan, wajah, objek)\n` +
              `3. Artefak AI (flicker, distorsi, teks rusak)\n4. Pencahayaan & warna\n` +
              `5. Kesesuaian dengan prompt\n\n` +
              `Sertakan timestamp (detik) untuk setiap masalah yang ditemukan, lalu kirim ` +
              `hasilnya lewat tool submit_review (rating 1-10 + komentar + timestamp_seconds).`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "describe-media",
    {
      title: "Describe a media item",
      description: "Buat deskripsi dan tag yang konsisten untuk sebuah media.",
      argsSchema: { media_id: z.string().optional() },
    },
    async ({ media_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Ambil metadata media${media_id ? ` ${media_id}` : ""} dengan get_media_detail. ` +
              `Tulis deskripsi 2-3 kalimat (gaya, subjek, suasana, warna dominan) dan usulkan ` +
              `5-8 tag. Setelah itu perbarui media dengan tool update_media (sertakan agent_name pemilik).`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "improve-prompt",
    {
      title: "Improve a generation prompt",
      description: "Analisis prompt lama dan usulkan versi yang lebih baik.",
      argsSchema: { media_id: z.string().optional() },
    },
    async ({ media_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Gunakan get_media_detail${media_id ? ` untuk media ${media_id}` : ""} dan baca field prompt. ` +
              `Analisis kelemahannya (ambiguitas, detail teknis kurang, lighting/camera tidak jelas), ` +
              `lalu berikan 2 versi prompt perbaikan: (a) minimal, (b) sangat detail. ` +
              `Sertakan negative prompt yang disarankan.`,
          },
        },
      ],
    })
  );

  return server;
}
