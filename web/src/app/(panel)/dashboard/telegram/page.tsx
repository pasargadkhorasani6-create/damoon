import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { faDateTime } from "@/lib/format";
import { canViewSignals } from "@/lib/subscription";
import { connectTelegramAction, toggleDmAction, unlinkTelegramAction } from "@/app/actions/telegram";

export const metadata: Metadata = { title: "تلگرام" };

export default async function TelegramPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const enabled = !!env().TELEGRAM_BOT_TOKEN;
  const active = await canViewSignals(user);
  const bot = env().TELEGRAM_BOT_USERNAME;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">اتصال تلگرام</h1>
      {error === "rate" && <p className="rounded-xl border border-down/40 bg-down/10 p-3 text-sm text-down">تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید.</p>}
      {!enabled ? (
        <div className="card text-muted">ارسال تلگرام هنوز توسط مدیر سایت فعال نشده است.</div>
      ) : user.telegramId ? (
        <div className="card space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="rounded-full bg-up/15 px-3 py-1 text-sm text-up">متصل</span>
            {user.telegramUsername && <span className="ltr-num">@{user.telegramUsername}</span>}
            {user.telegramLinkedAt && <span className="text-sm text-muted">از {faDateTime(user.telegramLinkedAt)}</span>}
          </div>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              کانال خصوصی: {user.telegramInChannel ? "عضو هستید" : active ? "در ربات دستور /channel را بفرستید تا لینک عضویت را بگیرید." : "فقط برای مشترکین فعال"}
            </li>
            <li>سیگنال در پیام خصوصی ربات: {user.telegramDm ? "روشن" : "خاموش"}</li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <form action={toggleDmAction}>
              <input type="hidden" name="on" value={user.telegramDm ? "0" : "1"} />
              <button className="btn-ghost">{user.telegramDm ? "خاموش کردن پیام خصوصی" : "روشن کردن پیام خصوصی"}</button>
            </form>
            {bot && (
              <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer" className="btn-ghost">
                باز کردن ربات
              </a>
            )}
            <form action={unlinkTelegramAction}>
              <button className="btn-ghost text-down">قطع اتصال</button>
            </form>
          </div>
        </div>
      ) : (
        <div className="card space-y-4">
          <p className="leading-8 text-muted">
            با اتصال حساب تلگرام، سیگنال‌ها هم‌زمان با سایت در <strong className="text-ink">پیام خصوصی ربات</strong> و{" "}
            <strong className="text-ink">کانال خصوصی</strong> برای شما ارسال می‌شوند. ورود به کانال فقط برای مشترکین فعال تأیید می‌شود و با پایان
            اشتراک، دسترسی به‌صورت خودکار قطع می‌شود.
          </p>
          <form action={connectTelegramAction}>
            <button className="btn-primary">اتصال به ربات تلگرام</button>
          </form>
          <p className="text-xs text-muted">لینک اتصال یک‌بارمصرف است و ۱۵ دقیقه اعتبار دارد.</p>
        </div>
      )}
    </div>
  );
}
