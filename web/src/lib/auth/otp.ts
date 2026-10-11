import { db } from "@/lib/db";
import { hmacHex, randomDigits, safeEqualHex } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { OtpPurpose, Prisma } from "@/generated/prisma/client";

export const OTP_LENGTH = 6;
export const OTP_TTL_SEC = 120;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SEC = 60;

const hashCode = (phone: string, purpose: OtpPurpose, code: string) =>
  hmacHex(env().OTP_PEPPER, `${purpose}:${phone}:${code}`);

export type IssueResult =
  | { ok: true; code: string; id: string }
  | { ok: false; reason: "cooldown"; retryAfterSec: number };

/** کد جدید می‌سازد و کدهای قبلی همان هدف را باطل می‌کند */
export async function issueOtp(phone: string, purpose: OtpPurpose, payload?: Prisma.InputJsonValue): Promise<IssueResult> {
  const last = await db.otpCode.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (last) {
    const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
    if (elapsed < OTP_RESEND_COOLDOWN_SEC) {
      return { ok: false, reason: "cooldown", retryAfterSec: Math.ceil(OTP_RESEND_COOLDOWN_SEC - elapsed) };
    }
  }
  const code = randomDigits(OTP_LENGTH);
  await db.otpCode.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
  const row = await db.otpCode.create({
    data: {
      phone,
      purpose,
      codeHash: hashCode(phone, purpose, code),
      expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000),
      payload,
    },
  });
  return { ok: true, code, id: row.id };
}

export type VerifyResult =
  | { ok: true; payload: Prisma.JsonValue | null }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "invalid" };

/** کد را بررسی و در صورت صحت مصرف می‌کند (یک‌بارمصرف) */
export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<VerifyResult> {
  const row = await db.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const good = /^\d+$/.test(code) && safeEqualHex(row.codeHash, hashCode(phone, purpose, code));
  if (!good) {
    await db.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "invalid" };
  }
  // مصرف اتمیک: اگر هم‌زمان دو درخواست بیاید فقط یکی موفق می‌شود
  const consumed = await db.otpCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return { ok: false, reason: "not_found" };
  return { ok: true, payload: row.payload };
}
