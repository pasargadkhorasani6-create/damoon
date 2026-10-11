/**
 * آمار عملکرد — تابع خالص که فقط از نتیجه‌ی معاملات بسته‌شده (R) محاسبه می‌کند.
 * هیچ عددی دستی وارد نمی‌شود؛ ورودی همیشه ردیف‌های Signal ثبت‌شده توسط ربات است.
 */
export type Trade = { id: string; symbol: string; closedAt: Date; resultR: number };

export type EquityPoint = { n: number; at: string; cumR: number; drawdownR: number };

export type Stats = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  totalR: number;
  maxDrawdownR: number;
  /** دراودان درصدی با فرض ریسک ثابت riskPct در هر معامله (مرکب) */
  maxDrawdownPct: number;
  returnPct: number;
  longestLosingStreak: number;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  equity: EquityPoint[];
  bySymbol: { symbol: string; trades: number; winRate: number; totalR: number; expectancyR: number }[];
  byMonth: { month: string; trades: number; totalR: number }[];
};

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function computeStats(input: Trade[], riskPct = 0.5): Stats {
  const trades = [...input].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime() || a.id.localeCompare(b.id));
  const rs = trades.map((t) => t.resultR);
  const winsR = rs.filter((r) => r > 0);
  const lossesR = rs.filter((r) => r < 0);
  const grossWin = winsR.reduce((s, x) => s + x, 0);
  const grossLoss = -lossesR.reduce((s, x) => s + x, 0);

  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  let eq = 1;
  let eqPeak = 1;
  let maxDdPct = 0;
  let streak = 0;
  let longest = 0;
  const equity: EquityPoint[] = [];
  trades.forEach((t, i) => {
    cum += t.resultR;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    eq *= 1 + (t.resultR * riskPct) / 100;
    eqPeak = Math.max(eqPeak, eq);
    maxDdPct = Math.max(maxDdPct, (eqPeak - eq) / eqPeak);
    streak = t.resultR < 0 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
    equity.push({ n: i + 1, at: t.closedAt.toISOString(), cumR: round(cum), drawdownR: round(peak - cum) });
  });

  const symbols = new Map<string, number[]>();
  const months = new Map<string, number[]>();
  for (const t of trades) {
    symbols.set(t.symbol, [...(symbols.get(t.symbol) ?? []), t.resultR]);
    const m = t.closedAt.toISOString().slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), t.resultR]);
  }

  return {
    trades: trades.length,
    wins: winsR.length,
    losses: lossesR.length,
    breakeven: rs.length - winsR.length - lossesR.length,
    winRate: rs.length ? winsR.length / rs.length : null,
    avgWinR: winsR.length ? round(mean(winsR)!) : null,
    avgLossR: lossesR.length ? round(mean(lossesR)!) : null,
    expectancyR: rs.length ? round(mean(rs)!) : null,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : null,
    totalR: round(cum),
    maxDrawdownR: round(maxDd),
    maxDrawdownPct: round(maxDdPct * 100, 2),
    returnPct: round((eq - 1) * 100, 2),
    longestLosingStreak: longest,
    firstTradeAt: trades[0]?.closedAt.toISOString() ?? null,
    lastTradeAt: trades.at(-1)?.closedAt.toISOString() ?? null,
    equity,
    bySymbol: [...symbols].map(([symbol, r]) => ({
      symbol,
      trades: r.length,
      winRate: r.filter((x) => x > 0).length / r.length,
      totalR: round(r.reduce((s, x) => s + x, 0)),
      expectancyR: round(mean(r)!),
    })),
    byMonth: [...months].map(([month, r]) => ({ month, trades: r.length, totalR: round(r.reduce((s, x) => s + x, 0)) })),
  };
}
