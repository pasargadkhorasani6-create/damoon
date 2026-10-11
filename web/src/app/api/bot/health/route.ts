import { NextResponse } from "next/server";
import { verifyBotRequest } from "@/lib/bot/hmac";

/** ربات با این endpoint درستی کلید، امضا و ساعت سیستم را بررسی می‌کند */
export async function GET(req: Request) {
  const auth = await verifyBotRequest(req, "");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ ok: true, keyId: auth.keyId, serverTime: Math.floor(Date.now() / 1000) });
}
