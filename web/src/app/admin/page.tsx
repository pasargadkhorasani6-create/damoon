import { overview } from "@/lib/admin/service";
import { fa, toman } from "@/lib/format";
import { formatUsdt } from "@/lib/payments/tron";

export default async function AdminHome() {
  const o = await overview();
  const irr = o.revenue.find((r) => r.currency === "IRR");
  const usdt = o.revenue.find((r) => r.currency === "USDT");
  const tiles: [string, string][] = [
    ["کاربران", fa(o.users)],
    ["مشترکین فعال", fa(o.activeSubscribers)],
    ["درآمد ریالی ۳۰ روز", irr ? toman(Number(irr._sum.amount ?? 0n) / 10) : "—"],
    ["درآمد تتر ۳۰ روز", usdt ? `${formatUsdt(usdt._sum.amount ?? 0n)} USDT` : "—"],
    ["پرداخت‌های در انتظار", fa(o.pendingPayments)],
    ["سیگنال‌های ۲۴ ساعت اخیر", fa(o.signals24h)],
    ["سیگنال‌های باز", fa(o.openSignals)],
  ];
  return (
    <>
      <h1 className="text-2xl font-bold">نمای کلی</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="admin-overview">
        {tiles.map(([k, v]) => (
          <div key={k} className="card !p-4">
            <div className="text-xs text-muted">{k}</div>
            <div className="mt-1 text-xl font-extrabold">{v}</div>
          </div>
        ))}
      </div>
    </>
  );
}
