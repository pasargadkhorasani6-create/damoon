"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { rateLimit } from "@/lib/rate-limit";
import { createUsdtPayment, startZarinpal, submitUsdtTx } from "@/lib/payments/service";

export type PayState = { error?: string; message?: string };

export async function checkoutAction(_: PayState, fd: FormData): Promise<PayState> {
  const user = await requireUser();
  const plan = String(fd.get("plan") ?? "");
  const method = String(fd.get("method") ?? "");
  // تأیید سلب مسئولیت هنگام خرید الزامی است و سمت سرور بررسی می‌شود
  if (fd.get("accept") !== "on") return { error: "برای خرید باید سلب مسئولیت و قوانین را بپذیرید." };
  const rl = await rateLimit(`checkout:${user.id}`, 10, 3600);
  if (!rl.ok) return { error: "تعداد درخواست‌های پرداخت زیاد است. کمی بعد تلاش کنید." };

  if (method === "zarinpal") {
    const r = await startZarinpal(user, plan);
    if (!r.ok) return { error: r.error };
    redirect(r.url);
  }
  if (method === "usdt") {
    const r = await createUsdtPayment(user.id, plan);
    if (!r.ok) return { error: r.error };
    redirect(`/dashboard/payments/${r.payment.id}`);
  }
  return { error: "روش پرداخت نامعتبر است." };
}

export async function submitTxAction(_: PayState, fd: FormData): Promise<PayState> {
  const user = await requireUser();
  const rl = await rateLimit(`usdt-tx:${user.id}`, 20, 3600);
  if (!rl.ok) return { error: "تعداد درخواست‌ها زیاد است. کمی بعد تلاش کنید." };
  const id = String(fd.get("paymentId") ?? "");
  const r = await submitUsdtTx(user.id, id, String(fd.get("txHash") ?? "").slice(0, 100));
  if (!r.ok) return { error: r.error };
  redirect(`/dashboard/payments/${id}`);
}
