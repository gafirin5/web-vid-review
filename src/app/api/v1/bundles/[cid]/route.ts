import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { getBundle } from "@/services/bundles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/bundles/:cid — seluruh aset satu CID, dikelompokkan per role. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/bundles/[cid]">
) {
  const { cid } = await ctx.params;
  const bundle = await getBundle(cid);
  if (!bundle) return jsonError("CID tidak ditemukan", 404);
  return jsonOk(bundle);
}
