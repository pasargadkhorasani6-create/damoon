import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { grantSubscription } from "@/lib/subscription";
import type { Payment, Prisma, User } from "@/generated/prisma/client";
import { requestPayment, startPayUrl, verifyPayment } from "./zarinpal";
import { fetchIncomingUsdt, usdtToUnits, type Trc20Transfer } from "./tron";
import { onPaymentPaid } from "./hooks";

const MIN = 60_000;
export const ZARINPAL_TTL_MIN = 30;
/** واریز تتر تا این مدت بعد از پایان مهلت هم پذیرفته می‌شود (تأخیر شبکه/تأیید بلاک) */
export const USDT_GRACE_MIN = 30;

export type PayResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function getActivePlans() {
  return db.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { days: "asc" }] });
}

async function getPlan(slug: string) {
  const plan = await db.plan.findUnique({ where: { slug } });
  return plan?.active ? plan : null;
}

// ------------------------------------------------------------------ نهایی‌سازی (مشترک بین درگاه‌ها)

/**
 * پرداخت را PAID و اشتراک را فعال می‌کند. اتمیک و idempotent:
 * فقط یک فراخوانی موفق می‌شود حتی اگر callback و کرون هم‌زمان اجرا شوند.
 */
export async function finalizePayment(paymentId: string, data: Prisma.PaymentUpdateManyMutationInput, allowFrom: ("PENDING" | "EXPIRED")[] = ["PENDING"]) {
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: allowFrom } },
      data: { ...data, status: "PAID", paidAt: new Date() },
    });
    if (updated.count !== 1) return null;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { plan: true } });
    const sub = await grantSubscription(tx, { userId: p.userId, planSlug: p.plan.slug, days: p.plan.days, source: "PAYMENT" });
    await tx.subscription.update({ where: { id: sub.id }, data: { paymentId: p.id } });
    return { payment: p, subscription: sub };
  });
  if (result) await onPaymentPaid(result.payment, result.subscription).catch((e) => console.error("[payments] hook failed", e));
  return result;
}

// ------------------------------------------------------------------ زرین‌پال

export async function startZarinpal(user: Pick<User, "id" | "phone" | "email">, planSlug: string, fetchImpl?: typeof fetch): Promise<PayResult<{ url: string; paymentId: string }>> {
  const plan = await getPlan(planSlug);
  if (!plan) return { ok: false, error: "پلن یافت نشد." };
  if (!env().ZARINPAL_MERCHANT_ID) return { ok: false, error: "درگاه زرین‌پال تنظیم نشده است." };

  const amountRial = plan.priceToman * 10;
  const payment = await db.payment.create({
    data: {
      userId: user.id,
      planId: plan.id,
      provider: "ZARINPAL",
      amount: BigInt(amountRial),
      currency: "IRR",
      termsAcceptedAt: new Date(),
      expiresAt: new Date(Date.now() + ZARINPAL_TTL_MIN * MIN),
    },
  });
  try {
    const { authority } = await requestPayment(
      {
        amountRial,
        description: `اشتراک ${plan.title} - ${env().APP_NAME}`,
        callbackUrl: `${env().APP_URL}/api/payments/zarinpal/callback?pid=${payment.id}`,
        mobile: user.phone,
        email: user.email,
        orderId: payment.id,
      },
      fetchImpl,
    );
    await db.payment.update({ where: { id: payment.id }, data: { authority } });
    return { ok: true, url: startPayUrl(authority), paymentId: payment.id };
  } catch (e) {
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failReason: String((e as Error).message).slice(0, 200) } });
    console.error("[zarinpal] request failed", e);
    return { ok: false, error: "اتصال به درگاه پرداخت ناموفق بود. لطفاً دوباره تلاش کنید." };
  }
}

export async function handleZarinpalCallback(
  q: { authority: string | null; status: string | null; pid: string | null },
  fetchImpl?: typeof fetch,
): Promise<{ ok: boolean; paymentId?: string; message: string }> {
  if (!q.authority || !q.pid) return { ok: false, message: "اطلاعات بازگشت از درگاه ناقص است." };
  const p = await db.payment.findUnique({ where: { id: q.pid } });
  if (!p || p.provider !== "ZARINPAL" || p.authority !== q.authority) return { ok: false, message: "پرداخت یافت نشد." };
  if (p.status === "PAID") return { ok: true, paymentId: p.id, message: "پرداخت قبلاً تأیید شده است." };
  if (p.status !== "PENDING") return { ok: false, paymentId: p.id, message: "این پرداخت دیگر معتبر نیست." };

  if (q.status !== "OK") {
    await db.payment.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "FAILED", failReason: "canceled by user" } });
    return { ok: false, paymentId: p.id, message: "پرداخت لغو شد یا ناموفق بود." };
  }

  // تأیید سمت سرور با مبلغ ذخیره‌شده در دیتابیس
  const v = await verifyPayment({ authority: p.authority, amountRial: Number(p.amount) }, fetchImpl);
  if (!v.ok) {
    await db.payment.updateMany({
      where: { id: p.id, status: "PENDING" },
      data: { status: "FAILED", failReason: `verify failed: ${v.code ?? ""} ${v.message ?? ""}`.slice(0, 200), raw: v.raw as Prisma.InputJsonValue },
    });
    return { ok: false, paymentId: p.id, message: "تأیید پرداخت ناموفق بود. اگر مبلغ از حساب شما کسر شده، طی ۷۲ ساعت بازگردانده می‌شود." };
  }
  await finalizePayment(p.id, { refId: v.refId, cardPan: v.cardPan ?? null, raw: v.raw as Prisma.InputJsonValue });
  return { ok: true, paymentId: p.id, message: "پرداخت با موفقیت انجام شد و اشتراک شما فعال شد." };
}

// ------------------------------------------------------------------ تتر (TRC20)

/** پرداخت تتر با مبلغ یکتا (چند سنت اضافه) تا واریز به‌طور قطعی به همین سفارش نسبت داده شود */
export async function createUsdtPayment(userId: string, planSlug: string): Promise<PayResult<{ payment: Payment }>> {
  const plan = await getPlan(planSlug);
  if (!plan) return { ok: false, error: "پلن یافت نشد." };
  if (!env().USDT_TRC20_ADDRESS) return { ok: false, error: "پرداخت تتر فعلاً در دسترس نیست." };

  const now = new Date();
  const existing = await db.payment.findFirst({
    where: { userId, planId: plan.id, provider: "USDT_TRC20", status: "PENDING", expiresAt: { gt: now } },
  });
  if (existing) return { ok: true, payment: existing };

  const base = usdtToUnits(plan.priceUsdtCents);
  const taken = new Set(
    (
      await db.payment.findMany({
        where: { provider: "USDT_TRC20", status: "PENDING", expiresAt: { gt: new Date(now.getTime() - USDT_GRACE_MIN * MIN) } },
        select: { amount: true },
      })
    ).map((p) => p.amount),
  );
  const free: bigint[] = [];
  for (let c = 1; c <= 99; c++) {
    const a = base + BigInt(c) * 10_000n;
    if (!taken.has(a)) free.push(a);
  }
  if (!free.length) return { ok: false, error: "در حال حاضر امکان ایجاد پرداخت تتر نیست؛ چند دقیقه بعد تلاش کنید." };

  const payment = await db.payment.create({
    data: {
      userId,
      planId: plan.id,
      provider: "USDT_TRC20",
      amount: free[randomInt(0, free.length)],
      currency: "USDT",
      termsAcceptedAt: now,
      expiresAt: new Date(now.getTime() + env().USDT_PAYMENT_TTL_MIN * MIN),
    },
  });
  return { ok: true, payment };
}

function transferMatches(p: Payment, t: Trc20Transfer) {
  return (
    t.value === p.amount &&
    t.timestamp.getTime() >= p.createdAt.getTime() - 5 * MIN &&
    t.timestamp.getTime() <= p.expiresAt.getTime() + USDT_GRACE_MIN * MIN
  );
}

/** کاربر هش تراکنش را وارد می‌کند؛ تراکنش از بلاکچین (نه از ورودی کاربر) بررسی می‌شود */
export async function submitUsdtTx(
  userId: string,
  paymentId: string,
  txHashRaw: string,
  fetcher: typeof fetchIncomingUsdt = fetchIncomingUsdt,
): Promise<PayResult> {
  const txHash = txHashRaw.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txHash)) return { ok: false, error: "هش تراکنش معتبر نیست (۶۴ کاراکتر hex)." };
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.userId !== userId || p.provider !== "USDT_TRC20") return { ok: false, error: "پرداخت یافت نشد." };
  if (p.status === "PAID") return { ok: true };
  if (p.status !== "PENDING") return { ok: false, error: "مهلت این پرداخت تمام شده است. با پشتیبانی تماس بگیرید." };

  const used = await db.payment.findUnique({ where: { txHash } });
  if (used) return { ok: false, error: "این تراکنش قبلاً استفاده شده است." };

  let transfers: Trc20Transfer[];
  try {
    transfers = await fetcher(p.createdAt.getTime() - 5 * MIN);
  } catch (e) {
    console.error("[usdt] fetch failed", e);
    return { ok: false, error: "دسترسی به شبکه‌ی ترون موقتاً ممکن نیست. چند دقیقه بعد دوباره تلاش کنید." };
  }
  const t = transfers.find((x) => x.txHash === txHash);
  if (!t) return { ok: false, error: "تراکنش هنوز تأیید نشده یا به آدرس ما ارسال نشده است. پس از چند دقیقه دوباره بررسی کنید." };
  if (!transferMatches(p, t)) return { ok: false, error: "مبلغ یا زمان این تراکنش با سفارش مطابقت ندارد. مبلغ باید دقیقاً برابر مقدار اعلام‌شده باشد." };

  try {
    const done = await finalizePayment(p.id, { txHash, payerAddress: t.from, raw: { value: t.value.toString(), at: t.timestamp.toISOString() } });
    return done ? { ok: true } : { ok: false, error: "این پرداخت قبلاً پردازش شده است." };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "این تراکنش قبلاً استفاده شده است." };
    throw e;
  }
}

/** کرون: واریزهای جدید را با مبلغ یکتای سفارش‌های باز تطبیق می‌دهد (بدون نیاز به ورود هش توسط کاربر) */
export async function scanUsdtPayments(fetcher: typeof fetchIncomingUsdt = fetchIncomingUsdt): Promise<number> {
  const now = Date.now();
  const pending = await db.payment.findMany({
    where: { provider: "USDT_TRC20", status: "PENDING", expiresAt: { gt: new Date(now - USDT_GRACE_MIN * MIN) } },
  });
  if (!pending.length) return 0;
  const since = Math.min(...pending.map((p) => p.createdAt.getTime())) - 5 * MIN;
  const transfers = await fetcher(since);
  const usedHashes = new Set(
    (await db.payment.findMany({ where: { txHash: { in: transfers.map((t) => t.txHash) } }, select: { txHash: true } })).map((p) => p.txHash),
  );
  let paid = 0;
  for (const t of transfers) {
    if (usedHashes.has(t.txHash)) continue;
    const p = pending.find((x) => x.status === "PENDING" && transferMatches(x, t));
    if (!p) continue;
    try {
      if (await finalizePayment(p.id, { txHash: t.txHash, payerAddress: t.from, raw: { value: t.value.toString(), at: t.timestamp.toISOString() } })) {
        paid++;
        p.status = "PAID";
        usedHashes.add(t.txHash);
      }
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  return paid;
}

/** کرون: پرداخت‌های باز منقضی‌شده */
export async function expireStalePayments(now = new Date()): Promise<number> {
  const zp = await db.payment.updateMany({
    where: { provider: "ZARINPAL", status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  const usdt = await db.payment.updateMany({
    where: { provider: "USDT_TRC20", status: "PENDING", expiresAt: { lt: new Date(now.getTime() - USDT_GRACE_MIN * MIN) } },
    data: { status: "EXPIRED" },
  });
  return zp.count + usdt.count;
}
