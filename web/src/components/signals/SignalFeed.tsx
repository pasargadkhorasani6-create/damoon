"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalDTO } from "@/lib/signals/dto";
import type { RealtimeMessage } from "@/lib/realtime";
import { SignalCard } from "./SignalCard";

type Conn = "connecting" | "live" | "offline" | "expired";

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.15);
  } catch {
    /* مرورگر پشتیبانی نمی‌کند */
  }
}

function sortSignals(list: SignalDTO[]) {
  return [...list].sort((a, b) => (a.signalAt < b.signalAt ? 1 : a.signalAt > b.signalAt ? -1 : a.id < b.id ? 1 : -1));
}

export function SignalFeed({ initial, initialCursor }: { initial: SignalDTO[]; initialCursor: string | null }) {
  const [signals, setSignals] = useState<SignalDTO[]>(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [conn, setConn] = useState<Conn>("connecting");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [sound, setSound] = useState(false);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const [filter, setFilter] = useState<"all" | "open">("all");

  const upsert = useCallback((s: SignalDTO) => {
    setSignals((prev) => sortSignals([s, ...prev.filter((p) => p.id !== s.id)]));
    setFresh((f) => new Set(f).add(s.id));
    setTimeout(() => setFresh((f) => {
      const n = new Set(f);
      n.delete(s.id);
      return n;
    }), 8000);
  }, []);

  // بعد از قطع و وصل، آخرین وضعیت‌ها دوباره گرفته می‌شود تا رویدادی جا نماند
  const refresh = useCallback(async () => {
    const res = await fetch("/api/signals?limit=30", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: SignalDTO[] };
    setSignals((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const s of data.items) map.set(s.id, s);
      return sortSignals([...map.values()]);
    });
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/signals/stream");
    let opened = false;
    es.addEventListener("ready", () => {
      setConn("live");
      if (opened) void refresh();
      opened = true;
    });
    es.addEventListener("signal", (e) => {
      const m = JSON.parse((e as MessageEvent).data) as RealtimeMessage;
      upsert(m.signal);
      if (soundRef.current && (m.change === "created" || m.change === "closed")) beep();
    });
    es.addEventListener("expired", () => {
      setConn("expired");
      es.close();
    });
    es.onerror = () => setConn((c) => (c === "expired" ? c : "offline"));
    return () => es.close();
  }, [refresh, upsert]);

  async function loadMore() {
    if (!cursor) return;
    const res = await fetch(`/api/signals?cursor=${cursor}&limit=30`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: SignalDTO[]; nextCursor: string | null };
    setSignals((prev) => sortSignals([...prev, ...data.items.filter((s) => !prev.some((p) => p.id === s.id))]));
    setCursor(data.nextCursor);
  }

  const shown = filter === "open" ? signals.filter((s) => s.status === "PENDING" || s.status === "ACTIVE") : signals;
  const connLabel: Record<Conn, [string, string]> = {
    connecting: ["در حال اتصال…", "bg-muted"],
    live: ["اتصال لحظه‌ای برقرار است", "bg-up"],
    offline: ["قطع اتصال؛ تلاش مجدد…", "bg-down"],
    expired: ["اشتراک شما به پایان رسیده است", "bg-down"],
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-2 text-muted" data-testid="conn-state" data-state={conn}>
          <span className={`h-2.5 w-2.5 rounded-full ${connLabel[conn][1]} ${conn === "live" ? "animate-pulse" : ""}`} />
          {connLabel[conn][0]}
        </span>
        <div className="ms-auto flex gap-2">
          <button type="button" onClick={() => setFilter(filter === "all" ? "open" : "all")} className="btn-ghost !px-3 !py-1.5 text-xs">
            {filter === "all" ? "فقط باز" : "همه"}
          </button>
          <button type="button" onClick={() => setSound(!sound)} className="btn-ghost !px-3 !py-1.5 text-xs" aria-pressed={sound}>
            صدای اعلان: {sound ? "روشن" : "خاموش"}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card text-center text-muted">هنوز سیگنالی ثبت نشده است. سیگنال‌های جدید به‌صورت خودکار اینجا نمایش داده می‌شوند.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((s) => (
            <SignalCard key={s.id} s={s} fresh={fresh.has(s.id)} />
          ))}
        </div>
      )}
      {cursor && filter === "all" && (
        <button type="button" onClick={loadMore} className="btn-ghost w-full">
          سیگنال‌های قدیمی‌تر
        </button>
      )}
    </div>
  );
}
