import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { RETENTION_ROLES, getPolicies, setPolicy } from "@/services/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/retention/policies — TTL per role. */
export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  return jsonOk({ roles: RETENTION_ROLES, policies: await getPolicies() });
}

/** POST /api/v1/retention/policies — Body: { role, retentionDays }. */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const role = typeof body?.role === "string" ? body.role.trim() : "";
  const days = Number(body?.retentionDays ?? body?.days);

  if (!RETENTION_ROLES.includes(role)) {
    return jsonError(`role wajib salah satu: ${RETENTION_ROLES.join(", ")}`, 422);
  }
  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    return jsonError("retentionDays harus bilangan bulat 0..3650", 422);
  }

  await setPolicy(role, days);
  return jsonOk({ role, retentionDays: days });
}
