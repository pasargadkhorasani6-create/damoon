import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { toSignalDTO } from "@/lib/signals/dto";
import { canViewSignals } from "@/lib/subscription";
import { tg, TelegramError, type TgMessage } from "./api";
import { formatChange, formatSignal } from "./format";
import { enqueueDms, type DmJob, type SignalJob } from "./queue";

const isNotModified = (e: unknown) => e instanceof TelegramError && /not modified/i.test(e.description);
const isBlocked = (e: unknown) => e instanceof TelegramError && (e.code === 403 || /chat not found|user is deactivated/i.test(e.description));

async function sendSignalTo(chatId: bigint, signalId: string, change: SignalJob["change"]) {
  const s = await db.signal.findUnique({ where: { id: signalId } });
  if (!s) return;
  const dto = toSignalDTO(s);
  const prev = await db.telegramMessage.findUnique({ where: { signalId_chatId: { signalId, chatId } } });

  if (!prev) {
    // اولین پیام این سیگنال در این چت (یا ارسال اولیه ناموفق بوده): متن کامل با وضعیت فعلی
    const m = await tg<TgMessage>("sendMessage", { chat_id: chatId.toString(), text: formatSignal(dto), parse_mode: "HTML", disable_web_page_preview: true });
    await db.telegramMessage.upsert({
      where: { signalId_chatId: { signalId, chatId } },
      create: { signalId, chatId, messageId: m.message_id },
      update: { messageId: m.message_id },
    });
    return;
  }
  if (change === "created") return; // تکرار job

  try {
    await tg("editMessageText", { chat_id: chatId.toString(), message_id: prev.messageId, text: formatSignal(dto), parse_mode: "HTML", disable_web_page_preview: true });
  } catch (e) {
    if (!isNotModified(e)) throw e;
  }
  const note = formatChange(dto, change);
  if (note) {
    await tg("sendMessage", {
      chat_id: chatId.toString(),
      text: note,
      parse_mode: "HTML",
      reply_parameters: { message_id: prev.messageId, allow_sending_without_reply: true },
    });
  }
}

/** کاربرانی که سیگنال را در پیام خصوصی می‌گیرند: متصل به تلگرام، DM روشن، مشترک فعال */
export async function dmRecipients(): Promise<string[]> {
  const users = await db.user.findMany({
    where: { telegramId: { not: null }, telegramDm: true, bannedAt: null },
    select: { id: true, role: true, bannedAt: true },
  });
  const out: string[] = [];
  for (const u of users) if (await canViewSignals(u)) out.push(u.id);
  return out;
}

export async function processSignalJob(job: SignalJob) {
  const channel = env().TELEGRAM_CHANNEL_ID;
  if (channel) await sendSignalTo(BigInt(channel), job.signalId, job.change);
  const recipients = await dmRecipients();
  await enqueueDms(recipients.map((userId): DmJob => ({ kind: "signal", userId, signalId: job.signalId, change: job.change })));
}

export async function processDmJob(job: DmJob) {
  const user = await db.user.findUnique({ where: { id: job.userId } });
  if (!user?.telegramId) return;
  try {
    if (job.kind === "signal") {
      // اشتراک در لحظه‌ی ارسال دوباره بررسی می‌شود
      if (!user.telegramDm || !(await canViewSignals(user))) return;
      await sendSignalTo(user.telegramId, job.signalId, job.change);
    } else {
      await tg("sendMessage", { chat_id: user.telegramId.toString(), text: job.text, parse_mode: "HTML", disable_web_page_preview: true });
    }
  } catch (e) {
    if (isBlocked(e)) {
      // کاربر ربات را بلاک کرده؛ ارسال خصوصی خاموش می‌شود
      await db.user.update({ where: { id: user.id }, data: { telegramDm: false } });
      return;
    }
    throw e;
  }
}
