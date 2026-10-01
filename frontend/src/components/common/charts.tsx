import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact } from '@/lib/utils';

/** Categorical palette with distinct hues that hold up in light and dark themes. */
export const CHART_COLORS = ['#0f766e', '#0284c7', '#d97706', '#7c3aed', '#e11d48', '#64748b', '#0ea5a4', '#ca8a04'];
export const STATUS_COLORS: Record<string, string> = {
  Present: '#059669',
  Late: '#d97706',
  'On leave': '#7c3aed',
  Absent: '#e11d48',
  'Not marked': '#94a3b8',
};

const axis = { stroke: 'var(--subtle)', fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--fg)' },
  labelStyle: { color: 'var(--fg)', fontWeight: 600 },
  cursor: { fill: 'var(--surface-2)' },
};

export function ChartFrame({ height = 260, children, label }: { height?: number; children: ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function HBarChart({ data, x, y, label, height, color = CHART_COLORS[0], valueFormatter }: { data: Record<string, unknown>[]; x: string; y: string; label: string; height?: number; color?: string; valueFormatter?: (v: number) => string }) {
  return (
    <ChartFrame label={label} height={height ?? Math.max(160, data.length * 34 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" {...axis} allowDecimals={false} tickFormatter={valueFormatter ? (v) => valueFormatter(Number(v)) : undefined} />
        <YAxis type="category" dataKey={y} {...axis} width={110} />
        <Tooltip {...tooltipStyle} formatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : String(v))} />
        <Bar dataKey={x} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ChartFrame>
  );
}

export function VBarChart({ data, x, series, label, height = 260, stacked, valueFormatter }: { data: Record<string, unknown>[]; x: string; series: { key: string; name: string; color: string }[]; label: string; height?: number; stacked?: boolean; valueFormatter?: (v: number) => string }) {
  return (
    <ChartFrame label={label} height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} width={48} tickFormatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : formatCompact(Number(v)))} />
        <Tooltip {...tooltipStyle} formatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : String(v))} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 'a' : undefined} radius={stacked ? undefined : [4, 4, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

export function TrendChart({ data, x, series, label, height = 260, valueFormatter }: { data: Record<string, unknown>[]; x: string; series: { key: string; name: string; color: string }[]; label: string; height?: number; valueFormatter?: (v: number) => string }) {
  return (
    <ChartFrame label={label} height={height}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} width={52} tickFormatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : formatCompact(Number(v)))} />
        <Tooltip {...tooltipStyle} formatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : String(v))} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

export function DonutChart({ data, label, height = 220, colors }: { data: { name: string; value: number }[]; label: string; height?: number; colors?: Record<string, string> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative w-full max-w-[220px]">
        <ChartFrame label={label} height={height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
              {data.map((d, i) => (
                <Cell key={d.name} fill={colors?.[d.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ChartFrame>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-2xl font-semibold text-fg">{total}</span>
          <span className="text-xs text-subtle">total</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted">
              <span className="size-2.5 rounded-full" style={{ background: colors?.[d.name] ?? CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden />
              {d.name}
            </span>
            <span className="num font-medium text-fg">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
