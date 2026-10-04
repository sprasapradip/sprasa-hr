import { useQuery } from '@tanstack/react-query';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { ScanTimes, sourceLabel, type Scan } from '@/components/common/AttendanceMonth';
import { Button } from '@/components/ui/button';
import { Card, Skeleton, StatusBadge } from '@/components/ui/display';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { minutesToHours } from '@/lib/utils';

export interface TodayAttendance {
  attendanceToday: { checkIn: string | null; checkOut: string | null; status: string; lateMinutes: number; workMinutes: number; source: string } | null;
  scansToday: Scan[];
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
function nowMinutes(timezone = 'Asia/Kathmandu') {
  return toMinutes(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
}

/** Today's status with check-in / check-out buttons. Reads the same query as the employee dashboard. */
export function TodayAttendanceCard() {
  const { data, isLoading } = useQuery({ queryKey: ['my-dashboard'], queryFn: () => api.get<TodayAttendance>('/me/dashboard') });
  const inv = [['my-dashboard'], ['attendance-month']];
  const checkIn = useApiMutation(() => api.post('/me/attendance/check-in'), { success: 'Checked in. Have a good day.', invalidate: inv });
  const checkOut = useApiMutation(() => api.post('/me/attendance/check-out'), { success: 'Checked out', invalidate: inv });
  const a = data?.attendanceToday;
  const sinceIn = a?.checkIn && !a.checkOut ? nowMinutes() - toMinutes(a.checkIn) : null;
  const via = sourceLabel(a?.source);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
            <Clock className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-fg">Today’s attendance</p>
            {isLoading ? (
              <Skeleton className="h-4 w-40" />
            ) : a?.checkIn ? (
              <>
                <p className="num flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  <StatusBadge status={a.status} />
                  <span>In {a.checkIn}</span>
                  {a.checkOut && <span>· Out {a.checkOut}</span>}
                  {a.lateMinutes > 0 && <span>· {a.lateMinutes} min late</span>}
                </p>
                <p className="text-xs text-subtle">
                  {a.checkOut ? `${minutesToHours(a.workMinutes)} worked` : sinceIn !== null && sinceIn > 0 ? `${minutesToHours(sinceIn)} since you checked in` : null}
                  {via && ` · recorded by ${via}`}
                </p>
              </>
            ) : a ? (
              <StatusBadge status={a.status} />
            ) : (
              <p className="text-sm text-muted">No check-in yet today. Scan your thumb at the machine, or check in here.</p>
            )}
            <ScanTimes scans={data?.scansToday ?? []} />
          </div>
        </div>
        <div className="flex gap-2">
          {!a?.checkIn && (
            <Button size="lg" onClick={() => checkIn.mutate()} loading={checkIn.isPending} disabled={Boolean(a)}>
              <LogIn /> Check in
            </Button>
          )}
          {a?.checkIn && !a.checkOut && (
            <Button size="lg" variant="secondary" onClick={() => checkOut.mutate()} loading={checkOut.isPending}>
              <LogOut /> Check out
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
