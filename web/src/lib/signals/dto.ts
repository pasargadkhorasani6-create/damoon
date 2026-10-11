import type { Signal } from "@/generated/prisma/client";

export type SignalDTO = {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  orderType: "MARKET" | "STOP" | "LIMIT";
  timeframe: string | null;
  digits: number;
  entry: number;
  stopLoss: number;
  takeProfit: number | null;
  status: Signal["status"];
  signalAt: string;
  fillPrice: number | null;
  activatedAt: string | null;
  exitPrice: number | null;
  closedAt: string | null;
  resultR: number | null;
  cancelReason: string | null;
};

export function toSignalDTO(s: Signal): SignalDTO {
  return {
    id: s.id,
    symbol: s.symbol,
    direction: s.direction,
    orderType: s.orderType,
    timeframe: s.timeframe,
    digits: s.digits,
    entry: s.entry,
    stopLoss: s.stopLoss,
    takeProfit: s.takeProfit,
    status: s.status,
    signalAt: s.signalAt.toISOString(),
    fillPrice: s.fillPrice,
    activatedAt: s.activatedAt?.toISOString() ?? null,
    exitPrice: s.exitPrice,
    closedAt: s.closedAt?.toISOString() ?? null,
    resultR: s.resultR,
    cancelReason: s.cancelReason,
  };
}
