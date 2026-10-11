import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, revokeSessionToken, SESSION_COOKIE, validateSessionToken } from "./session";
import { env } from "@/lib/env";

/** IP واقعی کاربر پشت Nginx (Nginx هدر X-Real-IP را بازنویسی می‌کند) */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const res = await validateSessionToken(jar.get(SESSION_COOKIE)?.value);
  return res?.user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

export async function signIn(userId: string) {
  const h = await headers();
  const { token, expiresAt } = await createSession(userId, {
    ip: await clientIp(),
    userAgent: h.get("user-agent"),
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionToken(token);
  jar.delete(SESSION_COOKIE);
}
