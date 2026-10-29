import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP endpoint (Streamable HTTP transport, stateless mode).
 *
 * Clients connect to: http://<host>:3000/api/mcp
 *
 * Each POST request is served by a fresh server+transport pair, so any number
 * of AI agents can connect concurrently without session state on the server.
 * Responses are plain JSON (no SSE), which every MCP client supports.
 */
export async function POST(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
    maxRequestBodySize: 512 * 1024 * 1024, // allow large base64 uploads
  });
  const server = buildMcpServer();
  await server.connect(transport);

  const response = await transport.handleRequest(request);

  // The per-request transport/server become garbage once the response stream
  // finishes; no explicit teardown is required in stateless mode.
  return response;
}

export async function GET() {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Not found" }, id: null },
    { status: 405 }
  );
}

export async function DELETE() {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Not found" }, id: null },
    { status: 405 }
  );
}
