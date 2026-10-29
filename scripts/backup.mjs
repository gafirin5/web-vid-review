#!/usr/bin/env node
/**
 * CLI backup untuk web-vid-review.
 *
 * Usage:
 *   npm run backup                        (metadata snapshot)
 *   npm run backup -- full                (database + semua file media)
 *   npm run backup -- full "catatan"      (dengan catatan)
 */
import fs from "node:fs";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");

const mode = process.argv[2] === "full" ? "full" : "metadata";
const notes = process.argv[3] ?? null;

const root = process.cwd();

// Load DATABASE_URL from .env
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const dbFile = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
const dbPath = path.resolve(root, dbFile);
const uploadsDir = path.join(root, "uploads");
const backupsDir = path.join(root, "backups");
fs.mkdirSync(backupsDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const fileName = `backup_${mode}_${ts}.zip`;
const outPath = path.join(backupsDir, fileName);

const manifest = {
  type: "wvr-backup.json",
  app: "web-vid-review",
  version: "1.1.0",
  mode,
  createdAt: new Date().toISOString(),
  notes,
};

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

const output = createWriteStream(outPath);
const zip = new ZipArchive({ zlib: { level: mode === "full" ? 6 : 9 } });

output.on("close", () => {
  const size = fs.statSync(outPath).size;
  console.log(`✅ Backup selesai: ${fileName}`);
  console.log(`   Mode: ${mode} · Ukuran: ${formatBytes(size)}`);
  console.log(`   Lokasi: ${outPath}`);
});

zip.on("error", (err) => {
  console.error("❌ Backup gagal:", err.message);
  process.exit(1);
});

zip.pipe(output);
zip.append(JSON.stringify(manifest, null, 2), { name: "wvr-backup.json" });
zip.file(dbPath, { name: "database.db" });
if (mode === "full") {
  zip.directory(uploadsDir, "uploads");
}
zip.finalize().catch((err) => {
  console.error("❌ Backup gagal:", err.message);
  process.exit(1);
});
