import { NextResponse } from "next/server";
import { handleZarinpalCallback } from "@/lib/payments/service";
import { env } from "@/lib/env";

/** بازگشت کاربر از زرین‌پال؛ نتیجه فقط پس از verify سمت سرور پذیرفته می‌شود */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const res = await handleZarinpalCallback({
    authority: url.searchParams.get("Authority"),
    status: url.searchParams.get("Status"),
    pid: url.searchParams.get("pid"),
  });
  const target = new URL("/dashboard/subscription", env().APP_URL);
  target.searchParams.set("payment", res.ok ? "success" : "failed");
  if (res.paymentId) target.searchParams.set("id", res.paymentId);
  return NextResponse.redirect(target, 303);
}
