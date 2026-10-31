# Panduan AI Agent: Integrasi Staging Hub (`featherduster`)

Dokumen ini ditujukan untuk **AI Agent** (Claude, Cursor, ChatGPT, Antigravity, skrip otomasi pipeline) yang berinteraksi dengan `web-vid-review` (`featherduster`).

Platform ini berfungsi sebagai **Transit & Staging Hub** lokal sebelum media diproses lebih lanjut oleh `nextgen_cosplay_pipeline` atau didistribusikan. Platform ini **bukan** tempat publish langsung ke YouTube/TikTok.

---

## 🧭 Prinsip Utama

1. **Local-First & Zero-Delete**: Media disimpan di storage lokal (`uploads/`). Konten tidak sembarangan dihapus permanen; penolakan masuk karantina/dump.
2. **Kunci Dedup = `content_id` (CID) + `role` + `index`**: Setiap video/gambar dari DTK/pipeline memiliki kode identifikasi (contoh: `DTK_VIDEO_1092`, `cosplay_20261029_01`). Satu CID dapat memiliki beberapa aset: `video`, `cover`, `frame`, `pin`, `thumb`. Platform mendeteksi duplikat berdasarkan kombinasi tersebut; SHA-256 hanya fallback untuk aset tanpa CID.
3. **Default Status = `APPROVED`**: Media yang diunggah langsung disetujui (siap diproses/dump) **kecuali** di-flag eksplisit.
4. **Antrean Review Karakter**: Jika agent ragu terhadap nama karakter game/anime pada media, kirim `needs_character_review: true`. Status otomatis menjadi `PENDING_REVIEW` dan masuk antrean review manusia di `/admin/review`.
5. **Tanpa Webhook (Polling Pola)**: Agent mengambil hasil review manusia dengan cara melakukan polling ke endpoint `get_review_result` (MCP) atau `GET /api/v1/media/by-code/:code` (REST).

---

## 🔄 Alur Kerja End-to-End (Lifecycle)

```text
[AI Agent / Scraper / Generator]
               │
               ▼ (1) Upload + content_id
   ┌───────────────────────┐
   │ needs_character_review?│
   └───────────┬───────────┘
         No    │        Yes
         ┌─────┴─────────────┐
         ▼                   ▼
  Status: APPROVED    Status: PENDING_REVIEW
         │                   │
         │             (2) Owner Review di /admin/review
         │                 (Mengisi characterName & APPROVED)
         │                   │
         │             (3) Agent Poll via get_review_result(CID)
         │                   │
         └─────────┬─────────┘
                   ▼
     (4) Siap Masuk Dump Snapshot
     (nextgen_cosplay.sql, arch_all.json, cid_overrides.json)
                   │
                   ▼
     (5) Diambil oleh nextgen_cosplay_pipeline
```

Cabang penolakan: bila owner menolak, media berpindah ke `rejected/<kategori>/`
(karantina zero-delete, terpisah dari dump) dan agent melihat `status: REJECTED`
beserta `reject_category` + `reject_reason` saat polling.

---

## 🛠️ Integrasi via MCP (Model Context Protocol)

MCP server dapat diakses melalui:
- **HTTP Streamable**: `http://localhost:3000/api/mcp` — sertakan `Authorization: Bearer avr_...` (default `AUTH_MODE=required`)
- **Stdio Bridge**: `npm run mcp:bridge` — lokal, akses DB langsung tanpa lewat HTTP

### 1. Upload Konten (`upload_media`)

Gunakan tool `upload_media`. Pastikan menyertakan `content_id` dan `needs_character_review` jika identifikasi karakter masih belum yakin.

#### Contoh Parameter Input:
```json
{
  "source_type": "file_path",
  "source": "/tmp/opencode/pipeline/work/render_01092.mp4",
  "title": "Raiden Shogun Katana Stance",
  "content_id": "DTK_VIDEO_1092",
  "needs_character_review": true,
  "agent_name": "DTK_Ingest_Bot",
  "tags": ["genshin_impact", "inazuma", "cosplay", "4k"],
  "prompt_used": "1girl, raiden shogun, purple hair, glowing katana, cinematic lighting"
}
```

#### Contoh Respon (Masuk Antrean Review):
```json
{
  "id": "cbf32890-410a-4da2-a42e-d0092c68fae1",
  "content_id": "DTK_VIDEO_1092",
  "duplicate": false,
  "status": "PENDING_REVIEW",
  "review_kind": "CHARACTER",
  "url": "http://localhost:3000/media/cbf32890-410a-4da2-a42e-d0092c68fae1"
}
```

> Untuk satu CID dengan banyak aset (video + cover + frame/pin), gunakan tool `upload_bundle` — idempoten per `(content_id, role, index)`. Cek CID lebih dulu dengan `check_cid`, ambil bundle dengan `get_bundle`, dan pantau disk dengan `storage_report`.

### 2. Polling Hasil Review Karakter (`get_review_result`)

Setelah status `PENDING_REVIEW`, admin manusia akan mengidentifikasi karakter di `/admin/review`. Agent dapat melakukan cek berkala (misal tiap 5-15 menit) menggunakan CID atau UUID media.

#### Input:
```json
{
  "code": "DTK_VIDEO_1092"
}
```

#### Respon Saat Belum Direview (`pending: true`):
```json
{
  "id": "cbf32890-410a-4da2-a42e-d0092c68fae1",
  "content_id": "DTK_VIDEO_1092",
  "status": "PENDING_REVIEW",
  "review_kind": "CHARACTER",
  "character_name": null,
  "review_note": null,
  "reviewed_at": null,
  "pending": true
}
```

#### Respon Setelah Direview (`pending: false`):
```json
{
  "id": "cbf32890-410a-4da2-a42e-d0092c68fae1",
  "content_id": "DTK_VIDEO_1092",
  "status": "APPROVED",
  "review_kind": "CHARACTER",
  "character_name": "Raiden Shogun (Genshin Impact)",
  "review_note": "Konfirmasi kostum Musou Isshin, valid.",
  "reviewed_at": "2026-10-29T15:20:00.000Z",
  "pending": false
}
```

#### Respon Bila Ditolak (masuk karantina):
```json
{
  "id": "cbf32890-410a-4da2-a42e-d0092c68fae1",
  "content_id": "DTK_VIDEO_1092",
  "status": "REJECTED",
  "character_name": null,
  "review_note": null,
  "reject_category": "lowres",
  "reject_reason": "Resolusi di bawah standar minimum",
  "rejected_at": "2026-10-29T16:02:00.000Z",
  "pending": false
}
```
> Saat `status = REJECTED`, **jangan** kirim ulang media yang sama. File dipindahkan ke `rejected/<kategori>/` (zero-delete) dan tidak ikut dump. Kategori (paritas pipeline): `DIRTY_TEXT`, `SKIT`, `SPONSOR`, `NON_COSPLAY`, `LOWRES`, `DUPLICATE`. `MODESTY_OK` bukan alasan penolakan.

---

## 🌐 Integrasi via REST API

Semua endpoint berakar pada `/api/v1`. Default `AUTH_MODE=required`: kirim `Authorization: Bearer avr_...` (buat key di `/admin/agents`). Header `x-agent-name` hanya berlaku bila demo anonim diaktifkan eksplisit (`ALLOW_ANONYMOUS_DEMO=true`).

### 1. Upload Media (Multipart Form Data)

```bash
curl -X POST http://localhost:3000/api/v1/media/upload \
  -H "Authorization: Bearer avr_xxx" \
  -F "file=@/path/to/video.mp4" \
  -F "title=Yae Miko Shrine Dance" \
  -F "content_id=DTK_VIDEO_1093" \
  -F "needs_character_review=true" \
  -F "tags=genshin,cosplay,4k" \
  -F "prompt=yae miko kitsune shrine priestess"
```

### 2. Upload Media via JSON (Download URL / Server Local Path)

```bash
curl -X POST http://localhost:3000/api/v1/media/upload \
  -H "Authorization: Bearer avr_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "source_path": "/var/data/renders/video_1094.mp4",
    "title": "Acheron Honkai Star Rail",
    "content_id": "DTK_VIDEO_1094",
    "needs_character_review": false,
    "tags": ["hsr", "acheron"]
  }'
```

### 3. Upload Bundle (satu CID, banyak aset)

Untuk video + cover + frame dalam satu CID, gunakan endpoint bundle. Operasi ini idempoten per `(content_id, role, index)` — kirim ulang tidak membuat baris baru (`duplicate: true`).

```bash
curl -X POST http://localhost:3000/api/v1/bundles \
  -H "Authorization: Bearer avr_xxx" \
  -F 'manifest={"content_id":"DTK_VIDEO_1095","title":"Acheron","character":"Acheron","game":"Honkai: Star Rail","needs_character_review":true}' \
  -F "video=@/path/to/video.mp4" \
  -F "cover=@/path/to/cover.jpg" \
  -F "frames=@/path/to/frame_1.jpg" \
  -F "frames=@/path/to/frame_2.jpg"
```

Ambil kembali seluruh aset satu CID (dikelompokkan per role):

```bash
curl http://localhost:3000/api/v1/bundles/DTK_VIDEO_1095
```

Catat referensi publish setelah pipeline mempublikasikan (bukan publish dari service ini):

```bash
curl -X POST http://localhost:3000/api/v1/bundles/DTK_VIDEO_1095/publish-ref \
  -H "Authorization: Bearer avr_xxx" \
  -H "Content-Type: application/json" \
  -d '{"youtube_video_id":"abc123","zernio_post_id":"z-42"}'
```

### 4. Lookup & Polling via REST (`GET /api/v1/media/by-code/:code`)

Endpoint ini menerima parameter `:code` berupa `content_id` (CID) maupun UUID `id`. Tanpa query, satu aset dikembalikan sebagai objek; bila CID punya banyak aset, respons dikelompokkan per role (`roles.video`, `roles.cover`, `roles.frames`, `roles.pins`, `roles.thumbs`). Gunakan `?role=frame&index=2` untuk aset presisi.

```bash
curl "http://localhost:3000/api/v1/media/by-code/DTK_VIDEO_1092?role=video"
```

Respon memuat status media, objek `agent`, relasi `tags`, dan riwayat `reviews`:
```json
{
  "id": "cbf32890-410a-4da2-a42e-d0092c68fae1",
  "contentId": "DTK_VIDEO_1092",
  "title": "Raiden Shogun Katana Stance",
  "status": "APPROVED",
  "reviewKind": "CHARACTER",
  "characterName": "Raiden Shogun (Genshin Impact)",
  "reviewNote": "Konfirmasi kostum Musou Isshin, valid.",
  "reviewedAt": "2026-10-29T15:20:00.000Z",
  "storagePath": "uploads/2026-10/video_xxxx.mp4",
  "fileHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "reviews": []
}
```

---

## 🧹 Retensi & Penyimpanan (Local-First)

File adalah sumber utama dan disimpan di disk lokal. Retensi berjalan per role:

| Role | TTL default |
| --- | --- |
| `video` | 180 hari |
| `cover` | 90 hari |
| `frame` | 14 hari |
| `pin` | 30 hari |
| `thumb` | 90 hari |
| `rejected` | 90 hari |

- `GET /api/v1/storage/report` — total, per role/status, byte yang bisa di-purge, proyeksi 30 hari, kapasitas disk.
- `GET/POST /api/v1/retention/policies` — baca/ubah TTL (admin).
- `POST /api/v1/retention/run?dry_run=true|false` — default dry-run; purge menghapus file tetapi metadata tetap `ARCHIVED` (zero-delete).
- CLI: `npm run retention:run` (dry-run) atau `npm run retention:run -- --apply`.
- UI: `/admin/storage`.

Karakter & game untuk autocomplete berasal dari **database lokal**: impor sekali dengan `npm run characters:import -- --db /path/nextgen_cosplay.db` (atau `--json`), lalu akses via `GET /api/v1/characters?q=`.

---

## 📦 Snapshot & Dump Data (Handoff ke Pipeline)

Setelah media terkurasi berstatus `APPROVED`, data disiapkan untuk handoff ke `nextgen_cosplay_pipeline`.

1. **CLI Dump Tool**:
   ```bash
   # Dump metadata saja (cepat)
   npm run dump

   # Dump metadata + file biner video/gambar (.zip)
   npm run dump -- --files
   ```
2. **Isi Berkas Snapshot Dump**:
   - `nextgen_cosplay.sql`: satu baris `contents` **per CID** (aset `video` sebagai primary; fallback `cover`/role lain bila tidak ada video).
   - `arch_all.json`: `{"items": [...]}` per CID dengan field `assets[]` berisi seluruh role/index (frame/pin/thumb) untuk audit.
   - `cid_overrides.json`: Mapping CID ke nama karakter (`{ "DTK_VIDEO_1092": { "en": "Raiden Shogun", "game": "Genshin Impact" } }`) untuk dimerge ke kamus pipeline `data/characters.json`.
   - `manifest.json`: total CID, jumlah aset, dan jumlah file yang disalin.

---

## ⚠️ Pedoman Penanganan Galat & Edge Cases

1. **Duplikat Terdeteksi (`duplicate: true`)**:
   - Kunci dedup adalah `(content_id, role, index)`. Bila kombinasi itu sudah ada, server mengembalikan aset yang ada (`duplicate: true`) tanpa baris baru. SHA-256 hanya dipakai bila tidak ada CID.
   - Agent **tidak perlu panik**, cukup catat `duplicate: true` dan gunakan `id` yang dikembalikan.
2. **Kapasitas Disk**:
   - Sebelum mengunggah kumpulan media besar, jalankan MCP tool `storage_report` (atau `get_system_metrics`) / REST `GET /api/v1/storage/report`.
   - Pastikan kapasitas tersisa aman (total volume staging dibatasi ~47GB).
3. **Format Karakter yang Diharapkan**:
   - Reviewer biasanya mengisi `Nama Karakter (Nama Game)` atau `Nama Karakter - Nama Game`.
   - Generator dump otomatis mengekstrak format ini menjadi objek terstruktur `{ en, game }`.
4. **Sinkronisasi Remote (opsional)**:
   - Owner dapat menyalin `backups/`, `dumps/`, dan `rejected/` ke Google Drive via rclone.
   - Agent tidak perlu memanggilnya; ini aksi admin di `/admin/backups`.
