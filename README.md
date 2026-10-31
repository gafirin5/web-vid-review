# 🎬 OmniMedia AI Review Hub

[![Next.js 16](https://img.shields.io/badge/Next.js-16.4-black?style=flat&logo=next.js)](https://nextjs.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Protocol-purple?style=flat)](https://modelcontextprotocol.io/)
[![Prisma 7](https://img.shields.io/badge/Prisma-7.10-blue?style=flat&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat&logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

> **Platform galeri media AI modern** tempat AI Agent (Claude, Cursor, ChatGPT, Antigravity, script otonom) dan Manusia dapat mengunggah, mengkurasi, mereview, dan membandingkan koleksi video & foto secara kolaboratif melalui **Model Context Protocol (MCP)**, **REST API**, dan antarmuka web interaktif.

---

## 🧭 Untuk AI Agent — Baca Ini Dulu

README ini adalah **kontrak operasional**, bukan sekadar brosur. Jika Anda agent, jangan menebak perilaku server: gunakan tabel di bawah.

### Apa layanan ini (dan bukan apa)

| Ini adalah | Ini BUKAN |
|---|---|
| **Staging & curation hub lokal** antara generator/scraper dan `nextgen_cosplay_pipeline` | Layanan publish ke YouTube/TikTok/Pinterest |
| Tempat agent mengirim **satu bundle CID** (video + cover + frame/pin) secara idempoten | Pengganti pipeline final atau database produksi |
| Tempat owner manusia **mereview karakter** dan **menolak/mengarantina** media | Kanal distribusi atau CDN publik |
| Storage **disk lokal** sebagai sumber utama; Google Drive hanya salinan via rclone | Cloud storage primary |

**Aturan mati:** jangan pernah memanggil API publish (YouTube/TikTok/Pinterest) dari service ini. Referensi publish hanya **dicatat** lewat `POST /api/v1/bundles/:cid/publish-ref`.

### Model identitas kanonik (hafalkan)

| Konsep | Nama di API | Nama di DB | Contoh | Aturan |
|---|---|---|---|---|
| Content ID | `content_id` | `Media.contentId` | `DTK_VIDEO_1092` | Kunci identitas utama; **bukan** hash file |
| Peran aset | `role` | `Media.role` | `video`, `cover`, `frame`, `pin`, `thumb` | Satu CID boleh punya banyak role |
| Urutan aset | `index` | `Media.index` | `0`, `1`, `2` | `0` untuk video/cover; frame/pin mulai `1` |
| Kunci dedup | — | `UNIQUE(contentId, role, index)` | — | Kirim ulang kombinasi sama = `duplicate: true`, **tanpa baris baru** |
| Fallback dedup | — | `fileHash` (SHA-256) | — | **Hanya** dipakai bila tidak ada CID |
| Alasan tolak | `category` | `Media.rejectCategory` | `DIRTY_TEXT`, `SKIT`, `SPONSOR`, `NON_COSPLAY`, `LOWRES`, `DUPLICATE` | Uppercase di DB; `MODESTY_OK` bukan alasan tolak |
| Folder karantina | — | `quarantinedPath` | `rejected/dirty_text/2026-10/...` | Slug lowercase, terpisah dari dump |
| Jadwal retensi | — | `Media.purgeAt` | ISO date | Dihitung dari `publishedAt`/`createdAt`/`rejectedAt` + TTL role |
| Referensi publish | `external_refs` | `Media.externalRefs` (JSON) | `{ youtube_video_id, zernio_post_id, ... }` | Hanya catatan; tidak memicu publish |

### Siklus status (state machine)

```text
                 needs_character_review=true
 upload ────────────────────────────────► PENDING_REVIEW
   │                                            │
   │ default                                    │ owner review
   ▼                                            ▼
 APPROVED ◄──────────────── restore ─────── REJECTED
   │                                            │
   │ TTL retensi (file dihapus)                 │ hard delete (admin, ketik CID)
   ▼                                            ▼
 ARCHIVED (metadata tetap)                    (hilang permanen)
```

Aturan transisi:
- `PENDING_REVIEW` → agent **polling**, bukan upload ulang.
- `REJECTED` → jangan kirim ulang media yang sama; baca `reject_category` + `reject_reason`.
- `ARCHIVED` → record masih ada, file fisik sudah dihapus; jangan mengharapkan `storagePath` bisa diunduh.

### Tabel keputusan agent

| Situasi | Aksi yang benar | Jangan lakukan |
|---|---|---|
| Akan upload bundle baru | `check_cid` dulu → `upload_bundle` | Upload buta tanpa cek CID |
| CID sudah ada sebagian | Kirim hanya role/index yang belum ada; response `duplicate` untuk yang sudah ada | Menghapus lalu upload ulang |
| Ragu nama karakter | `needs_character_review: true` → `PENDING_REVIEW` | Menebak nama karakter final |
| Ingin tahu hasil review | `get_review_result(cid)` atau `GET /api/v1/media/by-code/:code` | Membaca DB langsung |
| Media ditolak | Baca `reject_category`/`reject_reason`, berhenti | Retry upload |
| Butuh semua aset satu CID | `get_bundle(cid)` | Iterasi `by-code` per aset |
| Sebelum batch besar | `storage_report` → cek `purgeable` & `disk.freeBytes` | Mengabaikan kapasitas disk |
| Butuh nama karakter untuk form | `GET /api/v1/characters?q=` (DB lokal) | Memanggil LLM untuk verifikasi |
| Butuh publish | `POST /api/v1/bundles/:cid/publish-ref` (catat saja) | Memanggil API YouTube/TikTok/Pinterest |

### Dua jalur integrasi

| Jalur | Kapan dipakai | Autentikasi |
|---|---|---|
| **REST** `/api/v1` | Script pipeline, cron, integrasi non-MCP | `Authorization: Bearer avr_...` |
| **MCP HTTP** `/api/mcp` | Claude Desktop, Cursor, agent MCP-native | Header yang sama |
| **MCP stdio** `npm run mcp:bridge` | Proses lokal yang akses DB langsung | Tanpa HTTP (trust lokal) |

> **Peta lengkap kalimat kebutuhan → kode/endpoint → field** ada di bagian **“Pemetaan Lengkap: Teks Kebutuhan → Implementasi”** di bawah.

---

## 🌟 Sorotan Fitur

* 🔐 **Auth Keyed by Default**: `AUTH_MODE=required` — agent wajib memakai API key `avr_...` (buat di `/admin/agents`). Mode anonim hanya untuk demo eksplisit (`ALLOW_ANONYMOUS_DEMO=true`).
* 🧩 **Bundle Multi-Aset per CID**: Satu `content_id` dapat berisi `video`, `cover`, `frame`, `pin`, `thumb`; intake idempoten per `(content_id, role, index)`.
* 🤖 **MCP Server Lengkap (28 Tools + 5 Resources + 3 Prompts)**: Kompatibel dengan Claude Desktop, Cursor, dan klien MCP modern lainnya (tersedia via HTTP Streaming & Stdio subprocess).
* ⚡ **Realtime Event Stream (SSE)**: Galeri publik dan dashboard admin ter-refresh otomatis secara langsung saat ada unggahan atau ulasan baru.
* ⚖️ **A/B Comparison (Head-to-Head)**: Slider foto split-screen interaktif dan sinkronisasi playback video berdampingan untuk menguji kualitas model/prompt AI.
* 🧠 **Smart Media Intelligence**: Auto-tagging warna dominan, orientasi, kecerahan, keyword prompt otomatis, serta penyaring konten sensitif.
* 📁 **Album & Share Links**: Buat koleksi dan bagikan via link publik read-only dengan opsi masa berlaku kedaluwarsa.
* 💾 **Backup & Disaster Recovery**: Snapshot metadata ringan atau arsip ZIP penuh media dengan fitur pemulihan otomatis (rollback).
* 🧹 **Retensi & Laporan Storage**: TTL per role, purge file dengan metadata tetap `ARCHIVED` (zero-delete), laporan disk di `/admin/storage`.
* ☁️ **Siap Online**: Konfigurasi bawaan untuk Cloudflare Tunnel (HTTPS instan gratis) & Docker Compose.

---

## 🚀 Panduan Memulai Cepat

### Prasyarat
* [Node.js](https://nodejs.org/) v20+ atau v24+
* [FFmpeg](https://ffmpeg.org/) (opsional: binary otomatis disediakan oleh `ffmpeg-static`)

### 1. Kloning & Instalasi

```bash
git clone https://github.com/gafirin5/web-vid-review.git
cd web-vid-review
npm install
```

### 2. Siapkan Lingkungan (.env)

```bash
copy .env.example .env
```
> ⚠️ **Penting**: Ubah `ADMIN_PASSWORD` di dalam file `.env` sebelum menjalankan di lingkungan terbuka.

### 3. Migrasi Database & Jalankan

```bash
npx prisma migrate dev
npm run dev
```

Buka peramban Anda di **http://localhost:3000**:
* **Galeri Publik**: `http://localhost:3000`
* **Admin Panel**: `http://localhost:3000/admin`
* **Review Karakter**: `http://localhost:3000/admin/review`
* **Dump & Snapshot**: `http://localhost:3000/admin/dump`
* **Penyimpanan & Retensi**: `http://localhost:3000/admin/storage`
* **Karantina (Rejected)**: `http://localhost:3000/admin/rejected`
* **Dokumentasi Swagger API**: `http://localhost:3000/api/v1/docs`
  (jika sudah login admin, muncul toolbar untuk membuat/regenerate API key yang langsung ter-*Authorize* di Swagger)
* **Panduan AI Agent**: [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md)

---

## 🤖 Menghubungkan AI Agent

### 1. Model Context Protocol (MCP)

#### Opsi A — Streamable HTTP (Remote / Lokal)
Tambahkan ke konfigurasi klien MCP Anda (misal `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "media-gallery": {
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer avr_xxx" }
    }
  }
}
```
> Endpoint HTTP MCP ikut aturan `AUTH_MODE` (default `required`). Buat API key di `/admin/agents`.

#### Opsi B — Stdio Subprocess (Lokal Native)
```json
{
  "mcpServers": {
    "media-gallery": {
      "command": "npm",
      "args": ["run", "mcp:bridge"],
      "cwd": "C:/path/ke/web-vid-review"
    }
  }
}
```

#### 🛠️ Daftar Tools MCP Utama:
| Kategori | Tool | Deskripsi |
|---|---|---|
| **Media** | `upload_media` | Unggah dari URL, path lokal, atau base64 (dukung `content_id`, `role`, `index`, `needs_character_review`) |
| | `upload_bundle` | Unggah satu CID berisi video + cover + frames/pins dalam satu panggilan (idempoten) |
| | `get_bundle` | Ambil seluruh aset satu CID, dikelompokkan per role |
| | `check_cid` | Cek CID lebih dulu (CID-first dedup) sebelum upload |
| | `get_review_result` | Cek hasil review manusia via CID atau UUID (`status`, `character_name`, `pending`) |
| | `list_media` | Ambil daftar media terbaru dengan filter |
| | `search_media` | Cari media dengan pencarian semantik & relevansi |
| | `get_media_detail` | Ambil metadata lengkap, prompt, dan ulasan |
| | `update_media` / `delete_media` | Edit atau hapus media milik agent sendiri |
| | `bulk_upload` | Unggah hingga 20 media dalam satu pemanggilan |
| | `check_duplicate` | Cek hash SHA-256 (fallback bila aset tidak punya CID) |
| **Koleksi** | `create_collection` | Buat album koleksi tematik |
| | `add_to_collection` | Tambahkan media ke dalam album |
| **Ulasan & Banding** | `submit_review` / `bulk_review` | Berikan rating 1-10 + komentar timestamp video |
| | `compare_media` | Statistik perbandingan head-to-head A/B |
| | `create_share_link` | Buat link berbagi publik read-only |
| **Sistem** | `get_system_metrics` | Cek kapasitas disk dan statistik konten |
| | `storage_report` | Laporan storage per role/status, purgeable, proyeksi 30 hari |
| | `create_system_backup` | Memicu backup otomatis sistem |

---

### 2. REST API (API Key)

Dokumentasi interaktif Swagger UI tersedia di `/api/v1/docs`. Default `AUTH_MODE=required`, jadi sertakan `Authorization: Bearer avr_...`.

#### Contoh Unggah Langsung (cURL 1-Baris):
```bash
curl -X POST http://localhost:3000/api/v1/media/upload \
  -H "Authorization: Bearer avr_xxx" \
  -F "file=@animasi.mp4" \
  -F "title=Cyberpunk City" \
  -F "content_id=DTK_VIDEO_1092" \
  -F "needs_character_review=true" \
  -F "tags=3d,cyberpunk,neon" \
  -F "prompt=futuristic neon city in rain"
```
> Jika `needs_character_review=true`, media masuk status `PENDING_REVIEW` untuk divalidasi manusia.

#### Upload Bundle (video + cover + frames, idempoten per CID/role/index):
```bash
curl -X POST http://localhost:3000/api/v1/bundles \
  -H "Authorization: Bearer avr_xxx" \
  -F 'manifest={"content_id":"DTK_VIDEO_1092","title":"Cyberpunk City","character":"Raiden Shogun","game":"Genshin Impact"}' \
  -F "video=@animasi.mp4" \
  -F "cover=@cover.jpg" \
  -F "frames=@frame_1.jpg" \
  -F "frames=@frame_2.jpg"
```

#### Polling Hasil Review Karakter (cURL):
```bash
curl http://localhost:3000/api/v1/media/by-code/DTK_VIDEO_1092
```
> CID dengan banyak aset mengembalikan objek `{ content_id, count, roles: { video, cover, frames, pins, thumbs }, items }`. Gunakan `?role=frame&index=2` untuk presisi.

#### Kirim Review AI (opsional):
```bash
curl -X POST http://localhost:3000/api/v1/media/<ID_MEDIA>/reviews \
  -H "Authorization: Bearer avr_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "rating": 9, "comment": "Pencahayaan sangat konsisten", "timestamp_seconds": 3.5 }'
```

---

## 🗺️ Pemetaan Lengkap: Teks Kebutuhan → Implementasi

Bagian ini menghubungkan **kalimat kebutuhan/spesifikasi** dengan **perilaku nyata, endpoint, field, dan file** di repo. Gunakan sebagai indeks saat agent perlu memahami atau mengubah sistem.

### 1) Kebutuhan inti → implementasi

| Teks kebutuhan (ringkas) | Arti operasional | Implementasi (file / endpoint) |
|---|---|---|
| “Local-first disk storage; Drive opsional, bukan primary” | Semua file asli di `uploads/`; Drive hanya salinan | `src/lib/paths.ts`, `uploads/`, `src/services/remote-sync.ts`, `POST /api/admin/backups/sync` |
| “Never publish ke YouTube/TikTok/Pinterest” | Tidak ada endpoint publish; hanya pencatatan referensi | `src/services/bundles.ts` (`setPublishRefs`), `POST /api/v1/bundles/:cid/publish-ref` |
| “CID-first identity/dedup, bukan hash-first” | Identitas = `contentId`; SHA-256 hanya fallback tanpa CID | `src/lib/ingestion.ts` (`contentId_role_index`), `prisma/schema.prisma` |
| “Idempotent writes” | Kirim ulang bundle yang sama tidak menambah baris | `UNIQUE(contentId, role, index)`, `createBundle` → `duplicate: true` |
| “Append-only audit” | Setiap create/status/reject/restore/archive tercatat | `MediaAudit` (`prisma/schema.prisma`), `MediaAudit` create di `ingestion.ts`/`retention.ts`; event di `src/lib/events.ts` |
| “Zero-delete (quarantine/ARCHIVE; hard delete hanya admin purge)” | Tolak = pindah file; retensi = ARCHIVED; hapus permanen = aksi admin | `src/services/quarantine.ts`, `src/services/retention.ts`, `DELETE /api/admin/rejected/:id` |
| “No LLM dependency untuk verifikasi/alert” | Verifikasi = aturan + review manusia; alert = event deterministik | `src/services/intelligence.ts` (heuristik), `src/lib/events.ts`, `GET /api/events` |
| “Stable API contract” | Semua integrasi lewat `/api/v1`; spesifikasi terbuka | `src/app/api/v1/**`, `GET /api/v1/openapi`, `/api/v1/docs` |
| “Reject category harus sama dengan pipeline” | Enum uppercase: `DIRTY_TEXT`, `SKIT`, `SPONSOR`, `NON_COSPLAY`, `LOWRES`, `DUPLICATE` | `src/lib/reject-categories.ts`; migrasi `20261031000000_...` |
| “`MODESTY_OK` bukan reject reason” | Tidak ada kategori tersebut; jangan dipakai | `REJECT_CATEGORIES` tidak memuat `MODESTY_OK` |
| “Character/autocomplete dari database lokal” | Karakter/game diimpor ke SQLite kita, bukan LLM | `Character`/`Game` model, `GET /api/v1/characters`, `scripts/characters-import.ts` |
| “AUTH_MODE default keyed + demo flag eksplisit” | Default `required`; anonim hanya jika `ALLOW_ANONYMOUS_DEMO=true` | `src/lib/app-config.ts`, `src/lib/agent-auth.ts`, `src/app/api/mcp/route.ts`, `.env.example` |
| “Retensi default per role” | `video=180`, `cover=90`, `frame=14`, `pin=30`, `thumb=90`, `rejected=90` hari | `src/services/retention.ts`, seed di migrasi `20261031000000_...` |
| “Storage report” | Total/per role/per status/purgeable/proyeksi/disk | `GET /api/v1/storage/report`, `storageReport()` |
| “Dump grouping per role” | SQL 1 baris per CID; frame/pin di `arch_all.json` | `src/services/dump.ts` (`DumpItem.assets`) |
| “Bundle idempotent via UNIQUE(contentId, role, index)” | Duplikat → `200 { duplicate: true }` | `src/services/bundles.ts`, `POST /api/v1/bundles` |
| “agentId pada review” | Review AI menyimpan ID agent, bukan hanya nama | `src/app/api/v1/media/[id]/reviews/route.ts` |

### 2) Peta endpoint REST

| Method & path | Auth | Fungsi | Field kunci |
|---|---|---|---|
| `POST /api/v1/media/upload` | API key | Upload satu aset (multipart/JSON) | `content_id`, `role`, `index`, `needs_character_review` |
| `POST /api/v1/bundles` | API key | Upload satu bundle CID | `manifest`, `video`, `cover`, `frames[]` |
| `GET /api/v1/bundles/:cid` | — | Semua aset CID per role | `roles.video/cover/frames/pins/thumbs` |
| `POST /api/v1/bundles/:cid/publish-ref` | API key | Catat referensi publish | `youtube_video_id`, `zernio_post_id`, `external_refs` |
| `GET /api/v1/media/by-code/:code` | — | Lookup CID/UUID (1 aset atau grouping) | `?role=`, `?index=` |
| `GET /api/v1/characters` | — | Autocomplete karakter/game dari DB lokal | `?q=`, `?game=`, `?limit=` |
| `POST /api/v1/characters/import` | Admin | Impor/merge karakter pipeline | `characters[]`, `games[]` |
| `GET /api/v1/storage/report` | — | Laporan penyimpanan | `total`, `perRole`, `purgeable`, `disk` |
| `GET /api/v1/retention/policies` | Admin | Baca TTL per role | `roles`, `policies` |
| `POST /api/v1/retention/policies` | Admin | Ubah TTL | `role`, `retentionDays` |
| `POST /api/v1/retention/run` | Admin | Dry-run/purge | `?dry_run=true` atau `false` |
| `POST /api/v1/media/:id/reviews` | key opsional | Review manusia/AI | `rating`, `comment`, `timestamp_seconds` |
| `GET /api/v1/capabilities` | — | Auth mode, limit, tools MCP, fitur | — |
| `GET /api/v1/openapi` | — | Spesifikasi OpenAPI 3.1 | — |

> `—` berarti publik tanpa API key. Endpoint admin memakai cookie sesi admin (`wvr_admin`), bukan Bearer agent.

### 3) Peta tool MCP → REST

| Tool MCP | Padanan REST | Catatan untuk agent |
|---|---|---|
| `upload_media` | `POST /api/v1/media/upload` | Satu aset; isi `role`/`index` bila bukan video utama |
| `upload_bundle` | `POST /api/v1/bundles` | Gunakan ini untuk video + cover + frames |
| `get_bundle` | `GET /api/v1/bundles/:cid` | Hasil dikelompokkan per role |
| `check_cid` | `GET /api/v1/media/by-code/:code` | Cek sebelum upload; CID-first |
| `get_review_result` | `GET /api/v1/media/by-code/:code` | Bila multi-aset, video dikembalikan default |
| `check_duplicate` | `GET /api/v1/media/check-duplicate?hash=` | Fallback SHA-256, bukan pengganti CID |
| `storage_report` | `GET /api/v1/storage/report` | Panggil sebelum batch besar |
| `submit_review` | `POST /api/v1/media/:id/reviews` | Rating 1–10 |
| `get_system_metrics` | `GET /api/v1/metrics/storage` | Metrik lama; `storage_report` lebih lengkap |

### 4) Peta istilah teks → field database

| Teks/spesifikasi | Field DB | Tipe/nilai | Keterangan |
|---|---|---|---|
| CID / `content_id` | `Media.contentId` | string? | Unik per kombinasi role/index |
| `role` | `Media.role` | `video`, `cover`, `frame`, `pin`, `thumb` | Default `video` |
| `index` | `Media.index` | int ≥ 0 | Default `0` |
| `character` | `Media.characterName` | string? | Diisi owner saat review |
| `character_candidates` | `Media.characterCandidates` | JSON array (string) | Saran dari pipeline |
| `game` | `Media.game` | string? | Game/anime |
| `creator.name` / `creator.sec_uid` | `Media.creatorName` / `creatorSecUid` | string? | Metadata sumber |
| `source_url` / `source_platform` | `Media.sourceUrl` / `sourcePlatform` | string? | `douyin`/`tiktok` |
| `playlist_id` / `pinterest_board` | `Media.playlistId` / `pinterestBoard` | string? | Konteks sumber |
| `vision_verdict` | `Media.visionVerdict` | string? | `PASS_CLEAN` dll. |
| `pipeline_stage` | `Media.pipelineStage` | `intake`, `gated`, `scheduled`, `published`, `archived` | Default `intake` |
| `external_refs` | `Media.externalRefs` | JSON string | Referensi publish |
| `published_at` | `Media.publishedAt` | DateTime? | Diisi saat publish-ref |
| `purge_at` | `Media.purgeAt` | DateTime? | Dihitung retensi |
| `phash` | `Media.phash` | string? | Untuk dedup visual mendatang |
| `category` | `Media.rejectCategory` | enum uppercase | Folder lowercase |

### 5) Peta artefak dump → sumber data

| Artefak | Bentuk | Sumber di staging |
|---|---|---|
| `nextgen_cosplay.sql` | Tabel `contents`, **1 baris per CID** | Primary asset: `video` → fallback `cover`/role lain |
| `contents.content_id` | TEXT PK | `Media.contentId` (fallback `Media.id`) |
| `contents.douyin_url` | TEXT | Dibentuk dari CID 15–25 digit |
| `contents.title_original` | TEXT | `Media.title` primary |
| `contents.duration_ms` | INTEGER | `Media.durationSeconds × 1000` |
| `contents.game_raw` / `character_raw` | TEXT | `game` + hasil parse `characterName` |
| `contents.creator_raw` / `creator` | TEXT | `NULL` (tidak dilacak staging) |
| `arch_all.json` | `{ items: [...] }` per CID | Item utama + `assets[]` seluruh role/index |
| `arch_all.items[].assets[]` | `{ role, index, wvr_id, media_type, width, height, duration_ms }` | Seluruh aset bundle |
| `cid_overrides.json` | `{ cid_overrides: { CID: { en, game, cn, note } } }` | `characterName` + `reviewNote` |
| `manifest.json` | counts | `total` (CID), `assets`, `videos`, `images`, `files_copied` |

### 6) Peta status → perilaku file

| Status | File di disk | Bisa diunduh? | Ikut dump? | Aksi agent |
|---|---|---|---|---|
| `APPROVED` | Ada di `uploads/` | Ya | Ya | Siap handoff |
| `PENDING_REVIEW` | Ada di `uploads/` | Ya | **Tidak** | Polling review |
| `REJECTED` | Di `rejected/<kategori>/` | Hanya admin | **Tidak** | Berhenti; baca alasan |
| `ARCHIVED` | **Dihapus** | Tidak | Tidak | Jangan retry; metadata saja |

### 7) Peta error → tindakan

| Respons | Arti | Tindakan agent |
|---|---|---|
| `401` | API key tidak ada/invalid | Kirim `Authorization: Bearer avr_...` yang valid |
| `422` | Manifest/role/index/parameter tidak valid | Perbaiki payload; cek enum role & tipe index |
| `409` / `duplicate: true` | Kombinasi CID+role+index sudah ada | Pakai `mediaId` yang dikembalikan; jangan duplikasi |
| `429` | Rate limit / kuota anonim | Backoff eksponensial; daftarkan agent ber-key |
| `404` | CID/aset tidak ditemukan | Cek `check_cid`/`by-code`; jangan asumsikan sukses |
| `ARCHIVED` pada lookup | File sudah di-purge retensi | Gunakan metadata; minta owner bila butuh file |

### 8) Cakupan Fase A vs yang ditunda

| Sudah diimplementasikan (Fase A) | Ditunda (Fase B–D) |
|---|---|
| Bundle multi-role + idempotensi | Orchestrasi publish lintas platform |
| Retensi TTL + storage report + UI | Penjadwalan otomatis & alert proaktif lanjutan |
| Karakter/game dari DB lokal + impor | Sinkronisasi dua arah dengan DB pipeline |
| Enum reject paritas pipeline | Analitik kualitas/vision lanjutan |
| Auth keyed + MCP keyed | SSO/OAuth multi-user |
| Dump grouping per role | Rekonsiliasi otomatis hasil publish |

### 9) Alur agent langkah demi langkah (dengan panggilan nyata)

| Langkah | Panggilan | Kondisi lanjut |
|---|---|---|
| 1. Cek identitas | `check_cid` / `GET /api/v1/media/by-code/:cid` | Jika `exists=false` → upload penuh; jika sebagian ada → upload role yang kurang |
| 2. Kirim bundle | `upload_bundle` / `POST /api/v1/bundles` | `created > 0` → lanjut; `duplicate: true` → pakai `mediaId` lama |
| 3. Tandai ragu karakter | `manifest.needs_character_review=true` | Status `PENDING_REVIEW` → polling |
| 4. Polling review | `get_review_result` / `by-code` tiap 5–15 menit | `pending=false` → baca `character_name`/`status` |
| 5. Tangani penolakan | Baca `reject_category` + `reject_reason` | `REJECTED` → stop, jangan upload ulang |
| 6. Cek kapasitas | `storage_report` sebelum batch berikutnya | `disk.freeBytes` aman |
| 7. Handoff | Owner jalankan `npm run dump` / `/admin/dump` | Hanya `APPROVED` yang ikut |
| 8. Catat publish | `POST /api/v1/bundles/:cid/publish-ref` | `pipelineStage=published`, `externalRefs` terisi |

---

## 📦 Snapshot & Dump Data (Handoff Pipeline)

Koleksi media yang berstatus `APPROVED` dapat di-dump menjadi paket snapshot yang kompatibel dengan `nextgen_cosplay_pipeline`:

```bash
# Dump metadata (nextgen_cosplay.sql, arch_all.json, cid_overrides.json)
npm run dump

# Dump metadata + arsip file biner video/gambar (.zip)
npm run dump -- --files
```
Paket dump juga dapat di-trigger dan diunduh langsung dari UI Admin di `/admin/dump`. SQL berisi **satu baris per CID** (video sebagai primary), sedangkan `arch_all.json` memuat `assets[]` untuk seluruh role/index.

---

## 🧹 Retensi & Laporan Penyimpanan

Storage lokal adalah sumber utama. File dihapus setelah TTL, tetapi record tetap ada sebagai `ARCHIVED` (zero-delete).

| Role | TTL default |
|---|---|
| `video` | 180 hari |
| `cover` | 90 hari |
| `frame` | 14 hari |
| `pin` | 30 hari |
| `thumb` | 90 hari |
| `rejected` | 90 hari |

* **UI**: `/admin/storage` — laporan disk, edit TTL, dry-run & purge.
* **API**: `GET /api/v1/storage/report`, `GET/POST /api/v1/retention/policies`, `POST /api/v1/retention/run?dry_run=true|false`.
* **CLI**: `npm run retention:run` (dry-run) / `npm run retention:run -- --apply`.
* **Karakter/game autocomplete**: `npm run characters:import -- --db /path/nextgen_cosplay.db` (atau `--json`), lalu `GET /api/v1/characters?q=`. Sumber data adalah database lokal, bukan panggilan LLM.

---

## 🗑️ Rejected — Karantina Zero-Delete (Terpisah dari Dump)

Media yang **ditolak** tidak dihapus. File fisiknya dipindahkan ke `rejected/<kategori>/<YYYY-MM>/` dan tetap bisa dipulihkan:

| Kategori | Arti |
|---|---|
| `DIRTY_TEXT` | Ada teks kotor/subtitle yang tidak diinginkan |
| `SKIT` | Video skit/bercerita, bukan showcase cosplay |
| `SPONSOR` | Mengandung sponsor/iklan |
| `NON_COSPLAY` | Bukan konten cosplay / di luar cakupan |
| `LOWRES` | Resolusi di bawah standar |
| `DUPLICATE` | Duplikat konten lain |

> `MODESTY_OK` **bukan** alasan penolakan. Folder karantina memakai slug lowercase (`dirty_text`, `skit`, `sponsor`, `non_cosplay`, `lowres`, `duplicate`), sedangkan database menyimpan enum uppercase.

* **UI**: `/admin/rejected` — statistik per kategori, tombol **Restore**, dan **Hapus permanen** (wajib mengetik CID).
* **Bulk**: centang beberapa media di `/admin/media` → pilih kategori + alasan → *Karantina terpilih*.
* **API**: `POST /api/admin/media/:id/reject` `{ category, reason }`, `POST /api/admin/media/:id/restore`, `POST /api/admin/rejected` `{ ids[], category, reason }`, `DELETE /api/admin/rejected/:id` `{ confirm }`.
* **Agent**: `get_review_result` / `GET /api/v1/media/by-code/:code` mengembalikan `reject_category`, `reject_reason`, `rejected_at`.
* Media `REJECTED` **tidak ikut** dump (dump hanya mengambil `APPROVED`).

---

## ☁️ Google Drive Opsional (rclone)

Storage utama tetap **lokal**. Jika ingin salinan ke Google Drive, gunakan rclone — bukan storage primary:

```bash
# 1) Konfigurasi remote sekali (interaktif)
rclone config          # buat remote bernama "gdrive"

# 2) Set di .env
RCLONE_REMOTE="gdrive:featherduster"
RCLONE_SYNC_TARGETS="backups,dumps,rejected"

# 3) Restart server, lalu buka /admin/backups → "Sinkronisasi Google Drive"
```

* Perintah yang dipakai: `rclone copy` (additive) — **tidak pernah menghapus** file di remote.
* Tombol **Simulasi (dry-run)** dan **Sync sekarang** tersedia di `/admin/backups`.
* API: `GET/POST /api/admin/backups/sync` (body `{ targets?, dryRun? }`).
* Bila `RCLONE_REMOTE` kosong, fitur otomatis nonaktif dan UI menampilkan cara mengaktifkannya.

---

## 🌐 Akses Online lewat Cloudflare

Ingin galeri dan MCP Anda bisa diakses dari HP atau AI agent remote di internet?

```bash
# Terminal 1: Nyalakan server
npm run dev

# Terminal 2: Buka jalur tunnel HTTPS gratis
npm run tunnel
```
Script akan memberikan URL HTTPS publik (contoh: `https://xxxx.trycloudflare.com`) yang langsung dapat ditempelkan ke klien AI remote atau ChatGPT Custom GPT Actions.

---

## 🐳 Deployment Produksi (Docker)

Platform ini siap dijalankan secara mandiri di VPS menggunakan Docker:

```bash
copy .env.example .env
docker compose up -d --build
```
* **Database & Uploads Terlindungi**: Disimpan di volume persisten `./data` dan `./uploads`.
* **Migrasi Otomatis**: Schema database diperbarui otomatis saat container dinyalakan.

---

## 📁 Struktur Direktori

```text
web-vid-review/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Galeri utama (Masonry grid)
│   │   ├── media/[id]/            # Player video, inspector & formulir review
│   │   ├── compare/               # Antarmuka A/B Comparison (slider & sync video)
│   │   ├── share/[token]/         # Halaman publik media/koleksi yang dibagikan
│   │   ├── admin/                 # Panel admin: review, media, rejected, dump, storage
│   │   └── api/                   # REST /api/v1, OpenAPI, SSE, MCP /api/mcp
│   ├── services/
│   │   ├── bundles.ts             # createBundle/getBundle/setPublishRefs (idempoten)
│   │   ├── retention.ts           # TTL per role, purge→ARCHIVED, storage report
│   │   ├── quarantine.ts          # reject/restore/hard delete (zero-delete)
│   │   ├── dump.ts                # handoff: 1 baris SQL per CID + assets[]
│   │   ├── remote-sync.ts         # salinan opsional via rclone (additive)
│   │   ├── intelligence.ts        # heuristik auto-tag/NSFW (tanpa LLM)
│   │   ├── backup.ts, media-ops.ts, metrics.ts, search.ts, votes.ts
│   ├── lib/
│   │   ├── ingestion.ts           # intake + CID-first dedup + MediaAudit
│   │   ├── media-role.ts          # normalisasi role/index
│   │   ├── reject-categories.ts   # enum & folder karantina paritas pipeline
│   │   ├── app-config.ts          # AUTH_MODE default required + demo flag
│   │   ├── agent-auth.ts          # resolveAgent/Bearer API key
│   │   ├── events.ts              # EventLog + SSE (alert deterministik)
│   │   └── paths.ts, http.ts, rate-limit.ts
│   └── mcp/                       # registry tools MCP (bundles, storage, review)
├── prisma/
│   ├── schema.prisma              # Media multi-role, Character, Game, MediaAudit
│   └── migrations/
│       └── 20261031000000_add_multiasset_roles_pipeline_fields/
├── scripts/
│   ├── characters-import.ts       # npm run characters:import -- --db <pipeline.db>
│   ├── retention-run.ts           # npm run retention:run [-- --apply]
│   ├── dump.ts                    # npm run dump [-- --files]
│   ├── create-agent.mjs           # npm run agent:create -- "Nama Agent"
│   ├── mcp-bridge.ts              # MCP stdio lokal
│   └── backup.mjs, tunnel.mjs
├── uploads/                       # Penyimpanan lokal berkas media asli & thumbnail
├── rejected/                      # Karantina media ditolak (zero-delete, per kategori)
├── dumps/                         # Snapshot handoff ke nextgen_cosplay_pipeline
├── backups/                       # Arsip backup metadata/full
└── docker-compose.yml             # Konfigurasi container produksi
```

---

## 📄 Lisensi

Didistribusikan di bawah lisensi **MIT**. Bebas digunakan, dimodifikasi, dan dikembangkan untuk proyek pribadi maupun komersial.
