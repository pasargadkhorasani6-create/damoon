"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp, requireAdmin } from "@/lib/auth/current";
import * as admin from "@/lib/admin/service";

async function actor(): Promise<admin.Actor> {
  const u = await requireAdmin();
  return { id: u.id, ip: await clientIp() };
}

/** نتیجه به‌صورت پیام در query string به همان صفحه برمی‌گردد */
function back(path: string, r: admin.AdminResult): never {
  const q = new URLSearchParams(r.ok ? { msg: r.message ?? "انجام شد." } : { err: r.error });
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}

const id = z.string().regex(/^[a-z0-9]{10,40}$/);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function grantDaysAction(fd: FormData) {
  const a = await actor();
  const userId = id.parse(str(fd, "userId"));
  back(`/admin/users/${userId}`, await admin.grantDays(a, userId, Number(str(fd, "days")), str(fd, "note")));
}

export async function revokeSubscriptionAction(fd: FormData) {
  const a = await actor();
  const userId = id.parse(str(fd, "userId"));
  back(`/admin/users/${userId}`, await admin.revokeSubscription(a, id.parse(str(fd, "subscriptionId"))));
}

export async function banAction(fd: FormData) {
  const a = await actor();
  const userId = id.parse(str(fd, "userId"));
  back(`/admin/users/${userId}`, await admin.setBan(a, userId, str(fd, "ban") === "1"));
}

export async function cancelSignalAction(fd: FormData) {
  const a = await actor();
  back("/admin/signals", await admin.adminCancelSignal(a, id.parse(str(fd, "signalId")), str(fd, "reason").slice(0, 80) || "manual"));
}

export async function resendSignalAction(fd: FormData) {
  const a = await actor();
  back("/admin/signals", await admin.resendSignalTelegram(a, id.parse(str(fd, "signalId"))));
}

export async function recheckPaymentAction(fd: FormData) {
  const a = await actor();
  back("/admin/payments", await admin.recheckPayment(a, id.parse(str(fd, "paymentId"))));
}

export async function updatePlanAction(fd: FormData) {
  const a = await actor();
  const data = z
    .object({
      title: z.string().trim().min(2).max(40),
      priceToman: z.coerce.number().int(),
      priceUsdtCents: z.coerce.number().transform((v) => Math.round(v * 100)),
      days: z.coerce.number().int(),
      active: z.boolean(),
    })
    .safeParse({ title: str(fd, "title"), priceToman: str(fd, "priceToman"), priceUsdtCents: str(fd, "priceUsdt"), days: str(fd, "days"), active: fd.get("active") === "on" });
  if (!data.success) back("/admin/plans", { ok: false, error: "مقادیر نامعتبر است." });
  back("/admin/plans", await admin.updatePlan(a, id.parse(str(fd, "planId")), data.data));
}

export async function broadcastAction(fd: FormData) {
  const a = await actor();
  back(
    "/admin/broadcast",
    await admin.sendBroadcast(a, {
      text: str(fd, "text"),
      audience: str(fd, "audience") === "ALL" ? "ALL" : "ACTIVE",
      viaTelegramDm: fd.get("dm") === "on",
      viaChannel: fd.get("channel") === "on",
      viaSite: fd.get("site") === "on",
      siteDays: Number(str(fd, "siteDays") || 7),
    }),
  );
}
