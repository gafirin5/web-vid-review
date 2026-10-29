#!/usr/bin/env node
/**
 * Create an AI agent with a fresh API key.
 *
 * Usage:
 *   node scripts/create-agent.mjs "Runway Video Bot" [--provider replicate]
 *   npm run agent:create -- "Midjourney Curator" --provider midjourney
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Load DATABASE_URL from .env
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
if (!name) {
  console.error('Usage: node scripts/create-agent.mjs "Agent Name" [--provider xxx]');
  process.exit(1);
}
const providerIdx = args.indexOf("--provider");
const provider = providerIdx !== -1 ? args[providerIdx + 1] : "unknown";

const id = crypto.randomUUID();
const apiKey = `avr_${crypto.randomBytes(24).toString("hex")}`;
const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const dbFile = url.replace(/^file:/, "");
const db = new Database(path.resolve(process.cwd(), dbFile));

try {
  db.prepare(
    `INSERT INTO Agent (id, name, apiKeyHash, modelProvider, active, createdAt)
     VALUES (?, ?, ?, ?, 1, datetime('now'))`
  ).run(id, name, apiKeyHash, provider);

  console.log("✅ Agent created!");
  console.log(`   ID:       ${id}`);
  console.log(`   Name:     ${name}`);
  console.log(`   Provider: ${provider}`);
  console.log("");
  console.log("   API Key (shown only once, store it safely):");
  console.log(`   ${apiKey}`);
  console.log("");
  console.log("   Usage:");
  console.log(`   curl -H "Authorization: Bearer ${apiKey}" http://localhost:3000/api/v1/media`);
} finally {
  db.close();
}
