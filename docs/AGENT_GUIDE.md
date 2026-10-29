# Panduan AI Agent: Integrasi Staging Hub (`featherduster`)

Dokumen ini ditujukan untuk **AI Agent** (Claude, Cursor, ChatGPT, Antigravity, skrip otomasi pipeline) yang berinteraksi dengan `web-vid-review` (`featherduster`).

Platform ini berfungsi sebagai **Transit & Staging Hub** lokal sebelum media diproses lebih lanjut oleh `nextgen_cosplay_pipeline` atau didistribusikan. Platform ini **bukan** tempat publish langsung ke YouTube/TikTok.

---

## 🧭 Prinsip Utama

1. **Local-First & Zero-Delete**: Media disimpan di storage lokal (`uploads/`). Konten tidak sembarangan dihapus permanen; penolakan masuk karantina/dump.
2. **Kunci Dedup = `content_id` (CID)**: Setiap video/gambar dari DTK/pipeline memiliki kode identifikasi (contoh: `DTK_VIDEO_1092`, `cosplay_20261029_01`). Platform akan mendeteksi duplikat berdasarkan CID terlebih dahulu, fallback ke SHA-256 file hash.
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

---

## 🛠️ Integrasi via MCP (Model Context Protocol)

MCP server dapat diakses melalui:
- **HTTP SSE**: `http://localhost:3000/api/mcp`
- **Stdio Bridge**: `npm run mcp:bridge`

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

---

## 🌐 Integrasi via REST API

Semua endpoint berakar pada `/api/v1`. Jika mode auth terbuka (`AUTH_MODE=open`), gunakan header `x-agent-name` untuk atribusi agent tanpa registrasi API key.

### 1. Upload Media (Multipart Form Data)

```bash
curl -X POST http://localhost:3000/api/v1/media/upload \
  -H "x-agent-name: PipelineStagingAgent" \
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
  -H "x-agent-name: PipelineStagingAgent" \
  -H "Content-Type: application/json" \
  -d '{
    "source_path": "/var/data/renders/video_1094.mp4",
    "title": "Acheron Honkai Star Rail",
    "content_id": "DTK_VIDEO_1094",
    "needs_character_review": false,
    "tags": ["hsr", "acheron"]
  }'
```

### 3. Lookup & Polling via REST (`GET /api/v1/media/by-code/:code`)

Endpoint ini menerima parameter `:code` berupa `content_id` (CID) maupun UUID `id`.

```bash
curl http://localhost:3000/api/v1/media/by-code/DTK_VIDEO_1092
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
   - `nextgen_cosplay.sql`: Skrip SQL `INSERT INTO contents ...` kompatibel dengan database pipeline.
   - `arch_all.json`: Ringkasan indeks arsip media `{"items": [...]}`.
   - `cid_overrides.json`: Mapping CID ke nama karakter (`{ "DTK_VIDEO_1092": { "en": "Raiden Shogun", "game": "Genshin Impact" } }`) untuk dimerge ke kamus pipeline `data/characters.json`.
   - `manifest.json`: Checksum SHA-256 dan total media dalam paket dump.

---

## ⚠️ Pedoman Penanganan Galat & Edge Cases

1. **Duplikat Terdeteksi (`duplicate: true`)**:
   - Jika CID atau file hash sudah ada di database, server mengembalikan record media yang sudah ada dengan HTTP 201 (atau pesan MCP `Duplicate detected`).
   - Agent **tidak perlu panik**, cukup catat `duplicate: true` dan gunakan `id` yang dikembalikan.
2. **Kapasitas Disk**:
   - Sebelum mengunggah kumpulan media besar, jalankan MCP tool `get_system_metrics` atau cek REST endpoint `GET /api/v1/metrics/storage`.
   - Pastikan kapasitas tersisa aman (total volume staging dibatasi ~47GB).
3. **Format Karakter yang Diharapkan**:
   - Reviewer biasanya mengisi `Nama Karakter (Nama Game)` atau `Nama Karakter - Nama Game`.
   - Generator dump otomatis mengekstrak format ini menjadi objek terstruktur `{ en, game }`.
