"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { telegramEnabled } from "@/lib/telegram/api";
import { createTelegramLink } from "@/lib/telegram/link";

export async function connectTelegramAction() {
  const user = await requireUser();
  if (!telegramEnabled()) redirect("/dashboard/telegram");
  const rl = await rateLimit(`tg-link:${user.id}`, 10, 3600);
  if (!rl.ok) redirect("/dashboard/telegram?error=rate");
  redirect(await createTelegramLink(user.id));
}

export async function toggleDmAction(fd: FormData) {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { telegramDm: fd.get("on") === "1" } });
  revalidatePath("/dashboard/telegram");
}

export async function unlinkTelegramAction() {
  const user = await requireUser();
  // اگر عضو کانال باشد، کرون عضویت او را بعداً بررسی می‌کند؛ اینجا فقط اتصال حذف می‌شود
  await db.user.update({
    where: { id: user.id },
    data: { telegramId: null, telegramUsername: null, telegramLinkedAt: null, telegramDm: true },
  });
  revalidatePath("/dashboard/telegram");
}
