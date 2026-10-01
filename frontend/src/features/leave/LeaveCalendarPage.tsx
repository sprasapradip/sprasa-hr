import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { FilterSelect, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, MONTH_NAMES, todayISO } from '@/lib/utils';
import { departmentOptions, useDepartments } from '@/services/lookups';
import { LeaveRequestDrawer } from './LeaveRequestDrawer';

interface CalendarData {
  requests: { id: string; employeeName: string; department: string | null; leaveType: string; leaveTypeCode: string; startDate: string; endDate: string; halfDay: boolean; status: string }[];
  holidays: { id: string; name: string; date: string; type: string }[];
}

const TYPE_COLORS = ['bg-teal-100 text-teal-900 dark:bg-teal-900/60 dark:text-teal-100', 'bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-100', 'bg-violet-100 text-violet-900 dark:bg-violet-900/60 dark:text-violet-100', 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100', 'bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-100', 'bg-lime-100 text-lime-900 dark:bg-lime-900/60 dark:text-lime-100'];

export default function LeaveCalendarPage() {
  const t = todayISO();
  const [ym, setYm] = useState({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) });
  const [departmentId, setDepartmentId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const workingDays = useAuth().user?.organisation.workingDays ?? [7, 1, 2, 3, 4, 5];
  const { data: departments } = useDepartments();
  const first = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
  const last = `${ym.y}-${String(ym.m).padStart(2, '0')}-${lastDay}`;
  const { data, isLoading } = useQuery({ queryKey: ['leave-calendar', first, departmentId], queryFn: () => api.get<CalendarData>('/leave/calendar', { from: first, to: last, departmentId }) });
  const move = (d: number) => {
    const x = new Date(Date.UTC(ym.y, ym.m - 1 + d, 1));
    setYm({ y: x.getUTCFullYear(), m: x.getUTCMonth() + 1 });
  };
  const codes = [...new Set(data?.requests.map((r) => r.leaveTypeCode))].sort();
  const colorOf = (code: string) => TYPE_COLORS[codes.indexOf(code) % TYPE_COLORS.length];
  const leading = new Date(`${first}T00:00:00Z`).getUTCDay();
  const days = Array.from({ length: lastDay }, (_, i) => `${ym.y}-${String(ym.m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);

  return (
    <div className="space-y-4">
      <PageHeader title="Leave calendar" description="Approved and pending leave. Dashed entries are still waiting for approval." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Button variant="secondary" size="icon-sm" onClick={() => move(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <h2 className="min-w-36 text-center text-sm font-semibold text-fg">
            {MONTH_NAMES[ym.m - 1]} {ym.y}
          </h2>
          <Button variant="secondary" size="icon-sm" onClick={() => move(1)} aria-label="Next month">
            <ChevronRight />
          </Button>
          <div className="ml-auto">
            <FilterSelect label="Department" value={departmentId} onChange={setDepartmentId} options={departmentOptions(departments)} />
          </div>
        </div>
        {isLoading || !data ? (
          <Skeleton className="m-3 h-96" />
        ) : (
          <div className="p-3">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="bg-surface-2 px-2 py-1.5 font-medium text-subtle">
                  {d}
                </div>
              ))}
              {Array.from({ length: leading }).map((_, i) => (
                <div key={`p${i}`} className="bg-surface-2/40" />
              ))}
              {days.map((d) => {
                const holiday = data.holidays.find((h) => h.date === d);
                const reqs = data.requests.filter((r) => r.startDate <= d && r.endDate >= d);
                const weekend = !workingDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay() || 7);
                return (
                  <div key={d} className={cn('min-h-24 bg-surface p-1.5', (weekend || holiday) && 'bg-surface-2/70')}>
                    <div className="flex items-center justify-between">
                      <span className={cn('num text-xs', d === t ? 'flex size-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-fg' : 'text-muted')}>{Number(d.slice(8))}</span>
                    </div>
                    {holiday && <p className="mt-1 truncate text-[10px] font-medium text-sky-700 dark:text-sky-300">{holiday.name}</p>}
                    <ul className="mt-1 space-y-0.5">
                      {reqs.slice(0, 3).map((r) => (
                        <li key={r.id}>
                          <button type="button" onClick={() => setOpenId(r.id)} className={cn('w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-[10.5px]', colorOf(r.leaveTypeCode), r.status !== 'APPROVED' && 'border border-dashed border-current opacity-80')} title={`${r.employeeName} · ${r.leaveType}`}>
                            {r.employeeName.split(' ')[0]} · {r.leaveTypeCode}
                          </button>
                        </li>
                      ))}
                      {reqs.length > 3 && <li className="px-1 text-[10px] text-subtle">+{reqs.length - 3} more</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-subtle">
              {codes.map((c) => (
                <span key={c} className={cn('rounded px-1.5 py-0.5', colorOf(c))}>
                  {data.requests.find((r) => r.leaveTypeCode === c)?.leaveType}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
      <LeaveRequestDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
