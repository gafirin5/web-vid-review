"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, HardDrive, Play, RefreshCw, Save, Trash2 } from "lucide-react";

interface RoleStat {
  count: number;
  sizeBytes: number;
}

interface StorageReport {
  total: RoleStat;
  perRole: Record<string, RoleStat>;
  perStatus: Record<string, RoleStat>;
  purgeable: RoleStat;
  projection30dBytes: number;
  disk: { totalBytes: number; freeBytes: number; usedPercent: number } | null;
  generatedAt: string;
}

interface RetentionCandidate {
  id: string;
  contentId: string | null;
  title: string;
  role: string;
  status: string;
  sizeBytes: number;
  purgeAt: string;
}

interface RetentionResult {
  dryRun: boolean;
  candidates: RetentionCandidate[];
  freedBytes: number;
  purged: number;
  refreshed: number;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminStoragePage() {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [policies, setPolicies] = useState<Record<string, number>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RetentionResult | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [reportRes, policyRes] = await Promise.all([
      fetch("/api/v1/storage/report"),
      fetch("/api/v1/retention/policies"),
    ]);
    if (reportRes.ok) setReport(await reportRes.json());
    if (policyRes.ok) {
      const data = await policyRes.json();
      setPolicies(data.policies ?? {});
      setRoles(data.roles ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/v1/storage/report"), fetch("/api/v1/retention/policies")])
      .then(async ([reportRes, policyRes]) => {
        const report = reportRes.ok ? await reportRes.json() : null;
        const policy = policyRes.ok ? await policyRes.json() : null;
        if (cancelled) return;
        if (report) setReport(report);
        if (policy) {
          setPolicies(policy.policies ?? {});
          setRoles(policy.roles ?? {});
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePolicy(role: string, days: number) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/v1/retention/policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, retentionDays: days }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(
      res.ok
        ? { ok: true, text: `Kebijakan ${role} disimpan: ${data.retentionDays} hari.` }
        : { ok: false, text: data.error ?? "Gagal menyimpan kebijakan" }
    );
    if (res.ok) setPolicies((prev) => ({ ...prev, [role]: data.retentionDays }));
    setBusy(false);
  }

  async function runRetention(dryRun: boolean) {
    if (!dryRun && !confirm("Hapus file yang sudah melewati TTL? Metadata tetap disimpan sebagai ARCHIVED.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/v1/retention/run?dry_run=${dryRun ? "true" : "false"}`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setResult(data);
      setMessage({
        ok: true,
        text: dryRun
          ? `Dry-run: ${data.candidates.length} kandidat · ${formatBytes(data.freedBytes)} dapat dibebaskan.`
          : `Purge selesai: ${data.purged} media diarsipkan · ${formatBytes(data.freedBytes)} dibebaskan.`,
      });
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? "Retensi gagal dijalankan" });
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Penyimpanan &amp; Retensi</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Disk lokal adalah sumber utama. File dihapus setelah TTL, metadata tetap tersimpan sebagai{" "}
            <span className="text-amber-400">ARCHIVED</span> (zero-delete).
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading || busy}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
        </button>
      </div>

      {message && (
        <p
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            message.ok
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : "border-red-800 bg-red-950/40 text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
            <HardDrive className="size-4" /> Total media
          </p>
          <p className="mt-2 text-2xl font-bold">{report?.total.count ?? "—"}</p>
          <p className="text-xs text-zinc-500">{formatBytes(report?.total.sizeBytes ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Bisa di-purge</p>
          <p className="mt-2 text-2xl font-bold text-amber-400">{report?.purgeable.count ?? "—"}</p>
          <p className="text-xs text-zinc-500">{formatBytes(report?.purgeable.sizeBytes ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Proyeksi 30 hari</p>
          <p className="mt-2 text-2xl font-bold text-violet-400">
            {formatBytes(report?.projection30dBytes ?? 0)}
          </p>
          <p className="text-xs text-zinc-500">berdasarkan intake 7 hari terakhir</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Disk</p>
          <p className="mt-2 text-2xl font-bold">
            {report?.disk ? `${report.disk.usedPercent.toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-zinc-500">
            {report?.disk
              ? `${formatBytes(report.disk.freeBytes)} bebas dari ${formatBytes(report.disk.totalBytes)}`
              : "tidak tersedia"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold">Penggunaan per role</h2>
          <div className="mt-3 space-y-2">
            {Object.entries(report?.perRole ?? {})
              .sort((a, b) => b[1].sizeBytes - a[1].sizeBytes)
              .map(([role, stat]) => {
                const pct = report?.total.sizeBytes
                  ? (stat.sizeBytes / report.total.sizeBytes) * 100
                  : 0;
                return (
                  <div key={role}>
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-zinc-300">{role}</span>
                      <span className="text-zinc-500">
                        {stat.count} · {formatBytes(stat.sizeBytes)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            {Object.keys(report?.perRole ?? {}).length === 0 && (
              <p className="text-xs text-zinc-600">Belum ada data.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold">Status media</h2>
          <div className="mt-3 space-y-2">
            {Object.entries(report?.perStatus ?? {}).map(([status, stat]) => (
              <div key={status} className="flex justify-between text-xs">
                <span className="font-medium text-zinc-300">{status}</span>
                <span className="text-zinc-500">
                  {stat.count} · {formatBytes(stat.sizeBytes)}
                </span>
              </div>
            ))}
            {Object.keys(report?.perStatus ?? {}).length === 0 && (
              <p className="text-xs text-zinc-600">Belum ada data.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">Kebijakan retensi (hari)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          TTL dihitung dari <code className="text-zinc-300">publishedAt</code> (atau{" "}
          <code className="text-zinc-300">createdAt</code>); untuk media REJECTED dari{" "}
          <code className="text-zinc-300">rejectedAt</code>.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <PolicyRow
              key={`${role}-${policies[role] ?? 0}`}
              role={role}
              value={policies[role] ?? 0}
              disabled={busy}
              onSave={savePolicy}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4 text-amber-400" /> Jalankan retensi
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Dry-run hanya menampilkan kandidat. Purge menghapus file dari disk dan mengubah status menjadi
          ARCHIVED (record + audit tetap ada).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => runRetention(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
          >
            <Play className="size-4" /> Dry-run
          </button>
          <button
            onClick={() => runRetention(false)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            <Trash2 className="size-4" /> Purge sekarang
          </button>
        </div>

        {result && result.candidates.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-zinc-950 text-left uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2">CID / ID</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ukuran</th>
                  <th className="px-3 py-2">PurgeAt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {result.candidates.slice(0, 100).map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-mono text-zinc-300">{c.contentId ?? c.id}</td>
                    <td className="px-3 py-2 text-zinc-400">{c.role}</td>
                    <td className="px-3 py-2 text-zinc-400">{c.status}</td>
                    <td className="px-3 py-2 text-zinc-400">{formatBytes(c.sizeBytes)}</td>
                    <td className="px-3 py-2 text-zinc-500">
                      {new Date(c.purgeAt).toLocaleDateString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.candidates.length > 100 && (
              <p className="px-3 py-2 text-xs text-zinc-600">
                … dan {result.candidates.length - 100} kandidat lainnya
              </p>
            )}
          </div>
        )}
      </div>

      {report && (
        <p className="mt-4 text-xs text-zinc-600">
          Laporan dibuat: {new Date(report.generatedAt).toLocaleString("id-ID")}
        </p>
      )}
    </div>
  );
}

function PolicyRow({
  role,
  value,
  disabled,
  onSave,
}: {
  role: string;
  value: number;
  disabled: boolean;
  onSave: (role: string, days: number) => void;
}) {
  const [days, setDays] = useState(String(value));

  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="w-20 shrink-0 text-xs font-medium text-zinc-300">{role}</span>
      <input
        type="number"
        min={0}
        max={3650}
        value={days}
        onChange={(e) => setDays(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
      />
      <button
        onClick={() => onSave(role, Number(days))}
        disabled={disabled || Number(days) === value}
        title="Simpan"
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
      >
        <Save className="size-4" />
      </button>
    </div>
  );
}
