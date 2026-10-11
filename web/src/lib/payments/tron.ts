import { env } from "@/lib/env";
import { outboundFetch } from "@/lib/http";

/** قرارداد رسمی USDT روی شبکه‌ی ترون */
export const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDT_DECIMALS = 6;

export type Trc20Transfer = {
  txHash: string;
  from: string;
  to: string;
  value: bigint; // واحد پایه (۶ رقم اعشار)
  timestamp: Date;
};

type TronGridItem = {
  transaction_id: string;
  from: string;
  to: string;
  value: string;
  type: string;
  block_timestamp: number;
  token_info?: { address?: string; decimals?: number };
};

/** واریزی‌های تأییدشده‌ی USDT به آدرس ما از زمان مشخص */
export async function fetchIncomingUsdt(sinceMs: number, fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = outboundFetch): Promise<Trc20Transfer[]> {
  const e = env();
  if (!e.USDT_TRC20_ADDRESS) throw new Error("USDT_TRC20_ADDRESS is not set");
  const out: Trc20Transfer[] = [];
  let url: string | null =
    `${e.TRONGRID_BASE_URL}/v1/accounts/${e.USDT_TRC20_ADDRESS}/transactions/trc20` +
    `?only_to=true&only_confirmed=true&limit=200&contract_address=${USDT_CONTRACT}&min_timestamp=${Math.max(0, Math.floor(sinceMs))}`;
  for (let page = 0; url && page < 5; page++) {
    const res = await fetchImpl(url, { headers: e.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": e.TRONGRID_API_KEY } : {} });
    if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
    const json = (await res.json()) as { data?: TronGridItem[]; meta?: { links?: { next?: string } } };
    for (const t of json.data ?? []) {
      // فقط انتقال واقعی USDT به آدرس ما
      if (t.type !== "Transfer" || t.token_info?.address !== USDT_CONTRACT || t.token_info?.decimals !== USDT_DECIMALS) continue;
      if (t.to !== e.USDT_TRC20_ADDRESS) continue;
      if (!/^[0-9a-f]{64}$/i.test(t.transaction_id) || !/^\d+$/.test(t.value)) continue;
      out.push({ txHash: t.transaction_id.toLowerCase(), from: t.from, to: t.to, value: BigInt(t.value), timestamp: new Date(t.block_timestamp) });
    }
    url = json.meta?.links?.next ?? null;
  }
  return out;
}

export const usdtToUnits = (cents: number) => BigInt(cents) * 10_000n;
export const formatUsdt = (units: bigint) => {
  const s = units.toString().padStart(7, "0");
  return `${s.slice(0, -6)}.${s.slice(-6).replace(/0+$/, "").padEnd(2, "0")}`;
};
