import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, hashSessionToken, revokeSessionToken, validateSessionToken } from "@/lib/auth/session";
import { issueOtp, OTP_MAX_ATTEMPTS, verifyOtp } from "@/lib/auth/otp";
import * as auth from "@/lib/auth/service";
import * as sms from "@/lib/sms/melipayamak";
import { makeUser } from "./helpers";

/** کد ارسال‌شده را از ماژول پیامک می‌گیرد */
function captureSms() {
  const codes: string[] = [];
  const spy = vi.spyOn(sms, "sendOtpSms").mockImplementation(async (_to, code) => {
    codes.push(code);
  });
  return { codes, spy };
}

describe("password hashing", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
    expect(await verifyPassword("garbage", "x")).toBe(false);
  });
});

describe("sessions", () => {
  it("stores only a hash and validates the raw token", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    const row = await db.session.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.tokenHash).toBe(hashSessionToken(token));
    expect(row.tokenHash).not.toContain(token);
    expect((await validateSessionToken(token))?.user.id).toBe(u.id);
    expect(await validateSessionToken("nope")).toBeNull();
    await revokeSessionToken(token);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("rejects expired sessions and banned users", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(token)).toBeNull();

    const { token: t2 } = await createSession(u.id);
    await db.user.update({ where: { id: u.id }, data: { bannedAt: new Date() } });
    expect(await validateSessionToken(t2)).toBeNull();
  });
});

describe("otp", () => {
  it("is single-use and stored hashed", async () => {
    const r = await issueOtp("09120000001", "LOGIN");
    if (!r.ok) throw new Error("expected ok");
    const row = await db.otpCode.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.codeHash).not.toContain(r.code);
    expect((await verifyOtp("09120000001", "LOGIN", r.code)).ok).toBe(true);
    expect(await verifyOtp("09120000001", "LOGIN", r.code)).toEqual({ ok: false, reason: "not_found" });
  });

  it("is scoped to purpose and phone", async () => {
    const r = await issueOtp("09120000002", "LOGIN");
    if (!r.ok) throw new Error();
    expect((await verifyOtp("09120000002", "RESET_PASSWORD", r.code)).ok).toBe(false);
    expect((await verifyOtp("09120000003", "LOGIN", r.code)).ok).toBe(false);
  });

  it("locks after too many attempts", async () => {
    const r = await issueOtp("09120000004", "LOGIN");
    if (!r.ok) throw new Error();
    const wrong = r.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await verifyOtp("09120000004", "LOGIN", wrong);
    expect(await verifyOtp("09120000004", "LOGIN", r.code)).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("expires", async () => {
    const r = await issueOtp("09120000005", "LOGIN");
    if (!r.ok) throw new Error();
    await db.otpCode.update({ where: { id: r.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await verifyOtp("09120000005", "LOGIN", r.code)).toEqual({ ok: false, reason: "expired" });
  });

  it("enforces resend cooldown", async () => {
    expect((await issueOtp("09120000006", "LOGIN")).ok).toBe(true);
    const second = await issueOtp("09120000006", "LOGIN");
    expect(second.ok).toBe(false);
  });
});

describe("auth service", () => {
  it("registers only after verifying the mobile code", async () => {
    const { codes } = captureSms();
    const input = { name: "علی", email: "ali@example.com", phone: "09121112233", password: "pass-12345" };
    expect((await auth.startRegistration(input, "1.1.1.1")).ok).toBe(true);
    expect(await db.user.count()).toBe(0);

    const bad = await auth.completeRegistration(input.phone, codes[0] === "123456" ? "654321" : "123456");
    expect(bad.ok).toBe(false);

    const res = await auth.completeRegistration(input.phone, codes[0]);
    expect(res.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: "ali@example.com" } });
    expect(await verifyPassword(user.passwordHash, "pass-12345")).toBe(true);

    const dup = await auth.startRegistration(input, "1.1.1.1");
    expect(dup.ok).toBe(false);
  });

  it("logs in with email/password and rejects wrong passwords", async () => {
    const u = await makeUser({ email: "a@b.com", password: "right-pass-1" });
    expect(await auth.loginWithPassword("a@b.com", "right-pass-1", "2.2.2.2")).toEqual({ ok: true, userId: u.id });
    expect((await auth.loginWithPassword("a@b.com", "wrong", "2.2.2.2")).ok).toBe(false);
    expect((await auth.loginWithPassword("none@b.com", "x", "2.2.2.2")).ok).toBe(false);
  });

  it("rate-limits password guessing per email", async () => {
    await makeUser({ email: "rl@b.com", password: "right-pass-1" });
    for (let i = 0; i < 8; i++) await auth.loginWithPassword("rl@b.com", "wrong", `3.3.3.${i}`);
    const r = await auth.loginWithPassword("rl@b.com", "right-pass-1", "3.3.3.99");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("تعداد درخواست");
  });

  it("logs in with mobile OTP and does not reveal unknown numbers", async () => {
    const { codes, spy } = captureSms();
    const u = await makeUser({ phone: "09125556677" });
    expect((await auth.startPhoneLogin("09129998877", "4.4.4.4")).ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();

    expect((await auth.startPhoneLogin("09125556677", "4.4.4.4")).ok).toBe(true);
    expect(await auth.completePhoneLogin("09125556677", codes[0])).toEqual({ ok: true, userId: u.id });
  });

  it("resets the password and revokes all sessions", async () => {
    const { codes } = captureSms();
    const u = await makeUser({ phone: "09123334455", password: "old-pass-123" });
    const { token } = await createSession(u.id);
    await auth.startPasswordReset("09123334455", "5.5.5.5");
    expect((await auth.completePasswordReset("09123334455", codes[0], "new-pass-123")).ok).toBe(true);
    expect(await validateSessionToken(token)).toBeNull();
    expect((await auth.loginWithPassword(u.email, "new-pass-123", "5.5.5.5")).ok).toBe(true);
  });

  it("blocks banned users from logging in", async () => {
    const u = await makeUser({ email: "ban@b.com", password: "right-pass-1" });
    await db.user.update({ where: { id: u.id }, data: { bannedAt: new Date() } });
    expect((await auth.loginWithPassword("ban@b.com", "right-pass-1", "6.6.6.6")).ok).toBe(false);
  });
});
