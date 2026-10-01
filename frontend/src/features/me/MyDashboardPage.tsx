import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, LogIn, LogOut, Plane, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Money, PageHeader } from '@/components/common';
import { LeaveBalanceCards } from '@/components/common/LeaveBalanceCards';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState, Skeleton, Stat, StatusBadge } from '@/components/ui/display';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate } from '@/lib/utils';
import type { LeaveBalance } from '@/types';
import { ApplyLeaveDialog } from '../leave/ApplyLeaveDialog';

interface MyDashboard {
  today: string;
  attendanceToday: { checkIn: string | null; checkOut: string | null; status: string; lateMinutes: number } | null;
  monthTotals: { present: number; absent: number; late: number; leave: number; halfDay: number };
  leaveBalances: LeaveBalance[];
  recentLeave: { id: string; leaveType: string; startDate: string; endDate: string; totalDays: number; status: string }[];
  latestPayslip: { id: string; period: string; netSalary: number } | null;
  unreadNotifications: number;
  upcomingHolidays: { name: string; date: string }[];
}

export default function MyDashboardPage() {
  const { user } = useAuth();
  const [applyOpen, setApplyOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['my-dashboard'], queryFn: () => api.get<MyDashboard>('/me/dashboard') });
  const inv = [['my-dashboard'], ['attendance-month']];
  const checkIn = useApiMutation(() => api.post('/me/attendance/check-in'), { success: 'Checked in. Have a good day.', invalidate: inv });
  const checkOut = useApiMutation(() => api.post('/me/attendance/check-out'), { success: 'Checked out', invalidate: inv });
  const a = data?.attendanceToday;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Namaste, ${user?.employee?.firstName ?? user?.name.split(' ')[0]}`}
        description={data && formatDate(data.today, 'long')}
        actions={
          <Button onClick={() => setApplyOpen(true)}>
            <Plane /> Apply for leave
          </Button>
        }
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
              <Clock className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">Today’s attendance</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-4 w-40" />
              ) : a?.checkIn ? (
                <p className="num text-sm text-muted">
                  In {a.checkIn}
                  {a.checkOut ? ` · Out ${a.checkOut}` : ''} {a.lateMinutes > 0 && `· ${a.lateMinutes} min late`}
                </p>
              ) : a ? (
                <StatusBadge status={a.status} />
              ) : (
                <p className="text-sm text-muted">You haven’t checked in yet.</p>
              )}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Present this month" value={data?.monthTotals.present} tone="green" loading={isLoading} />
        <Stat label="Late this month" value={data?.monthTotals.late} tone="amber" loading={isLoading} />
        <Stat label="Leave this month" value={data?.monthTotals.leave} tone="violet" loading={isLoading} />
        <Stat
          label="Latest payslip"
          value={data?.latestPayslip ? <Money value={data.latestPayslip.netSalary} /> : '—'}
          hint={data?.latestPayslip && <Link to={`/app/payslips/${data.latestPayslip.id}`} className="text-primary hover:underline">{data.latestPayslip.period}</Link>}
          icon={<Receipt />}
          loading={isLoading}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Leave balance</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app/me/leave">My leave</Link>
          </Button>
        </div>
        <LeaveBalanceCards balances={data?.leaveBalances} loading={isLoading} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent leave requests" />
          {data?.recentLeave.length ? (
            <ul className="divide-y divide-border">
              {data.recentLeave.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>
                    <span className="font-medium text-fg">{r.leaveType}</span>
                    <span className="num ml-2 text-subtle">
                      {formatDate(r.startDate)}
                      {r.endDate !== r.startDate && ` – ${formatDate(r.endDate)}`}
                    </span>
                  </span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No leave requests yet" className="py-8" />
          )}
        </Card>
        <Card>
          <CardHeader title="Upcoming holidays" />
          <CardBody>
            {data?.upcomingHolidays.length ? (
              <ul className="space-y-2 text-sm">
                {data.upcomingHolidays.map((h) => (
                  <li key={h.date + h.name} className="flex items-center gap-3">
                    <CalendarDays className="size-4 text-primary" aria-hidden />
                    <span className="num w-28 text-subtle">{formatDate(h.date)}</span>
                    <span className="text-fg">{h.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">No holidays in the next two months.</p>
            )}
          </CardBody>
        </Card>
      </div>
      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}
