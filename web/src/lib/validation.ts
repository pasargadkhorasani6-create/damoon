import { z } from "zod";
import { normalizeIranMobile, toLatinDigits } from "./phone";

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeIranMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "شماره موبایل معتبر نیست" });
      return z.NEVER;
    }
    return n;
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "ایمیل معتبر نیست" }));

export const passwordSchema = z
  .string()
  .min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد")
  .max(128, "رمز عبور بیش از حد طولانی است");

export const otpCodeSchema = z
  .string()
  .trim()
  .transform((v) => toLatinDigits(v))
  .pipe(z.string().regex(/^\d{6}$/, "کد تأیید ۶ رقمی است"));

export const nameSchema = z.string().trim().min(2, "نام را وارد کنید").max(80);

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "رمز عبور را وارد کنید").max(128),
});

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "ورودی نامعتبر است";
}
