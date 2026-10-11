import { describe, expect, it } from "vitest";
import { computeStats, type Trade } from "@/lib/performance/stats";
import { getPerformance } from "@/lib/performance/query";
import { POST } from "@/app/api/bot/events/route";
import { botRequest, newSignalEvent } from "./helpers";

const t = (i: number, r: number, symbol = "XAUUSD"): Trade => ({ id: `t${i}`, symbol, closedAt: new Date(Date.UTC(2026, 0, i)), resultR: r });

describe("computeStats (hand-checked numbers)", () => {
  it("empty input gives no fabricated numbers", () => {
    const s = computeStats([]);
    expect(s).toMatchObject({ trades: 0, winRate: null, expectancyR: null, profitFactor: null, totalR: 0, maxDrawdownR: 0, equity: [] });
  });

  it("win rate, expectancy, profit factor, drawdown and streaks", () => {
    // R: +1, -1, -1, +2, -1, +1  → مجموع 1
    const s = computeStats([t(1, 1), t(2, -1), t(3, -1), t(4, 2), t(5, -1), t(6, 1, "EURUSD")], 1);
    expect(s.trades).toBe(6);
    expect(s.wins).toBe(3);
    expect(s.winRate).toBe(0.5);
    expect(s.expectancyR).toBeCloseTo(1 / 6, 3);
    expect(s.profitFactor).toBeCloseTo(4 / 3, 3);
    expect(s.totalR).toBe(1);
    // تجمعی: 1,0,-1,1,0,1 → قله 1، کف -1 → دراودان 2R
    expect(s.maxDrawdownR).toBe(2);
    expect(s.longestLosingStreak).toBe(2);
    expect(s.avgWinR).toBeCloseTo(4 / 3, 3);
    expect(s.avgLossR).toBe(-1);
    expect(s.equity.map((p) => p.cumR)).toEqual([1, 0, -1, 1, 0, 1]);
    // درصدی با ریسک 1٪: 1.01 * 0.99 * 0.99 → دراودان از 1.01
    expect(s.maxDrawdownPct).toBeCloseTo((1 - 0.99 * 0.99) * 100, 2);
    expect(s.bySymbol.find((x) => x.symbol === "EURUSD")).toMatchObject({ trades: 1, totalR: 1 });
    expect(s.byMonth).toEqual([{ month: "2026-01", trades: 6, totalR: 1 }]);
  });

  it("sorts by close time regardless of input order", () => {
    const s = computeStats([t(3, -1), t(1, 2), t(2, 1)]);
    expect(s.equity.map((p) => p.cumR)).toEqual([2, 3, 2]);
    expect(s.maxDrawdownR).toBe(1);
  });

  it("all winners → profit factor undefined, not infinity", () => {
    expect(computeStats([t(1, 1), t(2, 1)]).profitFactor).toBeNull();
  });
});

describe("getPerformance uses only real closed trades", () => {
  it("ignores pending, active and canceled signals", async () => {
    const send = (b: unknown) => POST(botRequest("/api/bot/events", b));
    const now = Math.floor(Date.now() / 1000);
    const win = newSignalEvent();
    await send(win);
    await send({ type: "signal.closed", externalId: win.externalId, exitPrice: 2405, fillPrice: 2400, reason: "TP", at: now });
    const loss = newSignalEvent({ symbol: "US30", entry: 42000, stopLoss: 41950, takeProfit: 42050 });
    await send(loss);
    await send({ type: "signal.closed", externalId: loss.externalId, exitPrice: 41950, fillPrice: 42000, reason: "SL", at: now });
    const canceled = newSignalEvent();
    await send(canceled);
    await send({ type: "signal.canceled", externalId: canceled.externalId, at: now });
    await send(newSignalEvent()); // pending

    const p = await getPerformance({});
    expect(p.stats.trades).toBe(2);
    expect(p.stats.totalR).toBe(0);
    expect(p.stats.winRate).toBe(0.5);
    expect(p.canceled).toBe(1);
    expect(p.open).toBe(1);
    expect((await getPerformance({ symbol: "US30" })).stats.totalR).toBe(-1);
  });
});
