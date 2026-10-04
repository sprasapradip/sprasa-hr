import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Fingerprint, List } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApprovalBadge, Skeleton, StatusBadge, type ApprovalStatus } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn, MONTH_NAMES, minutesToHours, todayISO } from '@/lib/utils';
import type { AttendanceStatus } from '@/types';

export interface Scan {
  time: string;
  device: string | null;
}

interface Day {
  date: string;
  dayType: 'WORKING' | 'WEEKEND' | 'HOLIDAY';
  holiday: string | null;
  record: { status: AttendanceStatus; checkIn: string | null; checkOut: string | null; workMinutes: number; lateMinutes: number; earlyLeaveMinutes: number; overtimeMinutes: number; remarks: string | null; source: string; approvalStatus?: ApprovalStatus | null; rejectionReason?: string | null } | null;
  scans: Scan[];
}

interface MonthData {
  year: number;
  month: number;
  days: Day[];
  totals: { present: number; halfDay: number; absent: number; late: number; leave: number; overtimeMinutes: number; lateMinutes: number; workMinutes: number };
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

type View = 'list' | 'calendar';
const VIEW_KEY = 'sprasa-attendance-view';
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'list';
  } catch {
    return 'list';
  }
}

/** Where a day's times came from, in words an employee understands. */
export function sourceLabel(source: string | undefined) {
  switch (source) {
    case 'DEVICE':
      return 'thumb machine';
    case 'EMPLOYEE':
      return 'web check-in';
    case 'MANUAL':
    case 'ADMIN':
    case 'IMPORT':
      return 'entered by HR';
    default:
      return null;
  }
}

/** The scans for one day, e.g. "09:02 · 13:00 · 17:48 at Front door". */
export function ScanTimes({ scans, className }: { scans: Scan[]; className?: string }) {
  if (scans.length === 0) return null;
  const devices = [...new Set(scans.map((s) => s.device).filter(Boolean))];
  return (
    <p className={cn('flex flex-wrap items-center gap-x-1.5 text-xs text-subtle', className)}>
      <Fingerprint className="size-3.5 shrink-0" aria-label="Scans" />
      <span className="num">{scans.map((s) => s.time).join(' · ')}</span>
      {devices.length > 0 && <span>at {devices.join(', ')}</span>}
    </p>
  );
}

function dayStatus(d: Day) {
  return d.record?.status ?? (d.dayType === 'HOLIDAY' ? 'HOLIDAY' : d.dayType === 'WEEKEND' ? 'WEEKEND' : null);
}

/** Month of one employee's attendance, as a day-by-day list or a calendar. `path` is the month endpoint. */
export function AttendanceMonth({ path }: { path: string }) {
  const today = todayISO();
  const [ym, setYm] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const [view, setViewState] = useState<View>(readView);
  const { data, isLoading } = useQuery({ queryKey: ['attendance-month', path, ym], queryFn: () => api.get<MonthData>(path, ym) });
  const [selected, setSelected] = useState<string | null>(null);
  const isCurrentMonth = ym.year === Number(today.slice(0, 4)) && ym.month === Number(today.slice(5, 7));

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(ym.year, ym.month - 1 + delta, 1));
    setYm({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    setSelected(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <h3 className="min-w-36 text-center text-sm font-semibold text-fg">
            {MONTH_NAMES[ym.month - 1]} {ym.year}
          </h3>
          <Button variant="secondary" size="icon-sm" onClick={() => shift(1)} aria-label="Next month" disabled={isCurrentMonth}>
            <ChevronRight />
          </Button>
        </div>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="View">
          {(
            [
              ['list', 'List', List],
              ['calendar', 'Calendar', CalendarDays],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn('flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors', view === v ? 'bg-surface-2 text-fg' : 'text-subtle hover:text-fg')}
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {[
              ['Present', data.totals.present + data.totals.halfDay],
              ['Late', data.totals.late],
              ['Absent', data.totals.absent],
              ['Leave', data.totals.leave],
              ['Hours worked', minutesToHours(data.totals.workMinutes)],
              ['Overtime', minutesToHours(data.totals.overtimeMinutes)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-md border border-border px-2 py-2">
                <dt className="text-[11px] text-subtle">{l}</dt>
                <dd className="num text-sm font-semibold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          {view === 'list' ? <DayList days={data.days} today={today} /> : <Calendar days={data.days} today={today} selected={selected} onSelect={setSelected} />}
        </>
      )}
    </div>
  );
}

function DayList({ days, today }: { days: Day[]; today: string }) {
  // Newest first, so today and yesterday are at the top.
  const shown = days.filter((d) => d.date <= today).reverse();
  if (shown.length === 0) return <p className="py-8 text-center text-sm text-subtle">Nothing to show for this month yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {shown.map((d) => {
        const r = d.record;
        const status = dayStatus(d);
        const off = d.dayType !== 'WORKING' && !r?.checkIn;
        return (
          <li key={d.date} className={cn('flex gap-3 px-3 py-2.5 sm:px-4', off && 'bg-surface-2/50')}>
            <div className={cn('w-10 shrink-0 text-center', d.date === today ? 'text-primary' : 'text-fg')}>
              <div className="text-[11px] font-medium uppercase text-subtle">{weekday(d.date)}</div>
              <div className="num text-lg font-semibold leading-tight">{Number(d.date.slice(8))}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {status ? <StatusBadge status={status} /> : <span className="text-xs text-subtle">No record</span>}
                <ApprovalBadge status={r?.approvalStatus} />
                {r?.checkIn && (
                  <span className="num text-sm text-fg">
                    {r.checkIn} – {r.checkOut ?? (d.date === today ? 'still in' : 'no check-out')}
                  </span>
                )}
                {d.holiday && <span className="text-xs text-subtle">{d.holiday}</span>}
              </div>
              {r && (r.lateMinutes > 0 || r.earlyLeaveMinutes > 0 || r.overtimeMinutes > 0 || r.remarks) && (
                <p className="mt-0.5 text-xs text-muted">
                  {[r.lateMinutes > 0 && `${r.lateMinutes} min late`, r.earlyLeaveMinutes > 0 && r.checkOut && `left ${r.earlyLeaveMinutes} min early`, r.overtimeMinutes > 0 && `${minutesToHours(r.overtimeMinutes)} overtime`, r.remarks]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <ScanTimes scans={d.scans} className="mt-0.5" />
            </div>
            {r && r.workMinutes > 0 && (
              <div className="shrink-0 text-right">
                <div className="num text-sm font-medium text-fg">{minutesToHours(r.workMinutes)}</div>
                <div className="text-[11px] text-subtle">worked</div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Calendar({ days, today, selected, onSelect }: { days: Day[]; today: string; selected: string | null; onSelect: (d: string) => void }) {
  const leading = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const sel = days.find((d) => d.date === selected);
  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-subtle" aria-hidden>
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Attendance calendar">
        {Array.from({ length: leading }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((d) => {
          const status = dayStatus(d);
          const future = d.date > today;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(d.date)}
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
          <p className="font-medium text-fg">
            {weekday(sel.date)} {sel.date}
          </p>
          {sel.holiday && <p className="text-subtle">Holiday: {sel.holiday}</p>}
          {sel.record ? (
            <div className="mt-1 flex flex-wrap items-center gap-3 text-muted">
              <StatusBadge status={sel.record.status} />
              <ApprovalBadge status={sel.record.approvalStatus} />
              {sel.record.checkIn && (
                <span className="num">
                  {sel.record.checkIn} – {sel.record.checkOut ?? '…'}
                </span>
              )}
              {sel.record.workMinutes > 0 && <span>{minutesToHours(sel.record.workMinutes)} worked</span>}
              {sel.record.lateMinutes > 0 && <span>{sel.record.lateMinutes} min late</span>}
              {sel.record.overtimeMinutes > 0 && <span>{minutesToHours(sel.record.overtimeMinutes)} overtime</span>}
              {sel.record.remarks && <span>{sel.record.remarks}</span>}
            </div>
          ) : (
            <p className="mt-1 text-subtle">No attendance recorded.</p>
          )}
          <ScanTimes scans={sel.scans} className="mt-2" />
          {sel.record && sourceLabel(sel.record.source) && <p className="mt-1 text-xs text-subtle">Recorded by {sourceLabel(sel.record.source)}</p>}
          {sel.record?.approvalStatus === 'REJECTED' && sel.record.rejectionReason && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">Rejected by HR: {sel.record.rejectionReason}</p>}
        </div>
      )}
    </>
  );
}
