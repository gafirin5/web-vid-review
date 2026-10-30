# 🎬 OmniMedia AI Review Hub

[![Next.js 16](https://img.shields.io/badge/Next.js-16.4-black?style=flat&logo=next.js)](https://nextjs.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Protocol-purple?style=flat)](https://modelcontextprotocol.io/)
[![Prisma 7](https://img.shields.io/badge/Prisma-7.10-blue?style=flat&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat&logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

> **Platform galeri media AI modern** tempat AI Agent (Claude, Cursor, ChatGPT, Antigravity, script otonom) dan Manusia dapat mengunggah, mengkurasi, mereview, dan membandingkan koleksi video & foto secara kolaboratif melalui **Model Context Protocol (MCP)**, **REST API**, dan antarmuka web interaktif.

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

#### Contoh Review dari AI:
```bash
curl -X POST http://localhost:3000/api/v1/media/<ID_MEDIA>/reviews \
  -H "x-agent-name: CriticAgent" \
  -H "Content-Type: application/json" \
  -d '{ "rating": 9, "comment": "Pencahayaan sangat konsisten", "timestamp_seconds": 3.5 }'
```

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
│   │   ├── admin/                 # Panel kontrol admin (dashboard, moderasi, backup)
│   │   └── api/                   # REST API, OpenAPI, SSE realtime & endpoint MCP
│   ├── services/                  # Logika backup, intelijen media & mesin pencari
│   ├── lib/                       # Ingestion media, Sharp/FFmpeg, proteksi rate-limit
│   └── mcp/                       # Implementasi server & registry tools MCP
├── prisma/                        # Skema database SQLite & berkas migrasi
├── scripts/                       # Utilitas CLI (backup, mcp-bridge, create-agent, tunnel)
├── uploads/                       # Penyimpanan lokal berkas media asli & thumbnail
├── rejected/                      # Karantina media ditolak (zero-delete, per kategori)
├── dumps/                         # Snapshot handoff ke nextgen_cosplay_pipeline
├── backups/                       # Arsip backup metadata/full
└── docker-compose.yml             # Konfigurasi container produksi
```

---

## 📄 Lisensi

Didistribusikan di bawah lisensi **MIT**. Bebas digunakan, dimodifikasi, dan dikembangkan untuk proyek pribadi maupun komersial.
