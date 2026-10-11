import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  createUsdtPayment,
  expireStalePayments,
  finalizePayment,
  handleZarinpalCallback,
  scanUsdtPayments,
  startZarinpal,
  submitUsdtTx,
} from "@/lib/payments/service";
import { fetchIncomingUsdt, formatUsdt, USDT_CONTRACT, type Trc20Transfer } from "@/lib/payments/tron";
import { canViewSignals } from "@/lib/subscription";
import { makeUser, seedPlans } from "./helpers";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

beforeEach(async () => {
  await seedPlans();
});

let authN = 0;

describe("zarinpal", () => {
  function fakeZarinpal(verifyCode = 100, authority?: string) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      calls.push({ url, body });
      if (url.endsWith("/request.json")) return json({ data: { code: 100, authority: authority ?? `S${++authN}` }, errors: [] });
      return json(verifyCode >= 100 && verifyCode <= 101 ? { data: { code: verifyCode, ref_id: 987654, card_pan: "6037**1234" }, errors: [] } : { data: [], errors: { code: verifyCode, message: "err" } });
    });
    return { f: f as unknown as typeof fetch, calls };
  }

  it("request → callback OK → server-side verify → subscription active (idempotent)", async () => {
    const u = await makeUser();
    const { f, calls } = fakeZarinpal(100, "A0000000000000000000000000000123456");
    const r = await startZarinpal(u, "monthly", f);
    if (!r.ok) throw new Error(r.error);
    expect(r.url).toBe("https://sandbox.zarinpal.com/pg/StartPay/A0000000000000000000000000000123456");
    expect(calls[0].body).toMatchObject({ amount: 15_000_000, currency: "IRR" });
    expect(String(calls[0].body.callback_url)).toContain(`pid=${r.paymentId}`);

    const q = { authority: "A0000000000000000000000000000123456", status: "OK", pid: r.paymentId };
    const res = await handleZarinpalCallback(q, f);
    expect(res.ok).toBe(true);
    // مبلغ verify از دیتابیس است
    expect(calls[1].url).toContain("/verify.json");
    expect(calls[1].body).toMatchObject({ amount: 15_000_000, authority: q.authority });

    const p = await db.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    expect(p).toMatchObject({ status: "PAID", refId: "987654" });
    expect(await canViewSignals(u)).toBe(true);

    // تکرار callback اشتراک دوم نمی‌سازد
    expect((await handleZarinpalCallback(q, f)).ok).toBe(true);
    expect(await db.subscription.count({ where: { userId: u.id } })).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("canceled payment and failed verification do not activate", async () => {
    const u = await makeUser();
    const ok = fakeZarinpal(100, "N1");
    const r1 = await startZarinpal(u, "monthly", ok.f);
    if (!r1.ok) throw new Error();
    expect((await handleZarinpalCallback({ authority: "N1", status: "NOK", pid: r1.paymentId }, ok.f)).ok).toBe(false);
    expect((await db.payment.findUniqueOrThrow({ where: { id: r1.paymentId } })).status).toBe("FAILED");

    const bad = fakeZarinpal(-51, "B1");
    const u2 = await makeUser();
    const r2 = await startZarinpal(u2, "monthly", bad.f);
    if (!r2.ok) throw new Error();
    expect((await handleZarinpalCallback({ authority: "B1", status: "OK", pid: r2.paymentId }, bad.f)).ok).toBe(false);
    expect(await canViewSignals(u2)).toBe(false);
  });

  it("rejects mismatched authority/pid", async () => {
    const u = await makeUser();
    const { f } = fakeZarinpal();
    const r = await startZarinpal(u, "monthly", f);
    if (!r.ok) throw new Error();
    expect((await handleZarinpalCallback({ authority: "other", status: "OK", pid: r.paymentId }, f)).ok).toBe(false);
    expect((await handleZarinpalCallback({ authority: null, status: "OK", pid: r.paymentId }, f)).ok).toBe(false);
  });

  it("gateway error marks payment failed", async () => {
    const u = await makeUser();
    const f = vi.fn(async () => json({ data: [], errors: { code: -9, message: "validation" } })) as unknown as typeof fetch;
    const r = await startZarinpal(u, "monthly", f);
    expect(r.ok).toBe(false);
    expect((await db.payment.findFirstOrThrow({ where: { userId: u.id } })).status).toBe("FAILED");
  });
});

describe("usdt trc20", () => {
  const tx = (over: Partial<Trc20Transfer>): Trc20Transfer => ({
    txHash: "a".repeat(64),
    from: "TFrom",
    to: "TTestAddress1111111111111111111111",
    value: 0n,
    timestamp: new Date(),
    ...over,
  });

  it("creates unique amounts per pending order and reuses the open one", async () => {
    const amounts = new Set<bigint>();
    for (let i = 0; i < 10; i++) {
      const u = await makeUser();
      const r = await createUsdtPayment(u.id, "monthly");
      if (!r.ok) throw new Error(r.error);
      expect(r.payment.amount > 15_000_000n && r.payment.amount < 16_000_000n).toBe(true);
      expect(r.payment.amount % 10_000n).toBe(0n);
      amounts.add(r.payment.amount);
      const again = await createUsdtPayment(u.id, "monthly");
      if (!again.ok) throw new Error();
      expect(again.payment.id).toBe(r.payment.id);
    }
    expect(amounts.size).toBe(10);
  });

  it("verifies submitted tx hash on-chain: exact amount, our address, single use", async () => {
    const u = await makeUser();
    const r = await createUsdtPayment(u.id, "monthly");
    if (!r.ok) throw new Error();
    const p = r.payment;

    const wrong = tx({ txHash: "b".repeat(64), value: p.amount - 10_000n });
    const good = tx({ txHash: "c".repeat(64), value: p.amount });
    const fetcher = async () => [wrong, good];

    expect((await submitUsdtTx(u.id, p.id, "xyz", fetcher)).ok).toBe(false);
    expect((await submitUsdtTx(u.id, p.id, "d".repeat(64), fetcher)).ok).toBe(false); // روی زنجیره نیست
    const w = await submitUsdtTx(u.id, p.id, "b".repeat(64), fetcher);
    expect(w.ok).toBe(false);
    const other = await makeUser();
    expect((await submitUsdtTx(other.id, p.id, "c".repeat(64), fetcher)).ok).toBe(false); // سفارش دیگری

    expect((await submitUsdtTx(u.id, p.id, "C".repeat(64), fetcher)).ok).toBe(true);
    expect(await canViewSignals(u)).toBe(true);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).txHash).toBe("c".repeat(64));

    // استفاده‌ی مجدد از همان تراکنش برای سفارش دیگر
    const r2 = await createUsdtPayment(other.id, "monthly");
    if (!r2.ok) throw new Error();
    const res = await submitUsdtTx(other.id, r2.payment.id, "c".repeat(64), async () => [tx({ txHash: "c".repeat(64), value: r2.payment.amount })]);
    expect(res.ok).toBe(false);
  });

  it("rejects transfers made before the order was created", async () => {
    const u = await makeUser();
    const r = await createUsdtPayment(u.id, "monthly");
    if (!r.ok) throw new Error();
    const old = tx({ txHash: "e".repeat(64), value: r.payment.amount, timestamp: new Date(Date.now() - 3600_000) });
    expect((await submitUsdtTx(u.id, r.payment.id, old.txHash, async () => [old])).ok).toBe(false);
  });

  it("cron scan auto-matches deposits by unique amount", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const pa = await createUsdtPayment(a.id, "monthly");
    const pb = await createUsdtPayment(b.id, "quarterly");
    if (!pa.ok || !pb.ok) throw new Error();
    const n = await scanUsdtPayments(async () => [
      tx({ txHash: "1".repeat(64), value: pb.payment.amount }),
      tx({ txHash: "2".repeat(64), value: 123n }),
    ]);
    expect(n).toBe(1);
    expect(await canViewSignals(b)).toBe(true);
    expect(await canViewSignals(a)).toBe(false);
    // اجرای مجدد کرون چیزی را دوباره پردازش نمی‌کند
    expect(await scanUsdtPayments(async () => [tx({ txHash: "1".repeat(64), value: pb.payment.amount })])).toBe(0);
  });

  it("expires stale pending payments", async () => {
    const u = await makeUser();
    const r = await createUsdtPayment(u.id, "monthly");
    if (!r.ok) throw new Error();
    expect(await expireStalePayments(new Date(Date.now() + 10 * 60_000))).toBe(0);
    expect(await expireStalePayments(new Date(Date.now() + 200 * 60_000))).toBe(1);
    expect((await db.payment.findUniqueOrThrow({ where: { id: r.payment.id } })).status).toBe("EXPIRED");
  });

  it("parses TronGrid responses and ignores fake tokens / other recipients", async () => {
    const item = (o: object) => ({
      transaction_id: "f".repeat(64),
      from: "TFrom",
      to: "TTestAddress1111111111111111111111",
      value: "15370000",
      type: "Transfer",
      block_timestamp: 1760000000000,
      token_info: { address: USDT_CONTRACT, decimals: 6 },
      ...o,
    });
    const f = vi.fn(async () =>
      json({ data: [item({}), item({ token_info: { address: "TFakeToken", decimals: 6 } }), item({ to: "TOther" }), item({ type: "Approval" })], meta: {} }),
    );
    const list = await fetchIncomingUsdt(0, f);
    expect(list).toHaveLength(1);
    expect(list[0].value).toBe(15_370_000n);
    expect(formatUsdt(list[0].value)).toBe("15.37");
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain(`contract_address=${USDT_CONTRACT}`);
  });
});

describe("finalizePayment", () => {
  it("is atomic under concurrent calls", async () => {
    const u = await makeUser();
    const r = await createUsdtPayment(u.id, "monthly");
    if (!r.ok) throw new Error();
    const results = await Promise.all([finalizePayment(r.payment.id, {}), finalizePayment(r.payment.id, {}), finalizePayment(r.payment.id, {})]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.subscription.count({ where: { userId: u.id } })).toBe(1);
  });
});
