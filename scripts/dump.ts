#!/usr/bin/env node
/**
 * CLI dump handoff untuk web-vid-review → nextgen_cosplay_pipeline.
 *
 * Memakai `tsx` agar bisa langsung reuse service `src/services/dump.ts`
 * (tanpa duplikasi logika SQL/arch_all/cid_overrides).
 *
 * Usage:
 *   npm run dump                 (metadata: nextgen_cosplay.sql + arch_all.json + cid_overrides.json)
 *   npm run dump -- --files      (+ salinan file media ke folder dump)
 *   npm run dump -- --files "catatan"
 */
import "dotenv/config";
import { createDump } from "../src/services/dump";

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
  const args = process.argv.slice(2);
  const includeFiles = args.includes("--files");
  const notes = args.find((a) => !a.startsWith("--"))?.slice(0, 300);

  const info = await createDump({ includeFiles, notes });

  console.log(`✅ Dump handoff: ${info.id}`);
  console.log(`   Media APPROVED: ${info.count} · file disalin: ${info.fileCount}`);
  console.log(`   Ukuran folder: ${formatBytes(info.sizeBytes)}`);
  console.log(`   Lokasi: ${info.path}`);
  console.log("   Artefak: nextgen_cosplay.sql, arch_all.json, cid_overrides.json, manifest.json");
  if (includeFiles) console.log("   (media/ berisi salinan file fisik)");
}

main().catch((err) => {
  console.error("❌ Dump gagal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});