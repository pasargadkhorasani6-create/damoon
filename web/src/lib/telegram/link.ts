import { db } from "@/lib/db";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { tg } from "./api";

const LINK_TTL_MIN = 15;

/** لینک یک‌بارمصرف اتصال حساب سایت به تلگرام: https://t.me/<bot>?start=<code> */
export async function createTelegramLink(userId: string): Promise<string> {
  const code = randomToken(18); // base64url، مجاز در start parameter
  await db.telegramLinkCode.deleteMany({ where: { userId } });
  await db.telegramLinkCode.create({
    data: { codeHash: sha256Hex(code), userId, expiresAt: new Date(Date.now() + LINK_TTL_MIN * 60_000) },
  });
  return `https://t.me/${env().TELEGRAM_BOT_USERNAME}?start=${code}`;
}

export async function consumeTelegramLink(code: string, tgUser: { id: number; username?: string }) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(code)) return null;
  const row = await db.telegramLinkCode.findUnique({ where: { codeHash: sha256Hex(code) } });
  if (!row) return null;
  await db.telegramLinkCode.delete({ where: { codeHash: row.codeHash } });
  if (row.expiresAt.getTime() < Date.now()) return null;

  const telegramId = BigInt(tgUser.id);
  return db.$transaction(async (tx) => {
    // هر حساب تلگرام فقط به یک کاربر سایت متصل است؛ اتصال قبلی برداشته می‌شود
    const prev = await tx.user.findUnique({ where: { telegramId } });
    if (prev && prev.id !== row.userId) {
      await tx.user.update({ where: { id: prev.id }, data: { telegramId: null, telegramUsername: null, telegramLinkedAt: null, telegramInChannel: false } });
    }
    return tx.user.update({
      where: { id: row.userId },
      data: {
        telegramId,
        telegramUsername: tgUser.username ?? null,
        telegramLinkedAt: new Date(),
        telegramInChannel: prev?.id !== row.userId ? (prev?.telegramInChannel ?? false) : undefined,
      },
    });
  });
}

/**
 * لینک عضویت کانال با «درخواست عضویت»: لینک ممکن است پخش شود،
 * اما ربات فقط درخواست کاربرانی را تأیید می‌کند که حساب متصل و اشتراک فعال دارند.
 */
export async function channelJoinLink(): Promise<string | null> {
  const channel = env().TELEGRAM_CHANNEL_ID;
  if (!channel) return null;
  const cached = await redis().get("tg:joinlink");
  if (cached) return cached;
  const r = await tg<{ invite_link: string }>("createChatInviteLink", { chat_id: channel, name: "subscribers", creates_join_request: true });
  await redis().set("tg:joinlink", r.invite_link, "EX", 7 * 86400);
  return r.invite_link;
}
