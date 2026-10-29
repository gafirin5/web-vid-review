import { redirect } from "next/navigation";
import Link from "next/link";
import { Archive, Ban, BookOpen, Bot, Clapperboard, ClipboardList, DatabaseBackup, LayoutDashboard, LineChart, LogOut, Settings } from "lucide-react";
import { isAdminRequest } from "@/lib/admin-auth";
import { logoutAction } from "../actions";
import NotificationCenter from "./NotificationCenter";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/review", label: "Review", icon: ClipboardList },
  { href: "/admin/media", label: "Media", icon: Clapperboard },
  { href: "/admin/agents", label: "AI Agents", icon: Bot },
  { href: "/api/v1/docs", label: "API Docs", icon: BookOpen },
  { href: "/admin/analytics", label: "Analitik", icon: LineChart },
  { href: "/admin/backups", label: "Backup", icon: DatabaseBackup },
  { href: "/admin/dump", label: "Dump", icon: Archive },
  { href: "/admin/rejected", label: "Rejected", icon: Ban },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminRequest())) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-52 lg:shrink-0">
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            <p className="hidden px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 lg:block">
              Admin Panel
            </p>
            {navItems.map((item) => {
              const className =
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white";
              return item.href.startsWith("/api/") ? (
                <a key={item.href} href={item.href} className={className}>
                  <item.icon className="size-4" />
                  {item.label}
                </a>
              ) : (
                <Link key={item.href} href={item.href} className={className}>
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            <form action={logoutAction} className="lg:mt-4">
              <button
                type="submit"
                className="flex w-full shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
              >
                <LogOut className="size-4" />
                Keluar
              </button>
            </form>
            <div className="mt-2 lg:border-t lg:border-zinc-800 lg:pt-2">
              <NotificationCenter />
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
