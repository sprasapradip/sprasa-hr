import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plane, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Code, ExportMenu, FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Stat, StatusBadge } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { useListParams } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { departmentOptions, useDepartments, useLeaveTypes } from '@/services/lookups';
import type { LeaveRequest } from '@/types';
import { ApplyLeaveDialog } from './ApplyLeaveDialog';
import { LeaveRequestDrawer } from './LeaveRequestDrawer';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'SUPERVISOR_APPROVED', label: 'Awaiting HR' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

interface LeaveDashboard {
  pending: number;
  approved: number;
  rejected: number;
  onLeaveToday: LeaveRequest[];
  upcoming: LeaveRequest[];
}

export default function LeaveRequestsPage() {
  const { can } = useAuth();
  const list = useListParams({ view: can('leave.approve', 'leave.manage') ? 'mine' : 'all', status: '', leaveTypeId: '', departmentId: '', employeeId: '', from: '', to: '', id: '' });
  const { data: types } = useLeaveTypes();
  const { data: departments } = useDepartments();
  const [applyOpen, setApplyOpen] = useState(false);
  const awaiting = list.filters.view === 'mine';

  const query = {
    page: list.page,
    limit: list.limit,
    search: list.search,
    status: awaiting ? undefined : list.filters.status,
    leaveTypeId: list.filters.leaveTypeId,
    departmentId: list.filters.departmentId,
    employeeId: list.filters.employeeId,
    from: list.filters.from,
    to: list.filters.to,
    awaitingMe: awaiting ? '1' : undefined,
  };
  const { data, isLoading } = useQuery({ queryKey: ['leave-requests', query], queryFn: () => api.list<LeaveRequest>('/leave/requests', query), placeholderData: keepPreviousData });
  const { data: dash, isLoading: dashLoading } = useQuery({ queryKey: ['leave-dashboard'], queryFn: () => api.get<LeaveDashboard>('/leave/dashboard') });

  const columns: Column<LeaveRequest>[] = [
    { key: 'employee', header: 'Employee', mobile: 'title', cell: (r) => <span className="font-medium text-fg">{r.employeeName}</span> },
    { key: 'code', header: 'ID', optional: true, cell: (r) => <Code>{r.employee.employeeCode}</Code> },
    { key: 'type', header: 'Type', mobile: 'subtitle', cell: (r) => r.leaveType.name },
    {
      key: 'dates',
      header: 'Dates',
      cell: (r) => (
        <span className="num whitespace-nowrap">
          {formatDate(r.startDate)}
          {r.endDate !== r.startDate && ` – ${formatDate(r.endDate)}`}
        </span>
      ),
    },
    { key: 'days', header: 'Days', align: 'right', cell: (r) => (r.halfDay ? '½' : r.totalDays) },
    { key: 'applied', header: 'Applied', optional: true, cell: (r) => <span className="num text-subtle">{formatDate(r.createdAt)}</span> },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leave requests"
        actions={
          <>
            <ExportMenu path="/leave/requests" query={query} />
            {can('leave.manage') && (
              <Button onClick={() => setApplyOpen(true)}>
                <Plus /> Apply for an employee
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending" value={dash?.pending} tone="amber" loading={dashLoading} />
        <Stat label="Approved this year" value={dash?.approved} tone="green" loading={dashLoading} />
        <Stat label="Rejected this year" value={dash?.rejected} tone="red" loading={dashLoading} />
        <Stat label="On leave today" value={dash?.onLeaveToday.length} tone="violet" loading={dashLoading} hint={dash?.onLeaveToday.slice(0, 2).map((r) => r.employeeName).join(', ')} />
      </div>

      {dash && dash.upcoming.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-fg">Coming up in the next 30 days</p>
          <ul className="flex flex-wrap gap-2">
            {dash.upcoming.slice(0, 8).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => list.update({ id: r.id }, false)} className="cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-2">
                  <span className="font-medium text-fg">{r.employeeName}</span> · {formatDate(r.startDate)} · {r.leaveType.code}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Toolbar>
          {can('leave.approve', 'leave.manage') && (
            <div className="flex rounded-md border border-border p-0.5 text-sm" role="group" aria-label="View">
              {(
                [
                  ['mine', 'Waiting for me'],
                  ['all', 'All requests'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" onClick={() => list.update({ view: v })} aria-pressed={list.filters.view === v} className={`cursor-pointer rounded px-3 py-1 ${list.filters.view === v ? 'bg-surface-2 font-medium text-fg' : 'text-subtle hover:text-fg'}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <SearchInput value={list.search} onChange={(v) => list.update({ search: v })} placeholder="Search employee…" />
          {!awaiting && <FilterSelect label="Status" value={list.filters.status} onChange={(v) => list.update({ status: v })} options={STATUS_OPTIONS} />}
          <FilterSelect label="Type" value={list.filters.leaveTypeId} onChange={(v) => list.update({ leaveTypeId: v })} options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          <FilterSelect label="Department" value={list.filters.departmentId} onChange={(v) => list.update({ departmentId: v })} options={departmentOptions(departments)} />
          <Input type="date" value={list.filters.from} onChange={(e) => list.update({ from: e.target.value })} className="w-auto" aria-label="From date" />
          <Input type="date" value={list.filters.to} onChange={(e) => list.update({ to: e.target.value })} className="w-auto" aria-label="To date" />
        </Toolbar>
        <DataTable
          caption="Leave requests"
          columns={columns}
          rows={data?.data}
          rowKey={(r) => r.id}
          loading={isLoading}
          columnMenu
          onRowClick={(r) => list.update({ id: r.id }, false)}
          empty={
            awaiting ? (
              <EmptyState icon={<Plane />} title="Nothing waiting for you" description="Requests that need your approval will show up here." />
            ) : (
              <EmptyState icon={<Plane />} title="No leave requests" description="Try other filters, or check the leave calendar." action={<Button variant="secondary" asChild><Link to="/app/leave/calendar">Leave calendar</Link></Button>} />
            )
          }
        />
        {data && <Pagination {...data.pagination} onPage={(p) => list.update({ page: p }, false)} />}
      </Card>

      <LeaveRequestDrawer id={list.filters.id || null} onClose={() => list.update({ id: '' }, false)} />
      {can('leave.manage') && <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} onBehalf />}
    </div>
  );
}
