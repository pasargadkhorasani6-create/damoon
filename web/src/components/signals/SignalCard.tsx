import type { SignalDTO } from "@/lib/signals/dto";
import { faDateTime } from "@/lib/format";
import { fmtPrice, fmtR, ORDER_LABEL, STATUS_LABEL, STATUS_STYLE } from "./labels";

export function SignalCard({ s, fresh = false }: { s: SignalDTO; fresh?: boolean }) {
  const buy = s.direction === "BUY";
  return (
    <article
      data-testid="signal-card"
      data-status={s.status}
      className={`card space-y-4 !p-5 transition ${fresh ? "ring-2 ring-brand" : ""} ${s.status === "CANCELED" ? "opacity-60" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="ltr-num text-lg font-extrabold">{s.symbol}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${buy ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
          {buy ? "خرید" : "فروش"} {ORDER_LABEL[s.orderType]}
        </span>
        {s.timeframe && <span className="ltr-num text-xs text-muted">{s.timeframe}</span>}
        <span className={`ms-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
      </header>
      <dl className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-muted">ورود</dt>
          <dd className="ltr-num mt-1 font-semibold">{fmtPrice(s.entry, s.digits)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-muted">حد ضرر</dt>
          <dd className="ltr-num mt-1 font-semibold text-down">{fmtPrice(s.stopLoss, s.digits)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-muted">حد سود</dt>
          <dd className="ltr-num mt-1 font-semibold text-up">{fmtPrice(s.takeProfit, s.digits)}</dd>
        </div>
      </dl>
      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>زمان سیگنال: {faDateTime(s.signalAt)}</span>
        {s.fillPrice != null && (
          <span>
            پرشدن: <span className="ltr-num">{fmtPrice(s.fillPrice, s.digits)}</span>
          </span>
        )}
        {s.exitPrice != null && (
          <span>
            خروج: <span className="ltr-num">{fmtPrice(s.exitPrice, s.digits)}</span>
          </span>
        )}
        {s.resultR != null && (
          <span className={`ltr-num font-bold ${s.resultR > 0 ? "text-up" : s.resultR < 0 ? "text-down" : "text-muted"}`}>{fmtR(s.resultR)}</span>
        )}
      </footer>
    </article>
  );
}
