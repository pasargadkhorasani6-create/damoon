import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST } from "@/app/api/bot/events/route";
import { setTelegramTransport, TelegramError } from "@/lib/telegram/api";
import { handleUpdate } from "@/lib/telegram/bot";
import { dmRecipients, processDmJob, processSignalJob } from "@/lib/telegram/deliver";
import { formatChange, formatSignal } from "@/lib/telegram/format";
import { createTelegramLink } from "@/lib/telegram/link";
import { removeExpiredMembers, sendExpiryReminders } from "@/lib/telegram/membership";
import { tgQueues } from "@/lib/telegram/queue";
import { toSignalDTO } from "@/lib/signals/dto";
import { botRequest, makeUser, newSignalEvent } from "./helpers";

type Call = { method: string; params: Record<string, unknown> };
let calls: Call[] = [];
let failWith: ((c: Call) => Error | null) | null = null;
let msgId = 100;

beforeEach(() => {
  calls = [];
  failWith = null;
  setTelegramTransport(async (method, params) => {
    const c = { method, params };
    calls.push(c);
    const err = failWith?.(c);
    if (err) throw err;
    if (method === "sendMessage") return { message_id: ++msgId, chat: { id: Number(params.chat_id), type: "private" } };
    if (method === "createChatInviteLink") return { invite_link: "https://t.me/+join" };
    return true;
  });
});
afterEach(() => setTelegramTransport(null));

const DAY = 86_400_000;
async function subscribe(userId: string, days = 30) {
  await db.subscription.create({ data: { userId, planSlug: "monthly", startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + days * DAY), source: "ADMIN" } });
}
async function createSignal(over: Record<string, unknown> = {}) {
  const ev = newSignalEvent(over);
  const res = await POST(botRequest("/api/bot/events", ev));
  return { ev, id: (await res.json()).signal.id as string };
}
const startMsg = (text: string, fromId = 555) => ({
  update_id: 1,
  message: { message_id: 1, chat: { id: fromId, type: "private" }, from: { id: fromId, username: "trader" }, text },
});

describe("format", () => {
  it("renders a full signal in Persian with HTML escaping and disclaimer", async () => {
    const { id } = await createSignal({ symbol: "XAU<USD", entry: 2400.5, stopLoss: 2395.25, takeProfit: 2405.75 });
    const s = toSignalDTO(await db.signal.findUniqueOrThrow({ where: { id } }));
    const t = formatSignal(s);
    expect(t).toContain("خرید Stop");
    expect(t).toContain("<code>2400.50</code>");
    expect(t).toContain("توصیه‌ی مالی نیست");
    expect(formatChange({ ...s, status: "TP_HIT", exitPrice: 2405.75, resultR: 1 }, "closed")).toContain("+1.00R");
  });
});

describe("account linking via /start", () => {
  it("links with a one-time code and sends channel button to active subscribers", async () => {
    const u = await makeUser();
    await subscribe(u.id);
    const link = await createTelegramLink(u.id);
    expect(link).toMatch(/^https:\/\/t\.me\/damoon_test_bot\?start=[A-Za-z0-9_-]+$/);
    const code = link.split("start=")[1];

    await handleUpdate(startMsg(`/start ${code}`));
    const linked = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(linked.telegramId).toBe(555n);
    expect(linked.telegramUsername).toBe("trader");
    expect(calls.some((c) => c.method === "sendMessage" && String(c.params.text).includes("متصل شد"))).toBe(true);
    expect(calls.some((c) => c.method === "createChatInviteLink" && c.params.creates_join_request === true)).toBe(true);

    // کد یک‌بارمصرف است
    calls = [];
    await handleUpdate(startMsg(`/start ${code}`, 777));
    expect(String(calls[0].params.text)).toContain("نامعتبر");
  });

  it("expired code is rejected", async () => {
    const u = await makeUser();
    const code = (await createTelegramLink(u.id)).split("start=")[1];
    await db.telegramLinkCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await handleUpdate(startMsg(`/start ${code}`));
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).telegramId).toBeNull();
  });

  it("/dm_off toggles private delivery", async () => {
    const u = await makeUser();
    await db.user.update({ where: { id: u.id }, data: { telegramId: 555n } });
    await handleUpdate(startMsg("/dm_off"));
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).telegramDm).toBe(false);
  });
});

describe("channel join requests", () => {
  const req = (fromId: number) => ({ update_id: 2, chat_join_request: { chat: { id: -1001234567890 }, from: { id: fromId }, user_chat_id: fromId, date: 0 } });

  it("approves linked active subscribers only", async () => {
    const a = await makeUser();
    await db.user.update({ where: { id: a.id }, data: { telegramId: 1001n } });
    await subscribe(a.id);
    await handleUpdate(req(1001));
    expect(calls.map((c) => c.method)).toContain("approveChatJoinRequest");
    expect((await db.user.findUniqueOrThrow({ where: { id: a.id } })).telegramInChannel).toBe(true);

    calls = [];
    const b = await makeUser();
    await db.user.update({ where: { id: b.id }, data: { telegramId: 1002n } });
    await handleUpdate(req(1002)); // بدون اشتراک
    await handleUpdate(req(1003)); // متصل نیست
    expect(calls.filter((c) => c.method === "declineChatJoinRequest")).toHaveLength(2);
    expect(calls.some((c) => c.method === "approveChatJoinRequest")).toBe(false);
  });
});

describe("signal delivery", () => {
  it("posts to channel, then edits and replies on status changes", async () => {
    const { ev, id } = await createSignal();
    await processSignalJob({ signalId: id, change: "created" });
    const post = calls.find((c) => c.method === "sendMessage")!;
    expect(post.params.chat_id).toBe("-1001234567890");
    const stored = await db.telegramMessage.findFirstOrThrow({ where: { signalId: id } });

    await POST(botRequest("/api/bot/events", { type: "signal.activated", externalId: ev.externalId, fillPrice: 2400, at: Math.floor(Date.now() / 1000) }));
    calls = [];
    await processSignalJob({ signalId: id, change: "activated" });
    expect(calls[0]).toMatchObject({ method: "editMessageText", params: { message_id: stored.messageId } });
    expect(calls[1].method).toBe("sendMessage");
    expect((calls[1].params.reply_parameters as { message_id: number }).message_id).toBe(stored.messageId);

    // تکرار job ساخت، پیام دوم نمی‌فرستد
    calls = [];
    await processSignalJob({ signalId: id, change: "created" });
    expect(calls.filter((c) => c.method === "sendMessage" && c.params.chat_id === "-1001234567890")).toHaveLength(0);
  });

  it("DMs only linked, DM-enabled, active subscribers", async () => {
    const active = await makeUser();
    await db.user.update({ where: { id: active.id }, data: { telegramId: 2001n } });
    await subscribe(active.id);
    const noSub = await makeUser();
    await db.user.update({ where: { id: noSub.id }, data: { telegramId: 2002n } });
    const dmOff = await makeUser();
    await db.user.update({ where: { id: dmOff.id }, data: { telegramId: 2003n, telegramDm: false } });
    await subscribe(dmOff.id);
    const unlinked = await makeUser();
    await subscribe(unlinked.id);

    expect(await dmRecipients()).toEqual([active.id]);

    const { id } = await createSignal();
    await processDmJob({ kind: "signal", userId: active.id, signalId: id, change: "created" });
    await processDmJob({ kind: "signal", userId: noSub.id, signalId: id, change: "created" });
    const sends = calls.filter((c) => c.method === "sendMessage");
    expect(sends.map((c) => c.params.chat_id)).toEqual(["2001"]);
  });

  it("turns off DMs when the user blocked the bot", async () => {
    const u = await makeUser();
    await db.user.update({ where: { id: u.id }, data: { telegramId: 3001n } });
    await subscribe(u.id);
    const { id } = await createSignal();
    failWith = () => new TelegramError("sendMessage", 403, "Forbidden: bot was blocked by the user");
    await processDmJob({ kind: "signal", userId: u.id, signalId: id, change: "created" });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).telegramDm).toBe(false);
  });

  it("bot events enqueue Telegram jobs", async () => {
    await tgQueues().signal.obliterate({ force: true });
    await createSignal();
    const counts = await tgQueues().signal.getJobCounts("waiting", "delayed", "active");
    expect(counts.waiting + counts.delayed + counts.active).toBeGreaterThanOrEqual(1);
  });
});

describe("membership crons", () => {
  it("removes expired members from the channel", async () => {
    const expired = await makeUser();
    await db.user.update({ where: { id: expired.id }, data: { telegramId: 4001n, telegramInChannel: true } });
    const ok = await makeUser();
    await db.user.update({ where: { id: ok.id }, data: { telegramId: 4002n, telegramInChannel: true } });
    await subscribe(ok.id);

    expect(await removeExpiredMembers()).toBe(1);
    expect(calls.map((c) => [c.method, c.params.user_id])).toEqual([
      ["banChatMember", "4001"],
      ["unbanChatMember", "4001"],
    ]);
    expect((await db.user.findUniqueOrThrow({ where: { id: expired.id } })).telegramInChannel).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: ok.id } })).telegramInChannel).toBe(true);
  });

  it("sends expiry reminders once and skips renewed users", async () => {
    const a = await makeUser();
    await db.user.update({ where: { id: a.id }, data: { telegramId: 5001n } });
    await subscribe(a.id, 2);
    const b = await makeUser();
    await db.user.update({ where: { id: b.id }, data: { telegramId: 5002n } });
    await subscribe(b.id, 2);
    await db.subscription.create({ data: { userId: b.id, planSlug: "monthly", startsAt: new Date(Date.now() + 2 * DAY), endsAt: new Date(Date.now() + 32 * DAY), source: "PAYMENT" } });

    expect(await sendExpiryReminders()).toBe(1);
    expect(await sendExpiryReminders()).toBe(0);
  });
});
