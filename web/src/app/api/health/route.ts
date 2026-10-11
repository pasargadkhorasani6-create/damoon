import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** برای healthcheck داکر/مانیتورینگ؛ اطلاعات حساسی برنمی‌گرداند */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    await redis().ping();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
