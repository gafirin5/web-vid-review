import { CheckCircle2, ShieldAlert, Sliders, HardDrive, KeyRound, Globe, Webhook, DoorOpen } from "lucide-react";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { APP_CONFIG } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const isDefaultPassword = (process.env.ADMIN_PASSWORD ?? "admin123") === "admin123";
  const hasWebhook = Boolean(process.env.WEBHOOK_URLS);
  const autoTagEnabled = process.env.AUTO_TAG !== "false";
  const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";

  const securityItems = [
    {
      title: "Mode Akses API",
      ok: APP_CONFIG.authMode !== "open" || isDefaultPassword === false,
      detail:
        APP_CONFIG.authMode === "open"
          ? `OPEN — siapa pun bisa upload/review tanpa API key (kuota ${APP_CONFIG.anonUploadPerHour} upload/jam per IP). Admin tetap butuh login.`
          : APP_CONFIG.authMode === "optional"
            ? "OPTIONAL — tanpa key = anonim tanpa atribusi agent."
            : "REQUIRED — semua endpoint agent wajib API key.",
    },
    {
      title: "Password Admin",
      ok: !isDefaultPassword,
      detail: isDefaultPassword
        ? "Masih memakai password default 'admin123'. Ubah ADMIN_PASSWORD di .env untuk lingkungan publik!"
        : "Password kustom aktif di .env",
    },
    {
      title: "Auto-Tagging Heuristik",
      ok: autoTagEnabled,
      detail: autoTagEnabled
        ? "Aktif — menghasilkan tag orientasi, brightness, warna dominan, dan keyword otomatis"
        : "Dinonaktifkan via AUTO_TAG=false",
    },
    {
      title: "Validasi Magic Bytes",
      ok: true,
      detail: "Aktif — isi file dicocokkan dengan signature format (anti ekstensi palsu)",
    },
    {
      title: "Rate Limiting In-Memory",
      ok: true,
      detail: `Upload: ${RATE_LIMITS.uploadPerMinute}/m · Review: ${RATE_LIMITS.reviewPerMinute}/m · Search: ${RATE_LIMITS.searchPerMinute}/m`,
    },
    {
      title: "Integrasi Webhook",
      ok: hasWebhook,
      detail: hasWebhook
        ? `Terkonfigurasi ke: ${process.env.WEBHOOK_URLS}`
        : "Belum dikonfigurasi (opsional — atur WEBHOOK_URLS di .env)",
    },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold">Konfigurasi &amp; Status Sistem</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Ringkasan pengaturan platform, proteksi keamanan, dan variabel lingkungan
      </p>

      {/* Security checklist */}
      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="size-4 text-violet-400" /> Checklist Keamanan &amp; Fitur
        </h2>
        <ul className="mt-3 divide-y divide-zinc-800">
          {securityItems.map((item) => (
            <li key={item.title} className="flex items-start gap-3 py-3">
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              ) : (
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200">{item.title}</p>
                <p className="text-xs text-zinc-500">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Environment overview */}
      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sliders className="size-4 text-violet-400" /> Variabel Lingkungan Aktif
        </h2>
        <dl className="mt-3 divide-y divide-zinc-800 text-xs">
          <div className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-1.5 text-zinc-400">
              <Globe className="size-3.5" /> PUBLIC_BASE_URL
            </dt>
            <dd className="font-mono text-zinc-200">{baseUrl}</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-1.5 text-zinc-400">
              <HardDrive className="size-3.5" /> DATABASE_URL
            </dt>
            <dd className="font-mono text-zinc-200">{process.env.DATABASE_URL ?? "file:./dev.db"}</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-1.5 text-zinc-400">
              <KeyRound className="size-3.5" /> ADMIN_PASSWORD
            </dt>
            <dd className="font-mono text-zinc-200">
              {isDefaultPassword ? "admin123 (default ⚠️)" : "•••••••• (kustom ✅)"}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-1.5 text-zinc-400">
              <Webhook className="size-3.5" /> WEBHOOK_URLS
            </dt>
            <dd className="font-mono text-zinc-200">
              {process.env.WEBHOOK_URLS || "(tidak diset)"}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-1.5 text-zinc-400">
              <DoorOpen className="size-3.5" /> AUTH_MODE
            </dt>
            <dd className="font-mono text-zinc-200">{APP_CONFIG.authMode}</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-1.5 text-zinc-400">
              <ShieldAlert className="size-3.5" /> ANON_STATUS
            </dt>
            <dd className="font-mono text-zinc-200">{APP_CONFIG.anonStatus}</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-1.5 text-zinc-400">
              <Globe className="size-3.5" /> CORS_ORIGINS
            </dt>
            <dd className="font-mono text-zinc-200">{APP_CONFIG.corsOrigins.join(", ")}</dd>
          </div>
        </dl>
      </div>

      {/* Deployment guide */}
      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">Deployment Mandiri via Docker</h2>
        <p className="mt-2 text-xs text-zinc-400">
          Platform siap di-deploy ke server/VPS menggunakan Docker:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
          docker compose up -d
        </pre>
        <p className="mt-2 text-xs text-zinc-500">
          Folder <code>uploads/</code>, <code>backups/</code>, dan database <code>dev.db</code>{" "}
          dipetakan sebagai volume persisten.
        </p>
      </div>
    </div>
  );
}
