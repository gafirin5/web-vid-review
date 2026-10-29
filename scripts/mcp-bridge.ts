/**
 * Stdio MCP bridge untuk web-vid-review.
 *
 * Dijalankan lewat:
 *   npm run mcp:bridge
 *
 * Konfigurasi Claude Desktop / Cursor / Windsurf (stdio):
 * {
 *   "mcpServers": {
 *     "media-gallery": {
 *       "command": "npx",
 *       "args": ["tsx", "C:/Users/Administrator/Documents/web-vid-review/scripts/mcp-bridge.ts"]
 *     }
 *   }
 * }
 */
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "../src/mcp/server";

async function main() {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Catatan: log stdout akan mengganggu protokol stdio MCP — log ke stderr saja.
  console.error(`[mcp-bridge] ${"web-vid-review"} MCP server siap (stdio)`);
}

main().catch((err) => {
  console.error("[mcp-bridge] fatal:", err);
  process.exit(1);
});
