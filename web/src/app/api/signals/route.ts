import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { listSignals } from "@/lib/signals/queries";
import { canViewSignals } from "@/lib/subscription";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canViewSignals(user))) return NextResponse.json({ error: "subscription required" }, { status: 403 });
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Number(url.searchParams.get("limit") ?? 30);
  const data = await listSignals({ cursor: cursor && /^[a-z0-9]{10,40}$/.test(cursor) ? cursor : null, limit: Number.isFinite(limit) ? limit : 30 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
