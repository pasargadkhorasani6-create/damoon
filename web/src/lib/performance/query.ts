import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { CLOSED_STATUSES } from "@/lib/signals/logic";
import { computeStats, type Trade } from "./stats";

export const PERIODS = { all: null, "30d": 30, "90d": 90, "365d": 365 } as const;
export type Period = keyof typeof PERIODS;

export async function getPerformance(opts: { symbol?: string | null; period?: Period }) {
  const days = PERIODS[opts.period ?? "all"];
  const since = days ? new Date(Date.now() - days * 86_400_000) : undefined;
  const where = {
    ...(opts.symbol ? { symbol: opts.symbol } : {}),
    ...(since ? { closedAt: { gte: since } } : {}),
  };
  // فقط معاملات بسته‌شده با نتیجه‌ی محاسبه‌شده توسط سرور
  const [rows, canceled, open, symbols] = await Promise.all([
    db.signal.findMany({
      where: { ...where, status: { in: CLOSED_STATUSES }, resultR: { not: null }, closedAt: { not: null } },
      select: { id: true, symbol: true, direction: true, closedAt: true, resultR: true, status: true, entry: true, stopLoss: true, takeProfit: true, fillPrice: true, exitPrice: true, digits: true, signalAt: true },
      orderBy: { closedAt: "asc" },
    }),
    db.signal.count({ where: { ...where, status: "CANCELED" } }),
    db.signal.count({ where: { ...(opts.symbol ? { symbol: opts.symbol } : {}), status: { in: ["PENDING", "ACTIVE"] } } }),
    db.signal.findMany({ distinct: ["symbol"], select: { symbol: true }, orderBy: { symbol: "asc" } }),
  ]);
  const trades: Trade[] = rows.map((r) => ({ id: r.id, symbol: r.symbol, closedAt: r.closedAt!, resultR: r.resultR! }));
  return {
    stats: computeStats(trades, env().PERFORMANCE_RISK_PCT),
    riskPct: env().PERFORMANCE_RISK_PCT,
    canceled,
    open,
    symbols: symbols.map((s) => s.symbol),
    log: rows.reverse().slice(0, 200),
  };
}
