import { db } from "@/lib/db";
import { hmacHex, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "damoon_session";
export const SESSION_TTL_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** در دیتابیس فقط HMAC توکن ذخیره می‌شود؛ نشت دیتابیس = نشت سشن نیست */
export const hashSessionToken = (token: string) => hmacHex(env().SESSION_SECRET, token);

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY);
  await db.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
    },
  });
  return { token, expiresAt };
}

/** کاربر سشن را برمی‌گرداند؛ سشن منقضی یا کاربر مسدود = null. در نیمه‌ی عمر، تمدید می‌شود */
export async function validateSessionToken(token: string | undefined | null) {
  if (!token || token.length > 128) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.bannedAt) return null;
  if (session.expiresAt.getTime() - now < (SESSION_TTL_DAYS / 2) * DAY) {
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(now + SESSION_TTL_DAYS * DAY) },
    });
  }
  return { session, user: session.user };
}

export async function revokeSessionToken(token: string) {
  await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function revokeAllUserSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}
