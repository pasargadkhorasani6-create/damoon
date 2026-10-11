import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/bot/events/route";
import { GET as health } from "@/app/api/bot/health/route";
import { canonicalString, signRequest } from "@/lib/bot/hmac";
import { db } from "@/lib/db";
import { botRequest, newSignalEvent } from "./helpers";

const PATH = "/api/bot/events";
const now = () => Math.floor(Date.now() / 1000);
const send = (body: unknown, opts = {}) => POST(botRequest(PATH, body, opts));

describe("HMAC", () => {
  it("matches the shared cross-language test vector", () => {
    // همین بردار در bot/tests/test_publisher.py هم بررسی می‌شود
    expect(signRequest("test-vector-secret-0123456789abcdef0123456789", "1760000000", "abcdef0123456789", "POST", "/api/bot/events", '{"a":1}')).toBe(
      "3973c7143e0a5e6af4f2b235790907e743e9386c927a1d75585b64084b03d59a",
    );
    expect(canonicalString("1", "n", "post", "/p", "")).toBe(
      "1\nn\nPOST\n/p\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("bot API authentication", () => {
  it("accepts a valid signed health check", async () => {
    const res = await health(botRequest("/api/bot/health", undefined, { method: "GET" }));
    expect(res.status).toBe(200);
  });

  it("rejects wrong key, bad signature, old timestamp and replayed nonce", async () => {
    expect((await send(newSignalEvent(), { key: "nope" })).status).toBe(401);
    expect((await send(newSignalEvent(), { secret: "x".repeat(40) })).status).toBe(401);
    expect((await send(newSignalEvent(), { ts: now() - 1000 })).status).toBe(401);

    const ev = newSignalEvent();
    expect((await send(ev, { nonce: "fixed-nonce-1234567890" })).status).toBe(201);
    const replay = await send(ev, { nonce: "fixed-nonce-1234567890" });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: "replayed nonce" });
  });

  it("rejects a tampered body", async () => {
    const req = botRequest(PATH, newSignalEvent());
    const tampered = new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(newSignalEvent({ entry: 1 })) });
    expect((await POST(tampered)).status).toBe(401);
  });

  it("validates payloads", async () => {
    const r1 = await send({ type: "signal.new", externalId: "x" });
    expect(r1.status).toBe(422);
    const r2 = await send(newSignalEvent({ direction: "BUY", stopLoss: 2410 }));
    expect(r2.status).toBe(422);
    expect((await r2.json()).error).toContain("stopLoss");
  });
});

describe("signal lifecycle", () => {
  it("new → activated → closed by TP computes R from real prices", async () => {
    const ev = newSignalEvent();
    const created = await send(ev);
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.signal).toMatchObject({ symbol: "XAUUSD", status: "PENDING", entry: 2400 });

    // تکرار سیگنال جدید idempotent است
    const dup = await send(ev);
    expect(dup.status).toBe(200);
    expect((await dup.json()).duplicate).toBe(true);

    expect((await send({ type: "signal.activated", externalId: ev.externalId, fillPrice: 2400.5, at: now() })).status).toBe(200);
    const closed = await send({ type: "signal.closed", externalId: ev.externalId, exitPrice: 2405, reason: "TP", at: now() });
    const cj = await closed.json();
    expect(cj.signal.status).toBe("TP_HIT");
    // ریسک = 2400.5 - 2395 = 5.5 ؛ سود = 4.5 → 0.818R
    expect(cj.signal.resultR).toBeCloseTo(0.818, 3);

    const events = await db.signalEvent.count({ where: { signal: { externalId: ev.externalId } } });
    expect(events).toBe(3);
  });

  it("SELL stopped out gives -1R and unknown reason is classified", async () => {
    const ev = newSignalEvent({ symbol: "EURUSD", direction: "SELL", entry: 1.1, stopLoss: 1.101, takeProfit: 1.099, digits: 5 });
    await send(ev);
    await send({ type: "signal.activated", externalId: ev.externalId, fillPrice: 1.1, at: now() });
    const r = await (await send({ type: "signal.closed", externalId: ev.externalId, exitPrice: 1.101, at: now() })).json();
    expect(r.signal.status).toBe("SL_HIT");
    expect(r.signal.resultR).toBeCloseTo(-1, 6);
  });

  it("pending order can be canceled and then not closed", async () => {
    const ev = newSignalEvent();
    await send(ev);
    expect((await send({ type: "signal.canceled", externalId: ev.externalId, reason: "expired", at: now() })).status).toBe(200);
    expect((await send({ type: "signal.canceled", externalId: ev.externalId, at: now() })).status).toBe(200);
    expect((await send({ type: "signal.closed", externalId: ev.externalId, exitPrice: 2400, at: now() })).status).toBe(409);
    expect((await send({ type: "signal.activated", externalId: ev.externalId, fillPrice: 2400, at: now() })).status).toBe(409);
  });

  it("active trade cannot be canceled (no hiding losers)", async () => {
    const ev = newSignalEvent();
    await send(ev);
    await send({ type: "signal.activated", externalId: ev.externalId, fillPrice: 2400, at: now() });
    expect((await send({ type: "signal.canceled", externalId: ev.externalId, at: now() })).status).toBe(409);
  });

  it("close with fillPrice works if activation was missed", async () => {
    const ev = newSignalEvent();
    await send(ev);
    const r = await send({ type: "signal.closed", externalId: ev.externalId, exitPrice: 2395, fillPrice: 2400, reason: "SL", at: now() });
    expect((await r.json()).signal).toMatchObject({ status: "SL_HIT", resultR: -1, fillPrice: 2400 });
    const noFill = newSignalEvent();
    await send(noFill);
    expect((await send({ type: "signal.closed", externalId: noFill.externalId, exitPrice: 2395, at: now() })).status).toBe(422);
  });

  it("updates stop loss (breakeven) on active trade; R stays based on initial stop", async () => {
    const ev = newSignalEvent();
    await send(ev);
    await send({ type: "signal.activated", externalId: ev.externalId, fillPrice: 2400, at: now() });
    expect((await send({ type: "signal.updated", externalId: ev.externalId, stopLoss: 2400, at: now() })).status).toBe(200);
    const r = await (await send({ type: "signal.closed", externalId: ev.externalId, exitPrice: 2400, at: now() })).json();
    expect(r.signal.status).toBe("SL_HIT");
    expect(r.signal.resultR).toBe(0);
  });

  it("unknown externalId is 404", async () => {
    expect((await send({ type: "signal.activated", externalId: "nope-1", fillPrice: 1, at: now() })).status).toBe(404);
  });
});
