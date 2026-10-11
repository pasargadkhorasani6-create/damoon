import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

let n = 0;
export async function makeUser(over: Partial<{ email: string; phone: string; password: string; role: "USER" | "ADMIN"; name: string }> = {}) {
  n++;
  const password = over.password ?? "secret-pass-123";
  return db.user.create({
    data: {
      name: over.name ?? `کاربر ${n}`,
      email: over.email ?? `user${n}-${Date.now()}@example.com`,
      phone: over.phone ?? `0912${String(1000000 + n * 7919 + (Date.now() % 1000)).slice(-7)}`,
      passwordHash: await hashPassword(password),
      role: over.role ?? "USER",
    },
  });
}
