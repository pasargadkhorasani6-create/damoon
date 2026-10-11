import { redis } from "./redis";
import type { SignalDTO } from "./signals/dto";

export const SIGNAL_CHANNEL = "rt:signals";

export type SignalChangeType = "created" | "activated" | "updated" | "canceled" | "closed";
export type RealtimeMessage = { kind: "signal"; change: SignalChangeType; signal: SignalDTO };

export async function publishRealtime(msg: RealtimeMessage) {
  await redis().publish(SIGNAL_CHANNEL, JSON.stringify(msg));
}
