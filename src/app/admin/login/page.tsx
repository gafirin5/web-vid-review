import Link from "next/link";
import { Lock, LogIn, ShieldCheck } from "lucide-react";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-violet-600/15">
            <ShieldCheck className="size-7 text-violet-400" />
          </div>
          <h1 className="mt-4 text-lg font-bold">Admin Panel</h1>
          <p className="mt-1 text-sm text-zinc-500">
            OmniMedia AI Review Hub — pusat kendali platform
          </p>
        </div>

        {params.error && (
          <p className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-center text-sm text-red-300">
            {params.error === "rate"
              ? "Terlalu banyak percobaan login. Coba lagi beberapa menit lagi."
              : "Password salah. Coba lagi."}
          </p>
        )}

        <form action={loginAction} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Lock className="size-3.5" /> Password Admin
            </span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              placeholder="••••••••"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            <LogIn className="size-4" /> Masuk
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Password admin diset melalui <code className="text-zinc-500">ADMIN_PASSWORD</code> di{" "}
          <code className="text-zinc-500">.env</code>
        </p>
        <p className="mt-2 text-center text-xs text-zinc-600">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300">
            ← Kembali ke galeri
          </Link>
        </p>
      </div>
    </div>
  );
}
