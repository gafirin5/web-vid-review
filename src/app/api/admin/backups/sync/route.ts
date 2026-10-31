import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import {
  SYNC_TARGETS,
  isSyncTarget,
  localDirFor,
  remoteSyncConfig,
  syncToRemote,
  type SyncTarget,
} from "@/services/remote-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/admin/backups/sync — status konfigurasi rclone. */
export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const config = await remoteSyncConfig();
  return jsonOk({
    ...config,
    allTargets: SYNC_TARGETS,
    localDirs: Object.fromEntries(SYNC_TARGETS.map((t) => [t, localDirFor(t)])),
  });
}

/**
 * POST /api/admin/backups/sync — salin folder ke remote rclone.
 * Body: { targets?: string[], dryRun?: boolean }
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const targets: SyncTarget[] | undefined = Array.isArray(body?.targets)
    ? body.targets.filter(isSyncTarget)
    : undefined;
  const dryRun = body?.dryRun === true;

  try {
    const result = await syncToRemote(targets, { dryRun });
    return jsonOk(result, { status: 200 });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Sync gagal", 422);
  }
}
