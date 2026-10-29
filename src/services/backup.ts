import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { ZipArchive } from "archiver";
import extract from "extract-zip";
import { db } from "@/db/client";
import { PROJECT_ROOT, UPLOADS_ROOT, ensureUploadDirs } from "@/lib/paths";
import { publishEvent } from "@/lib/events";

export const BACKUPS_DIR = path.join(PROJECT_ROOT, "backups");
const MANIFEST_NAME = "wvr-backup.json";

export type BackupMode = "metadata" | "full";

export interface BackupInfo {
  fileName: string;
  mode: BackupMode;
  sizeBytes: number;
  createdAt: string;
  notes?: string;
}

export function dbFilePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const rel = url.replace(/^file:/, "");
  return path.resolve(PROJECT_ROOT, rel);
}

export function backupName(mode: BackupMode, date = new Date()): string {
  const ts = date
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  return `backup_${mode}_${ts}.zip`;
}

/** Buat backup baru. Mode "metadata" = DB saja; "full" = DB + seluruh file media. */
export async function createBackup(
  mode: BackupMode,
  notes?: string
): Promise<BackupInfo> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  const fileName = backupName(mode);
  const absOut = path.join(BACKUPS_DIR, fileName);

  const manifest = {
    type: MANIFEST_NAME,
    app: "web-vid-review",
    version: "1.1.0",
    mode,
    createdAt: new Date().toISOString(),
    notes: notes ?? null,
  };

  // Pastikan semua transaksi SQLite ter-flush ke disk sebelum disalin.
  await db.prisma.$queryRaw`PRAGMA wal_checkpoint(FULL)`.catch(() => {});

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(absOut);
    const zip = new ZipArchive({ zlib: { level: mode === "full" ? 6 : 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    zip.on("error", reject);

    zip.pipe(output);
    zip.append(JSON.stringify(manifest, null, 2), { name: MANIFEST_NAME });
    zip.file(dbFilePath(), { name: "database.db" });
    if (mode === "full") {
      zip.directory(UPLOADS_ROOT, "uploads");
    }
    zip.finalize().catch(reject);
  });

  const stat = await fs.stat(absOut);
  publishEvent({
    type: "backup.completed",
    title: `Backup ${mode} selesai`,
    message: `${fileName} (${formatBytesSafe(stat.size)})`,
    payload: { fileName, mode },
  });
  return {
    fileName,
    mode,
    sizeBytes: stat.size,
    createdAt: manifest.createdAt,
    notes: notes ?? undefined,
  };
}

function formatBytesSafe(n: number): string {
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

export async function listBackups(): Promise<BackupInfo[]> {
  try {
    const entries = await fs.readdir(BACKUPS_DIR);
    const infos: BackupInfo[] = [];
    for (const name of entries) {
      if (!name.startsWith("backup_") || !name.endsWith(".zip")) continue;
      const abs = path.join(BACKUPS_DIR, name);
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat?.isFile()) continue;
      const mode = name.includes("_full_") ? "full" : "metadata";
      infos.push({
        fileName: name,
        mode,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      });
    }
    return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function deleteBackup(fileName: string): Promise<void> {
  if (!/^backup_[a-z]+_[\w-]+\.zip$/.test(fileName)) {
    throw new Error("Invalid backup file name");
  }
  await fs.rm(path.join(BACKUPS_DIR, fileName), { force: true });
}

export function backupPath(fileName: string): string {
  if (!/^backup_[a-z]+_[\w-]+\.zip$/.test(fileName)) {
    throw new Error("Invalid backup file name");
  }
  return path.join(BACKUPS_DIR, fileName);
}

export interface RestoreResult {
  restoredMediaFiles: number;
  databaseRestored: boolean;
}

/**
 * Pulihkan database (+ file media bila backup "full") dari arsip backup.
 * File DB saat ini disimpan dulu sebagai rollback point (.rollback.bak).
 */
export async function restoreBackup(fileName: string): Promise<RestoreResult> {
  const zipPath = backupPath(fileName);
  await fs.access(zipPath);

  // Ekstrak ke folder sementara.
  const tmpDir = path.join(BACKUPS_DIR, `.restore-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  try {
    await extract(zipPath, { dir: tmpDir });

    // Validasi manifest.
    const manifestPath = path.join(tmpDir, MANIFEST_NAME);
    const manifestRaw = await fs.readFile(manifestPath, "utf8").catch(() => null);
    if (!manifestRaw) throw new Error("Arsip bukan backup web-vid-review yang valid");
    const manifest = JSON.parse(manifestRaw) as { type: string; mode: BackupMode };
    if (manifest.type !== MANIFEST_NAME) {
      throw new Error("Arsip bukan backup web-vid-review yang valid");
    }

    // 1. Restore database (dengan rollback point).
    const dbSource = path.join(tmpDir, "database.db");
    await fs.access(dbSource);
    const dbTarget = dbFilePath();
    const rollbackPath = dbTarget + ".rollback.bak";
    await fs.copyFile(dbTarget, rollbackPath).catch(() => {});
    await db.reset(); // tutup koneksi sebelum menimpa file
    await fs.copyFile(dbSource, dbTarget);
    const databaseRestored = true;

    // 2. Restore file media (jika ada).
    let restoredMediaFiles = 0;
    const uploadsSource = path.join(tmpDir, "uploads");
    try {
      await fs.access(uploadsSource);
      await ensureUploadDirs();
      await copyTree(uploadsSource, UPLOADS_ROOT);
      restoredMediaFiles = await countFiles(uploadsSource);
    } catch {
      // backup metadata — tidak ada folder uploads
    }

    return { restoredMediaFiles, databaseRestored };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function copyTree(source: string, target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyTree(src, dst);
    } else if (entry.isFile()) {
      await fs.copyFile(src, dst);
    }
  }
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) count += await countFiles(path.join(dir, entry.name));
    else count++;
  }
  return count;
}
