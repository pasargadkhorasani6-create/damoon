import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canViewSignals, subscriptionEndsAt } from "@/lib/subscription";
import { faDate } from "@/lib/format";
import { tg, type TgUpdate } from "./api";
import { channelJoinLink, consumeTelegramLink } from "./link";

const site = () => env().APP_URL;

async function reply(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
}

async function sendJoinButton(chatId: number) {
  const link = await channelJoinLink();
  if (!link) return;
  await reply(chatId, "برای عضویت در کانال خصوصی روی دکمه بزنید. درخواست شما به‌صورت خودکار تأیید می‌شود.", {
    reply_markup: { inline_keyboard: [[{ text: "عضویت در کانال سیگنال", url: link }]] },
  });
}

async function statusText(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const active = await canViewSignals(user);
  const ends = await subscriptionEndsAt(user.id);
  return active
    ? `✅ اشتراک شما فعال است${ends ? ` تا ${faDate(ends)}` : ""}.\nدریافت سیگنال در پیام خصوصی: ${user.telegramDm ? "روشن (/dm_off)" : "خاموش (/dm_on)"}`
    : `اشتراک فعالی ندارید. برای خرید: ${site()}/pricing`;
}

const HELP = [
  "دستورات:",
  "/status — وضعیت اشتراک",
  "/channel — لینک عضویت کانال خصوصی",
  "/dm_on و /dm_off — روشن/خاموش کردن سیگنال در پیام خصوصی",
].join("\n");

export async function handleUpdate(u: TgUpdate) {
  if (u.chat_join_request) return handleJoinRequest(u.chat_join_request);
  const m = u.message;
  if (!m?.text || !m.from || m.chat.type !== "private") return;
  const chatId = m.chat.id;
  const [cmd, arg] = m.text.trim().split(/\s+/, 2);
  const linked = await db.user.findUnique({ where: { telegramId: BigInt(m.from.id) } });

  switch (cmd.split("@")[0]) {
    case "/start": {
      if (arg) {
        const user = await consumeTelegramLink(arg, m.from);
        if (!user) {
          await reply(chatId, `لینک اتصال نامعتبر یا منقضی است. از پنل سایت لینک جدید بگیرید:\n${site()}/dashboard/telegram`);
          return;
        }
        await reply(chatId, `👋 ${user.name}، حساب تلگرام شما به سایت متصل شد.\n\n${await statusText(user.id)}\n\n${HELP}`);
        if (await canViewSignals(user)) await sendJoinButton(chatId);
        return;
      }
      await reply(
        chatId,
        linked
          ? `${await statusText(linked.id)}\n\n${HELP}`
          : `سلام! برای دریافت سیگنال‌ها ابتدا از پنل سایت حساب خود را متصل کنید:\n${site()}/dashboard/telegram`,
      );
      return;
    }
    case "/status":
      await reply(chatId, linked ? await statusText(linked.id) : `حساب شما متصل نیست: ${site()}/dashboard/telegram`);
      return;
    case "/channel":
      if (linked && (await canViewSignals(linked))) await sendJoinButton(chatId);
      else await reply(chatId, "عضویت در کانال فقط برای مشترکین فعال با حساب متصل امکان‌پذیر است.");
      return;
    case "/dm_on":
    case "/dm_off":
      if (!linked) return reply(chatId, `حساب شما متصل نیست: ${site()}/dashboard/telegram`);
      await db.user.update({ where: { id: linked.id }, data: { telegramDm: cmd === "/dm_on" } });
      await reply(chatId, cmd === "/dm_on" ? "ارسال سیگنال در پیام خصوصی روشن شد." : "ارسال سیگنال در پیام خصوصی خاموش شد.");
      return;
    default:
      await reply(chatId, HELP);
  }
}

/** فقط مشترکین فعال با حساب متصل وارد کانال می‌شوند */
async function handleJoinRequest(r: NonNullable<TgUpdate["chat_join_request"]>) {
  if (String(r.chat.id) !== env().TELEGRAM_CHANNEL_ID) return;
  const user = await db.user.findUnique({ where: { telegramId: BigInt(r.from.id) } });
  if (user && (await canViewSignals(user))) {
    await tg("approveChatJoinRequest", { chat_id: r.chat.id, user_id: r.from.id });
    await db.user.update({ where: { id: user.id }, data: { telegramInChannel: true } });
    return;
  }
  await tg("declineChatJoinRequest", { chat_id: r.chat.id, user_id: r.from.id });
  await tg("sendMessage", {
    chat_id: r.user_chat_id,
    text: user
      ? `اشتراک فعالی ندارید. برای خرید: ${site()}/pricing`
      : `برای عضویت ابتدا در سایت ثبت‌نام و حساب تلگرام را متصل کنید: ${site()}/dashboard/telegram`,
  }).catch(() => {});
}
