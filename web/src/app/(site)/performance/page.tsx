import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";
import { EquityChart, MonthlyChart } from "@/components/performance/Charts";
import { fmtPrice, fmtR, STATUS_LABEL } from "@/components/signals/labels";
import { fa, faDate, faDateTime } from "@/lib/format";
import { getPerformance, PERIODS, type Period } from "@/lib/performance/query";

export const metadata: Metadata = { title: "عملکرد" };
export const dynamic = "force-dynamic";

const PERIOD_LABEL: Record<Period, string> = { all: "همه", "30d": "۳۰ روز", "90d": "۹۰ روز", "365d": "یک سال" };
const pct = (v: number | null) => (v == null ? "—" : `${fa((Math.round(v * 1000) / 10).toString())}٪`);
const num = (v: number | null, suffix = "") => (v == null ? "—" : `${v > 0 && suffix === "R" ? "+" : ""}${v.toFixed(2)}${suffix}`);

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card !p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="ltr-num mt-1 text-start text-xl font-extrabold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ symbol?: string; period?: string }> }) {
  const sp = await searchParams;
  const period: Period = sp.period && sp.period in PERIODS ? (sp.period as Period) : "all";
  const { stats: s, riskPct, canceled, open, symbols, log } = await getPerformance({
    symbol: sp.symbol && /^[A-Z0-9]{3,20}$/.test(sp.symbol) ? sp.symbol : null,
    period,
  });
  const symbol = sp.symbol && symbols.includes(sp.symbol) ? sp.symbol : null;
  const href = (o: { symbol?: string | null; period?: Period }) => {
    const q = new URLSearchParams();
    const sy = o.symbol === undefined ? symbol : o.symbol;
    const pe = o.period ?? period;
    if (sy) q.set("symbol", sy);
    if (pe !== "all") q.set("period", pe);
    return `/performance${q.size ? `?${q}` : ""}`;
  };
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-xs ${active ? "bg-brand text-brand-ink font-bold" : "border border-line text-muted hover:text-ink"}`;

  return (
    <div className="space-y-8 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold">عملکرد واقعی</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          همه‌ی اعداد این صفحه به‌صورت خودکار و فقط از معاملاتی محاسبه می‌شوند که ربات باز و بسته‌شدنشان را ثبت کرده است. نتیجه‌ی هر معامله
          بر حسب <strong className="text-ink">R</strong> (سود یا زیان تقسیم بر فاصله‌ی ورود تا حد ضرر اولیه) است. سیگنال‌های فعال‌نشده (لغو) در آمار
          حساب نمی‌شوند. هیچ عدد دستی یا ویرایش‌شده‌ای وجود ندارد.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="فیلترها">
        <Link href={href({ symbol: null })} className={chip(!symbol)}>
          همه‌ی نمادها
        </Link>
        {symbols.map((x) => (
          <Link key={x} href={href({ symbol: x })} className={`${chip(symbol === x)} ltr-num`}>
            {x}
          </Link>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        {(Object.keys(PERIODS) as Period[]).map((p) => (
          <Link key={p} href={href({ period: p })} className={chip(period === p)}>
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </div>

      {s.trades === 0 ? (
        <div className="card text-center text-muted" data-testid="perf-empty">
          هنوز معامله‌ی بسته‌شده‌ای در این بازه ثبت نشده است. آمار پس از ثبت اولین معامله‌ی واقعی نمایش داده می‌شود.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="perf-tiles">
            <Tile label="تعداد معاملات" value={fa(s.trades)} hint={`${fa(s.wins)} سود · ${fa(s.losses)} زیان · ${fa(s.breakeven)} سربه‌سر`} />
            <Tile label="وین‌ریت" value={pct(s.winRate)} />
            <Tile label="امید ریاضی (Expectancy)" value={num(s.expectancyR, "R")} hint="میانگین نتیجه در هر معامله" />
            <Tile label="مجموع نتیجه" value={num(s.totalR, "R")} hint={`≈ ${s.returnPct.toFixed(2)}٪ با ریسک ${riskPct}٪`} />
            <Tile label="بیشترین دراودان" value={`${s.maxDrawdownR.toFixed(2)}R`} hint={`≈ ${s.maxDrawdownPct.toFixed(2)}٪ با ریسک ${riskPct}٪`} />
            <Tile label="Profit Factor" value={s.profitFactor == null ? "—" : s.profitFactor.toFixed(2)} />
            <Tile label="میانگین سود / زیان" value={`${num(s.avgWinR, "R")} / ${num(s.avgLossR, "R")}`} />
            <Tile label="طولانی‌ترین زنجیره‌ی ضرر" value={fa(s.longestLosingStreak)} />
          </div>

          <section className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">نمودار Equity (مجموع تجمعی R)</h2>
              <span className="text-xs text-muted">
                {s.firstTradeAt && faDate(s.firstTradeAt)} تا {s.lastTradeAt && faDate(s.lastTradeAt)}
              </span>
            </div>
            <EquityChart data={s.equity} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card space-y-3">
              <h2 className="font-bold">نتیجه‌ی ماهانه</h2>
              <MonthlyChart data={s.byMonth} />
              <p className="text-xs text-muted">آبی: ماه سودده · قرمز: ماه زیان‌ده (مقدار دقیق در راهنمای نمودار)</p>
            </section>
            <section className="card space-y-3 overflow-x-auto">
              <h2 className="font-bold">به تفکیک نماد</h2>
              <table className="w-full text-sm">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th className="p-2 text-start font-medium">نماد</th>
                    <th className="p-2 text-start font-medium">معاملات</th>
                    <th className="p-2 text-start font-medium">وین‌ریت</th>
                    <th className="p-2 text-start font-medium">Expectancy</th>
                    <th className="p-2 text-start font-medium">مجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {s.bySymbol.map((r) => (
                    <tr key={r.symbol} className="border-b border-line/50">
                      <td className="ltr-num p-2 text-start">{r.symbol}</td>
                      <td className="p-2">{fa(r.trades)}</td>
                      <td className="p-2">{pct(r.winRate)}</td>
                      <td className="ltr-num p-2 text-start">{num(r.expectancyR, "R")}</td>
                      <td className="ltr-num p-2 text-start">{num(r.totalR, "R")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}

      <p className="text-sm text-muted">
        سیگنال‌های لغوشده (فعال‌نشده) در این بازه: {fa(canceled)} · معاملات باز فعلی: {fa(open)}
      </p>

      {log.length > 0 && (
        <section className="card space-y-3 overflow-x-auto !p-0">
          <h2 className="p-5 pb-0 font-bold">فهرست معاملات بسته‌شده</h2>
          <table className="w-full text-sm" data-testid="perf-log">
            <thead className="text-muted">
              <tr className="border-b border-line">
                {["زمان بسته‌شدن", "نماد", "جهت", "ورود", "حد ضرر", "خروج", "وضعیت", "نتیجه"].map((h) => (
                  <th key={h} className="p-3 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map((t) => (
                <tr key={t.id} className="border-b border-line/50">
                  <td className="p-3 whitespace-nowrap">{faDateTime(t.closedAt!)}</td>
                  <td className="ltr-num p-3 text-start">{t.symbol}</td>
                  <td className={`p-3 ${t.direction === "BUY" ? "text-up" : "text-down"}`}>{t.direction === "BUY" ? "خرید" : "فروش"}</td>
                  <td className="ltr-num p-3 text-start">{fmtPrice(t.fillPrice ?? t.entry, t.digits)}</td>
                  <td className="ltr-num p-3 text-start">{fmtPrice(t.stopLoss, t.digits)}</td>
                  <td className="ltr-num p-3 text-start">{fmtPrice(t.exitPrice, t.digits)}</td>
                  <td className="p-3">{STATUS_LABEL[t.status]}</td>
                  <td className={`ltr-num p-3 text-start font-bold ${t.resultR! > 0 ? "text-up" : t.resultR! < 0 ? "text-down" : "text-muted"}`}>{fmtR(t.resultR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Disclaimer />
    </div>
  );
}
