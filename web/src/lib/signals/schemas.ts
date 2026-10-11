import { z } from "zod";

/** زمان: ثانیه‌ی یونیکس (UTC) یا رشته‌ی ISO */
const when = z.union([z.number().int().positive(), z.iso.datetime({ offset: true })]).transform((v) =>
  typeof v === "number" ? new Date(v * 1000) : new Date(v),
);

const price = z.number().finite().positive();
const externalId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9:_.\-]+$/);

export const newSignalSchema = z.object({
  type: z.literal("signal.new"),
  externalId,
  symbol: z.string().trim().min(3).max(20),
  direction: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["MARKET", "STOP", "LIMIT"]).default("STOP"),
  entry: price,
  stopLoss: price,
  takeProfit: price.nullish(),
  timeframe: z.string().max(10).nullish(),
  digits: z.number().int().min(0).max(8).optional(),
  signalAt: when,
  comment: z.string().max(200).nullish(),
});

export const activatedSchema = z.object({
  type: z.literal("signal.activated"),
  externalId,
  fillPrice: price,
  at: when,
});

export const updatedSchema = z
  .object({
    type: z.literal("signal.updated"),
    externalId,
    stopLoss: price.optional(),
    takeProfit: price.nullish(),
    at: when,
  })
  .refine((v) => v.stopLoss !== undefined || v.takeProfit !== undefined, "nothing to update");

export const canceledSchema = z.object({
  type: z.literal("signal.canceled"),
  externalId,
  reason: z.string().max(100).nullish(),
  at: when,
});

export const closedSchema = z.object({
  type: z.literal("signal.closed"),
  externalId,
  exitPrice: price,
  reason: z.enum(["TP", "SL", "MANUAL", "UNKNOWN"]).default("UNKNOWN"),
  // اگر ربات رویداد فعال‌شدن را از دست داده باشد، قیمت پرشدن را همین‌جا می‌فرستد
  fillPrice: price.optional(),
  at: when,
});

export const botEventSchema = z.union([newSignalSchema, activatedSchema, updatedSchema, canceledSchema, closedSchema]);
export type BotEvent = z.infer<typeof botEventSchema>;
