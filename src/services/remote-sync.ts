import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { BACKUPS_DIR } from "@/services/backup";
import { DUMPS_ROOT, REJECTED_ROOT } from "@/lib/paths";
import { publishEvent } from "@/lib/events";

/**
 * Sinkronisasi OPSIONAL ke Google Drive (atau remote rclone lain).
 *
 * Storage utama tetap lokal di disk. Fitur ini hanya "copy" (bukan "sync"),
 * sehingga file di remote tidak pernah dihapus otomatis — konsisten dengan
 * prinsip zero-delete.
 *
 * Konfigurasi via .env:
 *   RCLONE_REMOTE="gdrive:featherduster"     # wajib untuk mengaktifkan
 *   RCLONE_SYNC_TARGETS="backups,dumps,rejected"  # default semua
 */

export const SYNC_TARGETS = ["backups", "dumps", "rejected"] as const;
export type SyncTarget = (typeof SYNC_TARGETS)[number];

export function isSyncTarget(value: unknown): value is SyncTarget {
  return typeof value === "string" && (SYNC_TARGETS as readonly string[]).includes(value);
}

const TARGET_DIRS: Record<SyncTarget, string> = {
  backups: BACKUPS_DIR,
  dumps: DUMPS_ROOT,
  rejected: REJECTED_ROOT,
};

export interface RemoteSyncConfig {
  enabled: boolean;
  remote: string | null;
  targets: SyncTarget[];
  available: boolean;
  version: string | null;
}

export interface SyncTargetResult {
  target: SyncTarget;
  ok: boolean;
  code: number | null;
  output: string;
  durationMs: number;
}

const REMOTE_PATTERN = /^[A-Za-z0-9_.:@/\\-]+$/;

/** Validasi nama remote agar tidak bisa dipakai sebagai flag CLI. */
export function isValidRemote(remote: string): boolean {
  return (
    remote.length > 0 &&
    remote.length <= 200 &&
    !remote.startsWith("-") &&
    REMOTE_PATTERN.test(remote)
  );
}

function parseTargets(raw: string | undefined): SyncTarget[] {
  if (!raw?.trim()) return [...SYNC_TARGETS];
  const parsed = raw
    .split(",")
    .map((v) => v.trim())
    .filter(isSyncTarget);
  return parsed.length ? Array.from(new Set(parsed)) : [...SYNC_TARGETS];
}

function runRclone(args: string[], timeoutMs = 15 * 60_000): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("rclone", args, { windowsHide: true });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (output.length > 20_000) output = output.slice(-20_000);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
      if (output.length > 20_000) output = output.slice(-20_000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, output: `${output}\n${err.message}`.trim() });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output: output.trim() });
    });
  });
}

export async function rcloneVersion(): Promise<string | null> {
  const res = await runRclone(["version"], 15_000).catch(() => null);
  if (!res || res.code !== 0) return null;
  return res.output.split("\n")[0]?.trim() ?? null;
}

export async function remoteSyncConfig(): Promise<RemoteSyncConfig> {
  const remote = (process.env.RCLONE_REMOTE ?? "").trim();
  const version = await rcloneVersion();
  return {
    enabled: Boolean(remote) && isValidRemote(remote),
    remote: remote || null,
    targets: parseTargets(process.env.RCLONE_SYNC_TARGETS),
    available: version !== null,
    version,
  };
}

/** Salin folder lokal ke `<remote>/<target>` (additive, tanpa hapus). */
export async function syncToRemote(
  targets?: SyncTarget[],
  opts: { dryRun?: boolean } = {}
): Promise<{ remote: string; dryRun: boolean; results: SyncTargetResult[] }> {
  const remote = (process.env.RCLONE_REMOTE ?? "").trim();
  if (!remote) {
    throw new Error("RCLONE_REMOTE belum diset di .env (contoh: gdrive:featherduster)");
  }
  if (!isValidRemote(remote)) {
    throw new Error("RCLONE_REMOTE tidak valid (hanya huruf, angka, . _ : @ / -)");
  }

  const version = await rcloneVersion();
  if (!version) {
    throw new Error("rclone tidak ditemukan di PATH server");
  }

  const chosen = (targets?.length ? targets : parseTargets(process.env.RCLONE_SYNC_TARGETS)).filter(
    isSyncTarget
  );
  const results: SyncTargetResult[] = [];

  for (const target of chosen) {
    const started = Date.now();
    // Pastikan folder lokal ada agar rclone tidak error pada target kosong.
    await fs.mkdir(TARGET_DIRS[target], { recursive: true }).catch(() => {});
    const args = [
      "copy",
      TARGET_DIRS[target],
      `${remote.replace(/\/+$/, "")}/${target}`,
      "--stats=0",
      "--log-level=ERROR",
      ...(opts.dryRun ? ["--dry-run"] : []),
    ];
    const res = await runRclone(args);
    results.push({
      target,
      ok: res.code === 0,
      code: res.code,
      output: res.output || (res.code === 0 ? "OK" : ""),
      durationMs: Date.now() - started,
    });
  }

  const failed = results.filter((r) => !r.ok);
  publishEvent({
    type: "remote.synced",
    title: opts.dryRun ? "Simulasi sync remote selesai" : "Sync remote selesai",
    message: `${results.length - failed.length}/${results.length} target berhasil → ${remote}`,
    payload: {
      remote,
      dryRun: Boolean(opts.dryRun),
      targets: results.map((r) => ({ target: r.target, ok: r.ok })),
    },
  });

  return { remote, dryRun: Boolean(opts.dryRun), results };
}

/** Path lokal per target (untuk ditampilkan di UI). */
export function localDirFor(target: SyncTarget): string {
  return path.resolve(TARGET_DIRS[target]);
}
