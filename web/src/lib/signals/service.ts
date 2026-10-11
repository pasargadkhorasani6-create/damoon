import { db } from "@/lib/db";
import type { Prisma, Signal, SignalStatus } from "@/generated/prisma/client";
import type { BotEvent } from "./schemas";
import { canonicalSymbol, classifyClose, computeR, validateLevels } from "./logic";
import { notifySignalChange } from "./notify";
import type { SignalChangeType } from "@/lib/realtime";

export type ApplyResult =
  | { ok: true; status: 200 | 201; duplicate: boolean; signal: Signal }
  | { ok: false; status: 404 | 409 | 422; error: string };

const conflict = (s: Signal, action: string): ApplyResult => ({
  ok: false,
  status: 409,
  error: `cannot ${action} signal in status ${s.status}`,
});

async function transition(
  s: Signal,
  from: SignalStatus[],
  data: Prisma.SignalUpdateInput,
  event: BotEvent,
  change: SignalChangeType,
): Promise<ApplyResult> {
  // شرط وضعیت داخل WHERE: اگر هم‌زمان رویداد دیگری وضعیت را عوض کرده باشد، این تغییر اعمال نمی‌شود
  const res = await db.signal.updateMany({ where: { id: s.id, status: { in: from } }, data: data as Prisma.SignalUpdateManyMutationInput });
  if (res.count !== 1) {
    const fresh = await db.signal.findUniqueOrThrow({ where: { id: s.id } });
    return conflict(fresh, event.type);
  }
  await db.signalEvent.create({ data: { signalId: s.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue } });
  const updated = await db.signal.findUniqueOrThrow({ where: { id: s.id } });
  await notifySignalChange(updated, change);
  return { ok: true, status: 200, duplicate: false, signal: updated };
}

export async function applyBotEvent(event: BotEvent, source: string): Promise<ApplyResult> {
  if (event.type === "signal.new") {
    const existing = await db.signal.findUnique({ where: { externalId: event.externalId } });
    if (existing) return { ok: true, status: 200, duplicate: true, signal: existing };

    const levelError = validateLevels(event.direction, event.entry, event.stopLoss, event.takeProfit);
    if (levelError) return { ok: false, status: 422, error: levelError };

    try {
      const signal = await db.signal.create({
        data: {
          externalId: event.externalId,
          source,
          symbol: canonicalSymbol(event.symbol),
          direction: event.direction,
          orderType: event.orderType,
          timeframe: event.timeframe ?? null,
          digits: event.digits ?? 5,
          entry: event.entry,
          stopLoss: event.stopLoss,
          takeProfit: event.takeProfit ?? null,
          initialStopLoss: event.stopLoss,
          initialTakeProfit: event.takeProfit ?? null,
          // سفارش بازار بلافاصله فعال است
          status: event.orderType === "MARKET" ? "ACTIVE" : "PENDING",
          fillPrice: event.orderType === "MARKET" ? event.entry : null,
          activatedAt: event.orderType === "MARKET" ? event.signalAt : null,
          signalAt: event.signalAt,
          comment: event.comment ?? null,
          events: { create: { type: event.type, payload: event as unknown as Prisma.InputJsonValue } },
        },
      });
      await notifySignalChange(signal, "created");
      return { ok: true, status: 201, duplicate: false, signal };
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        const s = await db.signal.findUniqueOrThrow({ where: { externalId: event.externalId } });
        return { ok: true, status: 200, duplicate: true, signal: s };
      }
      throw e;
    }
  }

  const s = await db.signal.findUnique({ where: { externalId: event.externalId } });
  if (!s) return { ok: false, status: 404, error: "unknown externalId" };

  switch (event.type) {
    case "signal.activated": {
      if (s.status === "ACTIVE" || ((s.status === "TP_HIT" || s.status === "SL_HIT" || s.status === "CLOSED") && s.fillPrice != null)) {
        return { ok: true, status: 200, duplicate: true, signal: s };
      }
      if (s.status !== "PENDING") return conflict(s, "activate");
      return transition(s, ["PENDING"], { status: "ACTIVE", fillPrice: event.fillPrice, activatedAt: event.at }, event, "activated");
    }

    case "signal.updated": {
      if (s.status !== "PENDING" && s.status !== "ACTIVE") return conflict(s, "update");
      const sl = event.stopLoss ?? s.stopLoss;
      const tp = event.takeProfit === undefined ? s.takeProfit : event.takeProfit;
      if (sl === s.stopLoss && tp === s.takeProfit) return { ok: true, status: 200, duplicate: true, signal: s };
      // برای سفارش فعال، حد ضرر جدید می‌تواند بالای ورود باشد (سربه‌سر/تریلینگ)؛ فقط برای سفارش در انتظار سخت‌گیری می‌کنیم
      if (s.status === "PENDING") {
        const err = validateLevels(s.direction, s.entry, sl, tp);
        if (err) return { ok: false, status: 422, error: err };
      }
      return transition(s, ["PENDING", "ACTIVE"], { stopLoss: sl, takeProfit: tp }, event, "updated");
    }

    case "signal.canceled": {
      if (s.status === "CANCELED") return { ok: true, status: 200, duplicate: true, signal: s };
      if (s.status !== "PENDING") return conflict(s, "cancel");
      return transition(s, ["PENDING"], { status: "CANCELED", cancelReason: event.reason ?? null, closedAt: event.at }, event, "canceled");
    }

    case "signal.closed": {
      if (s.status === "TP_HIT" || s.status === "SL_HIT" || s.status === "CLOSED") {
        return { ok: true, status: 200, duplicate: true, signal: s };
      }
      if (s.status === "CANCELED") return conflict(s, "close");
      const fill = s.fillPrice ?? event.fillPrice;
      if (fill == null) return { ok: false, status: 422, error: "signal was never activated; fillPrice is required" };
      const status = classifyClose(event.reason, {
        fill,
        initialSl: s.initialStopLoss,
        sl: s.stopLoss,
        tp: s.takeProfit,
        exit: event.exitPrice,
      });
      return transition(
        s,
        ["PENDING", "ACTIVE"],
        {
          status,
          fillPrice: fill,
          activatedAt: s.activatedAt ?? event.at,
          exitPrice: event.exitPrice,
          closedAt: event.at,
          resultR: computeR(s.direction, fill, s.initialStopLoss, event.exitPrice),
        },
        event,
        "closed",
      );
    }
  }
}
