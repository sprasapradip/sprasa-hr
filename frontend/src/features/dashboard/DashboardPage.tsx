import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarClock, CalendarX2, Clock, Plane, UserCheck, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorState, PageHeader } from '@/components/common';
import { DonutChart, HBarChart, STATUS_COLORS, TrendChart, VBarChart } from '@/components/common/charts';
import { Button } from '@/components/ui/button';
import { Avatar, Card, CardBody, CardHeader, EmptyState, Skeleton, Stat, StatusBadge } from '@/components/ui/display';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCompact, formatDate, formatMoney } from '@/lib/utils';

interface Dashboard {
  today: string;
  cards: {
    totalEmployees: number;
    activeEmployees: number;
    onLeaveToday: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    notMarkedToday: number;
    departments: number;
    pendingLeaveRequests: number;
    currentPayroll: { id: string; period: string; status: string; totalNet: number; totalGross: number; employeeCount: number } | null;
  };
  charts: {
    employeesByDepartment: { department: string; count: number }[];
    attendanceToday: { status: string; value: number }[];
    attendanceTrend: { date: string; present: number; late: number; absent: number; leave: number }[];
    payrollTrend: { period: string; gross: number; net: number }[] | null;
    leaveByType: { leaveType: string; days: number }[];
  };
  recentEmployees: { id: string; employeeCode: string; fullName: string; joinDate: string; department: { name: string } | null; designation: { name: string } | null }[];
  recentAttendance: { id: string; employeeId: string; employeeName: string; checkIn: string | null; checkOut: string | null; status: string }[];
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });
  const c = data?.cards;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', hour12: false }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (error) return <ErrorState error={error} retry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${user?.name.split(' ')[0]}`}
        description={data ? `Here is ${user?.organisation.name} on ${formatDate(data.today, 'long')}.` : undefined}
        actions={
          <>
            {can('attendance.manage') && (
              <Button variant="secondary" asChild>
                <Link to="/app/attendance/bulk">Mark attendance</Link>
              </Button>
            )}
            {can('employees.create') && (
              <Button asChild>
                <Link to="/app/employees/new">Add employee</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Employees" value={c?.totalEmployees} hint={c && `${c.activeEmployees} active or on probation`} icon={<Users />} loading={isLoading} />
        <Stat label="Present today" value={c?.presentToday} hint={c && `${c.lateToday} late · ${c.notMarkedToday} not marked`} icon={<UserCheck />} tone="green" loading={isLoading} />
        <Stat label="On leave today" value={c?.onLeaveToday} icon={<Plane />} tone="violet" loading={isLoading} />
        <Stat label="Absent today" value={c?.absentToday} icon={<CalendarX2 />} tone="red" loading={isLoading} />
        <Stat label="Late today" value={c?.lateToday} icon={<Clock />} tone="amber" loading={isLoading} />
        <Stat label="Departments" value={c?.departments} icon={<Building2 />} tone="blue" loading={isLoading} />
        <Stat
          label="Pending leave"
          value={c?.pendingLeaveRequests}
          hint={
            can('leave.view') ? (
              <Link to="/app/leave/requests?view=all&status=PENDING" className="text-primary hover:underline">
                Review requests
              </Link>
            ) : undefined
          }
          icon={<CalendarClock />}
          tone="amber"
          loading={isLoading}
        />
        {can('payroll.view', 'reports.payroll') && (
          <Stat
            label={c?.currentPayroll ? `Payroll · ${c.currentPayroll.period}` : 'Current payroll'}
            value={c?.currentPayroll ? `NPR ${formatCompact(c.currentPayroll.totalNet)}` : '—'}
            hint={c?.currentPayroll ? <StatusBadge status={c.currentPayroll.status} /> : 'No payroll yet'}
            icon={<Wallet />}
            loading={isLoading}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Employee distribution" description="Current employees by department" />
          <CardBody>{isLoading ? <Skeleton className="h-60" /> : data!.charts.employeesByDepartment.length ? <HBarChart data={data!.charts.employeesByDepartment} x="count" y="department" label="Employees by department" /> : <EmptyState title="No employees yet" />}</CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Attendance today" />
          <CardBody>
            {isLoading ? <Skeleton className="h-52" /> : <DonutChart data={data!.charts.attendanceToday.map((a) => ({ name: a.status, value: a.value }))} colors={STATUS_COLORS} label="Attendance breakdown today" />}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Attendance overview" description="Last 14 days" />
          <CardBody>
            {isLoading ? (
              <Skeleton className="h-64" />
            ) : (
              <VBarChart
                data={data!.charts.attendanceTrend.map((d) => ({ ...d, day: formatDate(d.date).slice(0, 6) }))}
                x="day"
                stacked
                label="Attendance for the last 14 days"
                series={[
                  { key: 'present', name: 'Present', color: '#059669' },
                  { key: 'late', name: 'Late', color: '#d97706' },
                  { key: 'leave', name: 'Leave', color: '#7c3aed' },
                  { key: 'absent', name: 'Absent', color: '#e11d48' },
                ]}
              />
            )}
          </CardBody>
        </Card>
        {data?.charts.payrollTrend ? (
          <Card>
            <CardHeader title="Payroll overview" description="Monthly gross and net (NPR)" actions={<Button variant="ghost" size="sm" asChild><Link to="/app/payroll/runs">All payroll</Link></Button>} />
            <CardBody>
              {data.charts.payrollTrend.length ? (
                <TrendChart
                  data={data.charts.payrollTrend}
                  x="period"
                  label="Monthly payroll trend"
                  valueFormatter={(v) => formatCompact(v)}
                  series={[
                    { key: 'gross', name: 'Gross', color: '#0284c7' },
                    { key: 'net', name: 'Net', color: '#0f766e' },
                  ]}
                />
              ) : (
                <EmptyState title="No payroll runs yet" description="Generate the first month from Payroll." />
              )}
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Leave overview" description="Approved days this year by type" />
            <CardBody>{isLoading ? <Skeleton className="h-64" /> : <HBarChart data={data!.charts.leaveByType} x="days" y="leaveType" label="Leave usage by type" color="#7c3aed" />}</CardBody>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {data?.charts.payrollTrend && (
          <Card>
            <CardHeader title="Leave overview" description="Approved days this year" />
            <CardBody>{data.charts.leaveByType.some((l) => l.days > 0) ? <HBarChart data={data.charts.leaveByType.filter((l) => l.days > 0)} x="days" y="leaveType" label="Leave usage by type" color="#7c3aed" /> : <EmptyState title="No leave taken yet this year" />}</CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Recent additions" actions={<Button variant="ghost" size="sm" asChild><Link to="/app/employees?sortBy=joinDate&sortOrder=desc">View all</Link></Button>} />
          <ul className="divide-y divide-border">
            {isLoading && [0, 1, 2].map((i) => <li key={i} className="p-4"><Skeleton className="h-8" /></li>)}
            {data?.recentEmployees.map((e) => (
              <li key={e.id}>
                <Link to={`/app/employees/${e.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                  <Avatar name={e.fullName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{e.fullName}</span>
                    <span className="block truncate text-xs text-subtle">{e.designation?.name ?? e.department?.name ?? e.employeeCode}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-subtle">{formatDate(e.joinDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Today’s check-ins" actions={can('attendance.view') && <Button variant="ghost" size="sm" asChild><Link to="/app/attendance">Attendance</Link></Button>} />
          {data && data.recentAttendance.length === 0 ? (
            <EmptyState title="No check-ins yet today" />
          ) : (
            <ul className="divide-y divide-border">
              {data?.recentAttendance.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="truncate text-fg">{a.employeeName}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num text-xs text-subtle">
                      {a.checkIn}
                      {a.checkOut ? ` – ${a.checkOut}` : ''}
                    </span>
                    <StatusBadge status={a.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {c?.currentPayroll && can('payroll.view') && (
        <p className="text-xs text-subtle">
          Latest payroll: {c.currentPayroll.period}, {formatMoney(c.currentPayroll.totalNet)} net for {c.currentPayroll.employeeCount} employees.{' '}
          <Link to={`/app/payroll/runs/${c.currentPayroll.id}`} className="text-primary hover:underline">
            Open
          </Link>
        </p>
      )}
    </div>
  );
}
