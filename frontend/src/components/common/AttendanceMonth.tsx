import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton, StatusBadge } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn, MONTH_NAMES, minutesToHours, todayISO } from '@/lib/utils';
import type { AttendanceStatus } from '@/types';

interface MonthData {
  year: number;
  month: number;
  days: { date: string; dayType: 'WORKING' | 'WEEKEND' | 'HOLIDAY'; holiday: string | null; record: { status: AttendanceStatus; checkIn: string | null; checkOut: string | null; lateMinutes: number; overtimeMinutes: number; remarks: string | null } | null }[];
  totals: { present: number; halfDay: number; absent: number; late: number; leave: number; overtimeMinutes: number; lateMinutes: number };
}

const dot: Record<string, string> = {
  PRESENT: 'bg-emerald-500',
  LATE: 'bg-amber-500',
  ABSENT: 'bg-rose-500',
  HALF_DAY: 'bg-amber-300',
  LEAVE: 'bg-violet-500',
  WORK_FROM_HOME: 'bg-teal-500',
  HOLIDAY: 'bg-sky-500',
  WEEKEND: 'bg-slate-300',
};

/** Month calendar of one employee's attendance. `path` is the month endpoint. */
export function AttendanceMonth({ path }: { path: string }) {
  const today = todayISO();
  const [ym, setYm] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const { data, isLoading } = useQuery({ queryKey: ['attendance-month', path, ym], queryFn: () => api.get<MonthData>(path, ym) });
  const [selected, setSelected] = useState<string | null>(null);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(ym.year, ym.month - 1 + delta, 1));
    setYm({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    setSelected(null);
  };
  const leading = data ? new Date(`${data.days[0].date}T00:00:00Z`).getUTCDay() : 0;
  const sel = data?.days.find((d) => d.date === selected);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">
          {MONTH_NAMES[ym.month - 1]} {ym.year}
        </h3>
        <div className="flex gap-1">
          <Button variant="secondary" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="icon-sm" onClick={() => shift(1)} aria-label="Next month" disabled={ym.year === Number(today.slice(0, 4)) && ym.month === Number(today.slice(5, 7))}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      {isLoading || !data ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {[
              ['Present', data.totals.present],
              ['Late', data.totals.late],
              ['Half day', data.totals.halfDay],
              ['Absent', data.totals.absent],
              ['Leave', data.totals.leave],
              ['Overtime', minutesToHours(data.totals.overtimeMinutes)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-md border border-border px-2 py-2">
                <dt className="text-[11px] text-subtle">{l}</dt>
                <dd className="num text-sm font-semibold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-subtle" aria-hidden>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Attendance calendar">
            {Array.from({ length: leading }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {data.days.map((d) => {
              const status = d.record?.status ?? (d.dayType === 'HOLIDAY' ? 'HOLIDAY' : d.dayType === 'WEEKEND' ? 'WEEKEND' : null);
              const future = d.date > today;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelected(d.date)}
                  aria-label={`${d.date}: ${status ?? (future ? 'upcoming' : 'no record')}`}
                  className={cn(
                    'flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border text-xs transition-colors sm:aspect-auto sm:h-14',
                    selected === d.date ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-surface-2',
                    d.dayType !== 'WORKING' && 'bg-surface-2/60',
                    d.date === today && 'font-semibold',
                  )}
                >
                  <span className={cn('num', future ? 'text-subtle' : 'text-fg')}>{Number(d.date.slice(8))}</span>
                  {status && <span className={cn('mt-1 size-1.5 rounded-full', dot[status])} aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-subtle">
            {Object.entries(dot).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1">
                <span className={cn('size-2 rounded-full', c)} aria-hidden /> {s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          {sel && (
            <div className="mt-4 rounded-md border border-border p-3 text-sm" aria-live="polite">
              <p className="font-medium text-fg">{sel.date}</p>
              {sel.holiday && <p className="text-subtle">Holiday: {sel.holiday}</p>}
              {sel.record ? (
                <div className="mt-1 flex flex-wrap items-center gap-3 text-muted">
                  <StatusBadge status={sel.record.status} />
                  {sel.record.checkIn && (
                    <span className="num">
                      {sel.record.checkIn} – {sel.record.checkOut ?? '…'}
                    </span>
                  )}
                  {sel.record.lateMinutes > 0 && <span>{sel.record.lateMinutes} min late</span>}
                  {sel.record.overtimeMinutes > 0 && <span>{minutesToHours(sel.record.overtimeMinutes)} overtime</span>}
                  {sel.record.remarks && <span>{sel.record.remarks}</span>}
                </div>
              ) : (
                <p className="mt-1 text-subtle">No attendance recorded.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
