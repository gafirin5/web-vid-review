"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { adminPassword, setAdminCookie, clearAdminCookie } from "@/lib/admin-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function loginAction(formData: FormData): Promise<void> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "local";

  const limited = rateLimit(`login:${ip}`, RATE_LIMITS.loginPer5Minutes, 5 * 60_000);
  if (!limited.ok) {
    redirect("/admin/login?error=rate");
  }

  const password = String(formData.get("password") ?? "");
  if (password !== adminPassword()) {
    redirect("/admin/login?error=1");
  }
  await setAdminCookie();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await clearAdminCookie();
  redirect("/admin/login");
}