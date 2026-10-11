import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { sendOtpSms } from "@/lib/sms/melipayamak";
import { issueOtp, verifyOtp } from "./otp";
import { dummyVerify, hashPassword, verifyPassword } from "./password";
import { revokeAllUserSessions } from "./session";
import type { OtpPurpose } from "@/generated/prisma/client";

export type AuthResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RATE_MSG = "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";

const otpErrors: Record<string, string> = {
  not_found: "کد تأیید یافت نشد. دوباره درخواست کد بدهید.",
  expired: "کد تأیید منقضی شده است. دوباره درخواست کد بدهید.",
  too_many_attempts: "تعداد تلاش‌ها بیش از حد مجاز است. کد جدید بگیرید.",
  invalid: "کد تأیید اشتباه است.",
};

async function sendCode(phone: string, purpose: OtpPurpose, ip: string, payload?: object): Promise<AuthResult> {
  const [byPhone, byIp] = await Promise.all([
    rateLimit(`otp:phone:${phone}`, 5, 3600),
    rateLimit(`otp:ip:${ip}`, 20, 3600),
  ]);
  if (!byPhone.ok || !byIp.ok) return { ok: false, error: RATE_MSG };

  const issued = await issueOtp(phone, purpose, payload);
  if (!issued.ok) return { ok: false, error: `ارسال مجدد کد تا ${issued.retryAfterSec} ثانیه‌ی دیگر ممکن است.` };
  try {
    await sendOtpSms(phone, issued.code);
  } catch (e) {
    console.error("[auth] sms failed", e);
    return { ok: false, error: "ارسال پیامک با خطا مواجه شد. لطفاً دوباره تلاش کنید." };
  }
  return { ok: true };
}

async function checkCode(phone: string, purpose: OtpPurpose, code: string) {
  const rl = await rateLimit(`otp-verify:${phone}`, 10, 900);
  if (!rl.ok) return { ok: false as const, error: RATE_MSG };
  const v = await verifyOtp(phone, purpose, code);
  if (!v.ok) return { ok: false as const, error: otpErrors[v.reason] };
  return v;
}

// ---------- ثبت‌نام: اطلاعات + تأیید موبایل ----------

export async function startRegistration(
  input: { name: string; email: string; phone: string; password: string },
  ip: string,
): Promise<AuthResult> {
  const exists = await db.user.findFirst({
    where: { OR: [{ email: input.email }, { phone: input.phone }] },
    select: { email: true, phone: true },
  });
  if (exists) {
    return {
      ok: false,
      error: exists.email === input.email ? "این ایمیل قبلاً ثبت شده است." : "این شماره موبایل قبلاً ثبت شده است.",
    };
  }
  const passwordHash = await hashPassword(input.password);
  return sendCode(input.phone, "REGISTER", ip, { name: input.name, email: input.email, passwordHash });
}

export async function completeRegistration(phone: string, code: string): Promise<AuthResult<{ userId: string }>> {
  const v = await checkCode(phone, "REGISTER", code);
  if (!v.ok) return v;
  const p = v.payload as { name?: string; email?: string; passwordHash?: string } | null;
  if (!p?.name || !p.email || !p.passwordHash) return { ok: false, error: "اطلاعات ثبت‌نام یافت نشد. دوباره تلاش کنید." };
  try {
    const user = await db.user.create({
      data: { name: p.name, email: p.email, phone, passwordHash: p.passwordHash },
    });
    return { ok: true, userId: user.id };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "این ایمیل یا شماره قبلاً ثبت شده است." };
    throw e;
  }
}

// ---------- ورود با ایمیل و رمز ----------

export async function loginWithPassword(email: string, password: string, ip: string): Promise<AuthResult<{ userId: string }>> {
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 20, 900),
    rateLimit(`login:email:${email}`, 8, 900),
  ]);
  if (!byIp.ok || !byEmail.ok) return { ok: false, error: RATE_MSG };

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await dummyVerify(password);
    return { ok: false, error: "ایمیل یا رمز عبور اشتباه است." };
  }
  if (!(await verifyPassword(user.passwordHash, password))) return { ok: false, error: "ایمیل یا رمز عبور اشتباه است." };
  if (user.bannedAt) return { ok: false, error: "حساب کاربری شما مسدود شده است." };
  return { ok: true, userId: user.id };
}

// ---------- ورود با موبایل و کد یک‌بارمصرف ----------

export async function startPhoneLogin(phone: string, ip: string): Promise<AuthResult> {
  const user = await db.user.findUnique({ where: { phone }, select: { id: true } });
  // برای جلوگیری از شناسایی شماره‌های ثبت‌شده، پاسخ موفق یکسان است
  if (!user) {
    await rateLimit(`otp:ip:${ip}`, 20, 3600);
    return { ok: true };
  }
  return sendCode(phone, "LOGIN", ip);
}

export async function completePhoneLogin(phone: string, code: string): Promise<AuthResult<{ userId: string }>> {
  const v = await checkCode(phone, "LOGIN", code);
  if (!v.ok) return v;
  const user = await db.user.findUnique({ where: { phone } });
  if (!user) return { ok: false, error: otpErrors.invalid };
  if (user.bannedAt) return { ok: false, error: "حساب کاربری شما مسدود شده است." };
  return { ok: true, userId: user.id };
}

// ---------- بازیابی رمز با موبایل ----------

export async function startPasswordReset(phone: string, ip: string): Promise<AuthResult> {
  const user = await db.user.findUnique({ where: { phone }, select: { id: true } });
  if (!user) {
    await rateLimit(`otp:ip:${ip}`, 20, 3600);
    return { ok: true };
  }
  return sendCode(phone, "RESET_PASSWORD", ip);
}

export async function completePasswordReset(phone: string, code: string, newPassword: string): Promise<AuthResult<{ userId: string }>> {
  const v = await checkCode(phone, "RESET_PASSWORD", code);
  if (!v.ok) return v;
  const user = await db.user.findUnique({ where: { phone } });
  if (!user) return { ok: false, error: otpErrors.invalid };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await revokeAllUserSessions(user.id);
  return { ok: true, userId: user.id };
}

export async function changePassword(userId: string, current: string, next: string): Promise<AuthResult> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(user.passwordHash, current))) return { ok: false, error: "رمز فعلی اشتباه است." };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true };
}
