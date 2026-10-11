"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp, requireUser, signIn, signOut } from "@/lib/auth/current";
import * as auth from "@/lib/auth/service";
import { firstError, loginSchema, otpCodeSchema, passwordSchema, phoneSchema, registerSchema } from "@/lib/validation";

export type FormState = { error?: string; step?: "code"; phone?: string; message?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** فقط مسیرهای داخلی سایت مجاز است (جلوگیری از open redirect) */
function safeNext(v: string) {
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard";
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const ip = await clientIp();
  if (str(fd, "step") === "code") {
    const phone = phoneSchema.safeParse(str(fd, "phone"));
    const code = otpCodeSchema.safeParse(str(fd, "code"));
    if (!phone.success) return { error: firstError(phone.error) };
    if (!code.success) return { error: firstError(code.error), step: "code", phone: phone.data };
    const res = await auth.completeRegistration(phone.data, code.data);
    if (!res.ok) return { error: res.error, step: "code", phone: phone.data };
    await signIn(res.userId);
    redirect("/dashboard");
  }

  const parsed = registerSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    password: str(fd, "password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (fd.get("accept") !== "on") return { error: "پذیرش قوانین و سلب مسئولیت الزامی است." };
  const res = await auth.startRegistration(parsed.data, ip);
  if (!res.ok) return { error: res.error };
  return { step: "code", phone: parsed.data.phone, message: "کد تأیید به موبایل شما ارسال شد." };
}

export async function loginPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const res = await auth.loginWithPassword(parsed.data.email, parsed.data.password, await clientIp());
  if (!res.ok) return { error: res.error };
  await signIn(res.userId);
  redirect(safeNext(str(fd, "next")));
}

export async function loginOtpAction(_: FormState, fd: FormData): Promise<FormState> {
  const phone = phoneSchema.safeParse(str(fd, "phone"));
  if (!phone.success) return { error: firstError(phone.error) };

  if (str(fd, "step") === "code") {
    const code = otpCodeSchema.safeParse(str(fd, "code"));
    if (!code.success) return { error: firstError(code.error), step: "code", phone: phone.data };
    const res = await auth.completePhoneLogin(phone.data, code.data);
    if (!res.ok) return { error: res.error, step: "code", phone: phone.data };
    await signIn(res.userId);
    redirect(safeNext(str(fd, "next")));
  }

  const res = await auth.startPhoneLogin(phone.data, await clientIp());
  if (!res.ok) return { error: res.error };
  return { step: "code", phone: phone.data, message: "اگر این شماره ثبت شده باشد، کد ورود برای آن ارسال شد." };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const phone = phoneSchema.safeParse(str(fd, "phone"));
  if (!phone.success) return { error: firstError(phone.error) };

  if (str(fd, "step") === "code") {
    const parsed = z.object({ code: otpCodeSchema, password: passwordSchema }).safeParse({
      code: str(fd, "code"),
      password: str(fd, "password"),
    });
    if (!parsed.success) return { error: firstError(parsed.error), step: "code", phone: phone.data };
    const res = await auth.completePasswordReset(phone.data, parsed.data.code, parsed.data.password);
    if (!res.ok) return { error: res.error, step: "code", phone: phone.data };
    await signIn(res.userId);
    redirect("/dashboard");
  }

  const res = await auth.startPasswordReset(phone.data, await clientIp());
  if (!res.ok) return { error: res.error };
  return { step: "code", phone: phone.data, message: "اگر این شماره ثبت شده باشد، کد بازیابی برای آن ارسال شد." };
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const next = passwordSchema.safeParse(str(fd, "next"));
  if (!next.success) return { error: firstError(next.error) };
  const res = await auth.changePassword(user.id, str(fd, "current").slice(0, 128), next.data);
  return res.ok ? { message: "رمز عبور تغییر کرد." } : { error: res.error };
}

export async function logoutAction() {
  await signOut();
  redirect("/");
}
