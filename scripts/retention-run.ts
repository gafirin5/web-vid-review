#!/usr/bin/env node
/**
 * Jalankan job retensi (default dry-run).
 *
 * Usage:
 *   npm run retention:run               # dry-run: tampilkan kandidat purge
 *   npm run retention:run -- --apply    # hapus file & set ARCHIVED
 *
 * Jadwalkan di cron: 0 3 * * * cd /path/featherduster && npm run retention:run -- --apply
 */
import "dotenv/config";
import { runRetention } from "../src/services/retention";

function formatBytes(n: number): string {
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

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const result = await runRetention({ dryRun: !apply });

  console.log(`${result.dryRun ? "🔎 DRY-RUN" : "🧹 PURGE"} retensi`);
  console.log(`   Kandidat: ${result.candidates.length} media · ${formatBytes(result.freedBytes)}`);
  console.log(`   purgeAt disegarkan: ${result.refreshed}`);
  for (const c of result.candidates.slice(0, 20)) {
    console.log(`   - ${c.role} ${c.contentId ?? c.id} (${c.status}) → ${c.purgeAt}`);
  }
  if (result.candidates.length > 20) console.log(`   … dan ${result.candidates.length - 20} lainnya`);
  if (!result.dryRun) console.log(`   Diarsipkan: ${result.purged}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
