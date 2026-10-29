import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Clapperboard, LayoutGrid } from "lucide-react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OmniMedia AI Review Hub",
  description:
    "Galeri koleksi video & foto AI. AI Agent mengunggah via MCP/REST, manusia me-review dan mengkurasi.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Clapperboard className="size-5 text-violet-400" />
              <span>
                OmniMedia <span className="text-violet-400">Review Hub</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <LayoutGrid className="size-4" />
                Galeri
              </Link>
              <a
                href="/api/v1/docs"
                className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white sm:flex"
              >
                API Docs
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-500">
          web-vid-review v0.1 · MCP: <code className="text-zinc-400">/api/mcp</code> · REST:{" "}
          <code className="text-zinc-400">/api/v1</code>
        </footer>
      </body>
    </html>
  );
}
