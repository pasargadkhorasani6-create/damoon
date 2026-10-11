"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EquityPoint } from "@/lib/performance/stats";

const BRAND = "#f5b942";
const POS = "#38bdf8";
const NEG = "#ef4444";
const GRID = "#24314d";
const MUTED = "#94a3b8";

const faNum = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", year: "numeric", month: "short", day: "numeric" });
const tooltipStyle = { background: "#0b1120", border: `1px solid ${GRID}`, borderRadius: 12, color: "#e6ebf5", direction: "rtl" as const };

export function EquityChart({ data }: { data: EquityPoint[] }) {
  const series = [{ n: 0, at: data[0]?.at ?? "", cumR: 0, drawdownR: 0 }, ...data];
  return (
    <div className="h-72 w-full" dir="ltr" role="img" aria-label="نمودار equity: مجموع تجمعی R پس از هر معامله">
      <ResponsiveContainer>
        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.25} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="n" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}R`} />
          <ReferenceLine y={0} stroke={MUTED} strokeOpacity={0.5} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
            labelFormatter={(n, p) => (Number(n) === 0 ? "شروع" : `معامله‌ی ${faNum.format(Number(n))} — ${p?.[0] ? date.format(new Date(p[0].payload.at)) : ""}`)}
            formatter={(v) => [`${faNum.format(Number(v))}R`, "مجموع R"]}
          />
          <Area type="linear" dataKey="cumR" stroke={BRAND} strokeWidth={2} fill="url(#eqFill)" dot={false} activeDot={{ r: 5, stroke: "#111a2e", strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyChart({ data }: { data: { month: string; trades: number; totalR: number }[] }) {
  return (
    <div className="h-56 w-full" dir="ltr" role="img" aria-label="مجموع R هر ماه">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}R`} />
          <ReferenceLine y={0} stroke={MUTED} strokeOpacity={0.5} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: GRID, fillOpacity: 0.4 }}
            formatter={(v, _n, p) => [`${Number(v) > 0 ? "+" : ""}${faNum.format(Number(v))}R (${faNum.format(p.payload.trades)} معامله)`, "نتیجه"]}
          />
          <Bar dataKey="totalR" radius={[4, 4, 4, 4]} maxBarSize={36} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.totalR >= 0 ? POS : NEG} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
