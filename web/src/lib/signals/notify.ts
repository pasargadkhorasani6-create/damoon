import type { Signal } from "@/generated/prisma/client";
import { publishRealtime, type SignalChangeType } from "@/lib/realtime";
import { toSignalDTO } from "./dto";

/**
 * بعد از هر تغییر سیگنال صدا زده می‌شود: ارسال لحظه‌ای به فید سایت (و در فاز تلگرام، صف ارسال تلگرام).
 * خطای اطلاع‌رسانی نباید ثبت رویداد ربات را خراب کند.
 */
export async function notifySignalChange(signal: Signal, change: SignalChangeType) {
  try {
    await publishRealtime({ kind: "signal", change, signal: toSignalDTO(signal) });
  } catch (e) {
    console.error("[notify] realtime publish failed", e);
  }
}
