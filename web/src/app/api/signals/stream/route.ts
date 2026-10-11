import { getCurrentUser } from "@/lib/auth/current";
import { validateSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { createSignalStream } from "@/lib/signals/stream";
import { canViewSignals } from "@/lib/subscription";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** فید لحظه‌ای سیگنال‌ها (Server-Sent Events)، فقط برای مشترکین فعال */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (!(await canViewSignals(user))) return new Response("subscription required", { status: 403 });

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const stream = createSignalStream({
    abortSignal: req.signal,
    // سشن (خروج/مسدودی) و اشتراک دوباره بررسی می‌شوند
    stillAllowed: async () => {
      const s = await validateSessionToken(token);
      return !!s && (await canViewSignals(s.user));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
