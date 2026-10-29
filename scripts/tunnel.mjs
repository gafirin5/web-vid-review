#!/usr/bin/env node
/**
 * Jalankan Cloudflare Tunnel ke server lokal (port 3000).
 *
 * Usage:
 *   npm run tunnel
 */
import { spawn } from "node:child_process";
import fs from "node:fs";

const paths = [
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
  "cloudflared",
];

const binary = paths.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}) ?? "cloudflared";

console.log("🚀 Menghubungkan ke Cloudflare...");
const proc = spawn(binary, ["tunnel", "--url", "http://localhost:3000", "--no-autoupdate"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let found = false;

function onData(chunk) {
  const text = chunk.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !found) {
    found = true;
    console.log("");
    console.log("==================================================================");
    console.log("🎉 Website Anda sudah ONLINE di Cloudflare HTTPS!");
    console.log("");
    console.log(`   🌐 Galeri Publik : ${match[0]}`);
    console.log(`   🛡️ Admin Panel   : ${match[0]}/admin`);
    console.log(`   🤖 MCP Server    : ${match[0]}/api/mcp`);
    console.log(`   📚 Swagger UI    : ${match[0]}/api/v1/docs`);
    console.log(`   📜 OpenAPI Spec  : ${match[0]}/api/v1/openapi`);
    console.log("");
    console.log("   Konfigurasi AI Agent (Claude Desktop / Cursor dari remote):");
    console.log(
      JSON.stringify(
        { mcpServers: { "media-gallery": { url: `${match[0]}/api/mcp` } } },
        null,
        2
      )
    );
    console.log("==================================================================");
    console.log("");
  }
}

proc.stdout.on("data", onData);
proc.stderr.on("data", onData);

proc.on("exit", (code) => {
  console.log(`Tunnel ditutup (exit code ${code})`);
});
