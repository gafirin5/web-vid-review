import { SERVER_VERSION } from "@/mcp/server";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mediaSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    contentId: { type: "string", nullable: true, description: "Kode identifikasi (CID) dari pipeline/DTK (kunci dedup & lookup)" },
    role: { type: "string", enum: ["video", "cover", "frame", "pin", "thumb"], description: "Peran aset dalam bundle CID" },
    index: { type: "integer", minimum: 0, description: "Urutan frame/pin (0 untuk video/cover)" },
    characterCandidates: { type: "string", nullable: true, description: "JSON array saran karakter" },
    game: { type: "string", nullable: true },
    creatorName: { type: "string", nullable: true },
    creatorSecUid: { type: "string", nullable: true },
    sourceUrl: { type: "string", nullable: true },
    sourcePlatform: { type: "string", nullable: true, enum: ["douyin", "tiktok"] },
    playlistId: { type: "string", nullable: true },
    pinterestBoard: { type: "string", nullable: true },
    visionVerdict: { type: "string", nullable: true },
    pipelineStage: { type: "string", enum: ["intake", "gated", "scheduled", "published", "archived"] },
    externalRefs: { type: "string", nullable: true, description: "JSON referensi publish (YouTube/Zernio/Pinterest/TikTok)" },
    publishedAt: { type: "string", format: "date-time", nullable: true },
    purgeAt: { type: "string", format: "date-time", nullable: true, description: "Jadwal retensi file" },
    phash: { type: "string", nullable: true },
    title: { type: "string" },
    description: { type: "string", nullable: true },
    mediaType: { type: "string", enum: ["IMAGE", "VIDEO"] },
    status: { type: "string", enum: ["PENDING_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"] },
    reviewKind: { type: "string", nullable: true, enum: ["CHARACTER", "NSFW", "QUALITY", "CUSTOM"] },
    characterName: { type: "string", nullable: true, description: "Nama karakter game/anime yang telah divalidasi manusia" },
    reviewNote: { type: "string", nullable: true, description: "Catatan kurator/reviewer manusia" },
    reviewedAt: { type: "string", format: "date-time", nullable: true },
    rejectCategory: {
      type: "string",
      nullable: true,
      enum: ["DIRTY_TEXT", "SKIT", "SPONSOR", "NON_COSPLAY", "LOWRES", "DUPLICATE"],
      description: "Kategori karantina bila media ditolak (zero-delete); paritas enum pipeline",
    },
    rejectReason: { type: "string", nullable: true, description: "Alasan penolakan dari kurator" },
    rejectedAt: { type: "string", format: "date-time", nullable: true },
    quarantinedPath: {
      type: "string",
      nullable: true,
      description: "Path relatif di folder rejected/ (hanya untuk admin)",
    },
    storagePath: { type: "string" },
    thumbnailPath: { type: "string", nullable: true },
    mimeType: { type: "string" },
    sizeBytes: { type: "string", description: "BigInt sebagai string" },
    durationSeconds: { type: "number", nullable: true },
    width: { type: "integer", nullable: true },
    height: { type: "integer", nullable: true },
    fileHash: { type: "string", description: "SHA-256" },
    prompt: { type: "string", nullable: true },
    negativePrompt: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    agent: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        modelProvider: { type: "string" },
      },
    },
    tags: {
      type: "array",
      items: {
        type: "object",
        properties: { tag: { type: "object", properties: { name: { type: "string" } } } },
      },
    },
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          authorType: { type: "string", enum: ["HUMAN", "AI"] },
          authorName: { type: "string" },
          rating: { type: "integer", minimum: 1, maximum: 10 },
          comment: { type: "string", nullable: true },
          timestampSeconds: { type: "number", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
} as const;

/** GET /api/v1/openapi — spesifikasi OpenAPI 3.1 (untik Swagger UI & Custom GPTs) */
export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "web-vid-review API",
      version: SERVER_VERSION,
      description:
        "API galeri media AI dengan identitas CID-first. Upload foto/video sebagai AI agent (dengan API key), " +
        "kirim satu bundle (video + cover + frames) per CID secara idempoten, kelola retensi per role, " +
        "dan handoff ke pipeline. Dokumentasi interaktif: /api/v1/docs. Server MCP juga tersedia di /api/mcp.",
    },
    servers: [{ url: "/", description: "Server saat ini (origin yang sama dengan dokumen ini)" }],
    components: {
      securitySchemes: {
        AgentApiKey: {
          type: "http",
          scheme: "bearer",
          description: "API key agent (format avr_...). Buat via /admin/agents atau CLI npm run agent:create.",
        },
      },
      schemas: { Media: mediaSchema },
    },
    paths: {
      "/api/v1/media": {
        get: {
          summary: "Daftar media",
          description:
            "Menampilkan media berstatus APPROVED (publik). Gunakan ?status=ALL untuk semua status.",
          parameters: [
            { name: "media_type", in: "query", schema: { type: "string", enum: ["IMAGE", "VIDEO"] } },
            { name: "status", in: "query", schema: { type: "string", default: "APPROVED" } },
            { name: "search", in: "query", schema: { type: "string" }, description: "Cari di judul/deskripsi/prompt" },
            { name: "tag", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 24, maximum: 100 } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["newest", "oldest", "size"], default: "newest" } },
          ],
          responses: {
            200: {
              description: "Daftar media + paginasi",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: { $ref: "#/components/schemas/Media" } },
                      pagination: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/media/by-code/{code}": {
        get: {
          summary: "Cari media via CID (content_id) atau UUID",
          description:
            "Tanpa query: 1 aset → objek Media; >1 aset → dikelompokkan per role " +
            "({ content_id, count, roles: { video, cover, frames, pins, thumbs }, items }). " +
            "Gunakan ?role=frame untuk satu role dan ?role=frame&index=2 untuk presisi. " +
            "Dipakai AI agent untuk polling hasil review karakter manusia. Bila ditolak, respons " +
            "memuat rejectCategory, rejectReason, dan rejectedAt (media dipindah ke karantina).",
          parameters: [
            {
              name: "code",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "contentId (CID) atau UUID media",
            },
            {
              name: "role",
              in: "query",
              schema: { type: "string", enum: ["video", "cover", "frame", "pin", "thumb"] },
              description: "Filter per peran aset",
            },
            {
              name: "index",
              in: "query",
              schema: { type: "integer", minimum: 0 },
              description: "Filter urutan (butuh role)",
            },
          ],
          responses: {
            200: {
              description: "Detail media, daftar per role, atau riwayat review",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Media" } } },
            },
            404: { description: "Media tidak ditemukan" },
            422: { description: "role tidak valid" },
          },
        },
      },
      "/api/v1/bundles": {
        post: {
          summary: "Upload satu bundle CID (video + cover + frames)",
          description:
            "multipart/form-data: video (File), cover (File, opsional), frames (File[], opsional, index 1..N), " +
            "manifest (JSON string: { content_id, title?, character?, game?, creator?, tags?, needs_character_review? }). " +
            "Idempoten per (content_id, role, index): kirim ulang → 200 { duplicate: true } tanpa baris baru.",
          security: [{ AgentApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["manifest"],
                  properties: {
                    manifest: { type: "string", description: "JSON manifest bundle" },
                    video: { type: "string", format: "binary" },
                    cover: { type: "string", format: "binary" },
                    frames: { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Bundle dibuat (created > 0)" },
            200: { description: "Semua aset sudah ada (duplicate: true)" },
            401: { description: "API key tidak valid" },
            422: { description: "Manifest/role tidak valid" },
          },
        },
      },
      "/api/v1/bundles/{cid}": {
        get: {
          summary: "Ambil bundle per CID",
          parameters: [{ name: "cid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Semua aset CID dikelompokkan per role" },
            404: { description: "CID tidak ditemukan" },
          },
        },
      },
      "/api/v1/bundles/{cid}/publish-ref": {
        post: {
          summary: "Simpan referensi publish (externalRefs)",
          description:
            "Body: { youtube_video_id?, zernio_post_id?, pinterest_pin_id?, tiktok_post_id?, external_refs? }. " +
            "Menyimpan externalRefs + publishedAt + pipelineStage=published.",
          security: [{ AgentApiKey: [] }],
          parameters: [{ name: "cid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Referensi tersimpan" },
            422: { description: "Tidak ada referensi / CID tidak ditemukan" },
          },
        },
      },
      "/api/v1/characters": {
        get: {
          summary: "Autocomplete karakter & game",
          description:
            "Sumber data adalah database lokal (diimpor dari DB pipeline via POST /api/v1/characters/import " +
            "atau `npm run characters:import`).",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Pencarian nama karakter" },
            { name: "game", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          ],
          responses: { 200: { description: "{ items, games, count }" } },
        },
      },
      "/api/v1/characters/import": {
        post: {
          summary: "Impor/merge karakter dari pipeline (admin)",
          security: [{ AgentApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    characters: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["name"],
                        properties: {
                          name: { type: "string" },
                          game: { type: "string" },
                          aliases: { type: "array", items: { type: "string" } },
                        },
                      },
                    },
                    games: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "{ created, updated, games }" } },
        },
      },
      "/api/v1/storage/report": {
        get: {
          summary: "Laporan penyimpanan",
          description:
            "Total, per role, per status, byte yang bisa di-purge, proyeksi 30 hari, dan kapasitas disk.",
          responses: { 200: { description: "OK" } },
        },
      },
      "/api/v1/retention/policies": {
        get: {
          summary: "Kebijakan retensi per role",
          security: [{ AgentApiKey: [] }],
          responses: { 200: { description: "{ roles, policies }" } },
        },
        post: {
          summary: "Ubah TTL retensi (admin)",
          security: [{ AgentApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["role", "retentionDays"],
                  properties: {
                    role: { type: "string", enum: ["video", "cover", "frame", "pin", "thumb", "rejected"] },
                    retentionDays: { type: "integer", minimum: 0, maximum: 3650 },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Kebijakan disimpan" } },
        },
      },
      "/api/v1/retention/run": {
        post: {
          summary: "Jalankan retensi (default dry-run)",
          description:
            "?dry_run=false untuk purge nyata: file dihapus, metadata tetap ada sebagai ARCHIVED (zero-delete).",
          security: [{ AgentApiKey: [] }],
          parameters: [
            { name: "dry_run", in: "query", schema: { type: "boolean", default: true } },
          ],
          responses: { 200: { description: "{ candidates, freedBytes, purged, refreshed }" } },
        },
      },
      "/api/v1/media/upload": {
        post: {
          summary: "Upload media",
          description:
            "Dua mode: multipart/form-data dengan field 'file', atau JSON dengan salah satu sumber: " +
            "source_url (download http/https), source_path (path file absolut di server), atau base64.",
          security: [{ AgentApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file", "title"],
                  properties: {
                    file: { type: "string", format: "binary" },
                    title: { type: "string" },
                    content_id: { type: "string", description: "Kode identifikasi (CID) dari pipeline/DTK (dedup)" },
                    role: { type: "string", enum: ["video", "cover", "frame", "pin", "thumb"], description: "Peran aset (default video)" },
                    index: { type: "integer", minimum: 0, description: "Urutan frame/pin (default 0)" },
                    needs_character_review: { type: "string", enum: ["true", "false"], description: "Kirim 'true' jika ragu identitas karakter (status jadi PENDING_REVIEW)" },
                    description: { type: "string" },
                    tags: { type: "string", description: "Tag dipisah koma: '3d,render'" },
                    prompt: { type: "string" },
                  },
                },
              },
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string" },
                    content_id: { type: "string", description: "Kode identifikasi (CID) dari pipeline/DTK (dedup)" },
                    role: { type: "string", enum: ["video", "cover", "frame", "pin", "thumb"], description: "Peran aset (default video)" },
                    index: { type: "integer", minimum: 0, description: "Urutan frame/pin (default 0)" },
                    character: { type: "string", description: "Nama karakter (bila sudah yakin)" },
                    game: { type: "string" },
                    character_candidates: { type: "array", items: { type: "string" } },
                    creator_name: { type: "string" },
                    creator_sec_uid: { type: "string" },
                    source_platform: { type: "string", enum: ["douyin", "tiktok"] },
                    needs_character_review: { type: "boolean", description: "Kirim true jika ragu identitas karakter (status jadi PENDING_REVIEW)" },
                    source_url: { type: "string", format: "uri" },
                    source_path: { type: "string", example: "C:/videos/render.mp4" },
                    base64: { type: "string" },
                    file_name: { type: "string", description: "Wajib untuk base64" },
                    description: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    prompt: { type: "string" },
                    negative_prompt: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Media tersimpan (atau duplikat terdeteksi)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      duplicate: { type: "boolean" },
                      media: { $ref: "#/components/schemas/Media" },
                    },
                  },
                },
              },
            },
            422: { description: "Validasi gagal / format tidak didukung" },
            401: { description: "API key tidak valid" },
          },
        },
      },
      "/api/v1/media/{id}": {
        get: {
          summary: "Detail media",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: {
            200: {
              description: "Detail lengkap + reviews",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Media" } },
              },
            },
            404: { description: "Tidak ditemukan" },
          },
        },
        patch: {
          summary: "Perbarui media milik sendiri",
          description: "Pemilik media (x-agent-name / API key) atau admin.",
          security: [{ AgentApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    prompt: { type: "string" },
                    transcript: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "OK" }, 403: { description: "Bukan pemilik" } },
        },
        delete: {
          summary: "Hapus media milik sendiri",
          security: [{ AgentApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Terhapus" }, 403: { description: "Bukan pemilik" } },
        },
      },
      "/api/v1/media/bulk": {
        post: {
          summary: "Upload banyak media (maks 20)",
          security: [{ AgentApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    items: {
                      type: "array",
                      maxItems: 20,
                      items: {
                        type: "object",
                        properties: {
                          source_url: { type: "string" },
                          source_path: { type: "string" },
                          base64: { type: "string" },
                          file_name: { type: "string" },
                          title: { type: "string" },
                          tags: { type: "array", items: { type: "string" } },
                          prompt: { type: "string" },
                          transcript: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Hasil per item" } },
        },
      },
      "/api/v1/media/check-duplicate": {
        post: {
          summary: "Cek duplikat sebelum upload",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    hash: { type: "string", description: "SHA-256 hex" },
                    base64: { type: "string" },
                    source_path: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "{ exists, media }" } },
        },
      },
      "/api/v1/agents": {
        get: { summary: "Direktori agent publik", responses: { 200: { description: "Daftar agent" } } },
      },
      "/api/v1/agents/register": {
        post: {
          summary: "Pendaftaran agent mandiri (tanpa admin)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                    provider: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Agent + API key (sekali)" }, 409: { description: "Nama dipakai" } },
        },
      },
      "/api/v1/collections": {
        get: { summary: "Daftar koleksi publik", responses: { 200: { description: "OK" } } },
        post: {
          summary: "Buat koleksi",
          security: [{ AgentApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    isPublic: { type: "boolean", default: true },
                    media_ids: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Koleksi dibuat" } },
        },
      },
      "/api/v1/collections/{id}": {
        get: {
          summary: "Detail koleksi (id atau slug)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "OK" }, 404: { description: "Tidak ditemukan" } },
        },
        patch: {
          summary: "Ubah koleksi (pemilik/admin)",
          security: [{ AgentApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    isPublic: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "OK" } },
        },
        delete: {
          summary: "Hapus koleksi (pemilik/admin)",
          security: [{ AgentApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Terhapus" } },
        },
      },
      "/api/v1/collections/{id}/items": {
        post: {
          summary: "Tambahkan media ke koleksi",
          security: [{ AgentApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    media_id: { type: "string" },
                    media_ids: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "OK" } },
        },
      },
      "/api/v1/collections/{id}/items/{mediaId}": {
        delete: {
          summary: "Hapus media dari koleksi",
          security: [{ AgentApiKey: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "mediaId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/api/v1/shares": {
        get: { summary: "Daftar share link milik agent/admin", security: [{ AgentApiKey: [] }], responses: { 200: { description: "OK" } } },
        post: {
          summary: "Buat share link publik",
          security: [{ AgentApiKey: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    media_id: { type: "string" },
                    collection_id: { type: "string" },
                    expires_in_hours: { type: "number", default: 0 },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "token + url" } },
        },
      },
      "/api/v1/shares/{id}": {
        delete: {
          summary: "Cabut share link",
          security: [{ AgentApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Dicabut" } },
        },
      },
      "/api/v1/public/share/{token}": {
        get: {
          summary: "Akses publik share link",
          parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Media/koleksi" }, 410: { description: "Kedaluwarsa/dicabut" } },
        },
      },
      "/api/v1/tags": {
        get: { summary: "Daftar tag + jumlah media", responses: { 200: { description: "OK" } } },
      },
      "/api/v1/tags/popular": {
        get: { summary: "Tag terpopuler", responses: { 200: { description: "OK" } } },
      },
      "/api/v1/stats/agents": {
        get: { summary: "Leaderboard agent", responses: { 200: { description: "OK" } } },
      },
      "/api/v1/stats/uploads": {
        get: { summary: "Statistik upload agregat", responses: { 200: { description: "OK" } } },
      },
      "/api/v1/stats/tags": {
        get: { summary: "Statistik tag", responses: { 200: { description: "OK" } } },
      },
      "/api/v1/compare": {
        get: {
          summary: "Statistik head-to-head dua media",
          parameters: [
            { name: "a", in: "query", required: true, schema: { type: "string" } },
            { name: "b", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/api/v1/compare/vote": {
        post: {
          summary: "Vote A/B",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["winner_id", "loser_id"],
                  properties: {
                    winner_id: { type: "string" },
                    loser_id: { type: "string" },
                    voter_name: { type: "string" },
                    comment: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Vote tersimpan" } },
        },
      },
      "/api/v1/reviews/bulk": {
        post: {
          summary: "Kirim banyak review sekaligus (maks 50)",
          security: [{ AgentApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    items: {
                      type: "array",
                      maxItems: 50,
                      items: {
                        type: "object",
                        required: ["media_id", "rating"],
                        properties: {
                          media_id: { type: "string" },
                          rating: { type: "integer", minimum: 1, maximum: 10 },
                          comment: { type: "string" },
                          timestamp_seconds: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "OK" } },
        },
      },
      "/api/v1/events/history": {
        get: {
          summary: "Riwayat aktivitas platform",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "type", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/api/v1/capabilities": {
        get: { summary: "Kemampuan server (auth mode, tools MCP, batas)", responses: { 200: { description: "OK" } } },
      },
      "/api/v1/media/{id}/reviews": {
        post: {
          summary: "Kirim review",
          description:
            "Tanpa API key = reviewer manusia. Dengan API key agent = review AI (atribusi agent otomatis).",
          security: [{ AgentApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["rating"],
                  properties: {
                    rating: { type: "integer", minimum: 1, maximum: 10 },
                    comment: { type: "string" },
                    timestamp_seconds: { type: "number", description: "Detik video yang dikomentari" },
                    author_name: { type: "string", description: "Nama reviewer (tanpa API key)" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Review tersimpan" },
            404: { description: "Media tidak ditemukan" },
          },
        },
      },
      "/api/v1/metrics/storage": {
        get: { summary: "Metrik penyimpanan (disk & ukuran folder)", responses: { 200: { description: "OK" } } },
      },
      "/api/v1/metrics/overview": {
        get: { summary: "Metrik umum (total data, tren upload, distribusi)", responses: { 200: { description: "OK" } } },
      },
      "/api/v1/search": {
        get: {
          summary: "Pencarian relevansi media",
          description:
            "Pencarian teks pada judul, deskripsi, prompt, tag, dan transkrip dengan sinonim ID/EN.",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "all", in: "query", schema: { type: "boolean", default: false }, description: "Sertakan media non-APPROVED" },
          ],
          responses: { 200: { description: "Hasil dengan skor relevansi" } },
        },
      },
      "/api/v1/system/health": {
        get: { summary: "Healthcheck", responses: { 200: { description: "OK" } } },
      },
    },
  };

  return jsonOk(spec);
}
