import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Code, ExportMenu, FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { ApprovalBadge, Badge, Card, EmptyState, Stat, StatusBadge } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/overlay';
import { useListParams } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { addDaysISO, formatDate, minutesToHours, todayISO } from '@/lib/utils';
import { departmentOptions, useDepartments } from '@/services/lookups';
import type { AttendanceRecord } from '@/types';
import { ATTENDANCE_STATUSES, AttendanceDialog, statusLabel } from './AttendanceDialog';

interface Summary {
  date: string;
  dayType: 'WORKING' | 'WEEKEND' | 'HOLIDAY';
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  notMarked: number;
}

export default function AttendancePage() {
  const { can } = useAuth();
  const today = todayISO();
  const list = useListParams({ date: today, departmentId: '', status: '', limit: '50' });
  const date = list.filters.date || today;
  const { data: departments } = useDepartments();
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<AttendanceRecord | null>(null);

  const query = { date, departmentId: list.filters.departmentId, status: list.filters.status, search: list.search, page: list.page, limit: list.limit };
  const { data: summary, isLoading: summaryLoading } = useQuery({ queryKey: ['attendance-summary', date, list.filters.departmentId], queryFn: () => api.get<Summary>('/attendance/summary', { date, departmentId: list.filters.departmentId }) });
  const { data, isLoading } = useQuery({ queryKey: ['attendance', query], queryFn: () => api.list<AttendanceRecord>('/attendance', query), placeholderData: keepPreviousData });
  const remove = useApiMutation((id: string) => api.del(`/attendance/${id}`), { success: 'Record deleted', invalidate: [['attendance'], ['attendance-summary']], onSuccess: () => setDeleting(null) });

  const columns: Column<AttendanceRecord>[] = [
    {
      key: 'employee',
      header: 'Employee',
      mobile: 'title',
      cell: (r) => (
        <Link to={`/app/employees/${r.employeeId}?tab=attendance`} className="font-medium text-fg hover:text-primary" onClick={(e) => e.stopPropagation()}>
          {r.employeeName}
        </Link>
      ),
    },
    { key: 'code', header: 'ID', mobile: 'subtitle', cell: (r) => <Code>{r.employee.employeeCode}</Code> },
    { key: 'department', header: 'Department', optional: true, cell: (r) => r.employee.department?.name ?? '—' },
    { key: 'shift', header: 'Shift', optional: true, cell: (r) => (r.shift ? <span className="num text-muted">{r.shift.startTime}–{r.shift.endTime}</span> : '—') },
    { key: 'in', header: 'In', cell: (r) => <span className="num">{r.checkIn ?? '—'}</span> },
    { key: 'out', header: 'Out', cell: (r) => <span className="num">{r.checkOut ?? '—'}</span> },
    { key: 'late', header: 'Late', align: 'right', optional: true, cell: (r) => (r.lateMinutes ? `${r.lateMinutes} min` : '—') },
    { key: 'ot', header: 'Overtime', align: 'right', optional: true, cell: (r) => (r.overtimeMinutes ? minutesToHours(r.overtimeMinutes) : '—') },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          <StatusBadge status={r.status} />
          <ApprovalBadge status={r.approvalStatus} />
        </span>
      ) },
    { key: 'source', header: 'Source', optional: true, cell: (r) => <span className="text-xs text-subtle">{r.source.toLowerCase()}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        description={
          summary && (
            <span className="flex items-center gap-2">
              {formatDate(date, 'long')}
              {summary.dayType !== 'WORKING' && <Badge tone="blue">{summary.dayType === 'HOLIDAY' ? 'Holiday' : 'Weekend'}</Badge>}
            </span>
          )
        }
        actions={
          <>
            <ExportMenu path="/attendance" query={query} />
            {can('attendance.manage') && (
              <>
                <Button variant="secondary" asChild>
                  <Link to={`/app/attendance/bulk?date=${date}`}>
                    <ClipboardList /> Bulk entry
                  </Link>
                </Button>
                <Button onClick={() => { setEditing(null); setOpen(true); }}>
                  <Plus /> Record
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => list.update({ date: addDaysISO(date, -1) })} aria-label="Previous day">
          <ChevronLeft />
        </Button>
        <Input type="date" value={date} max={today} onChange={(e) => list.update({ date: e.target.value || today })} className="w-auto" aria-label="Date" />
        <Button variant="secondary" size="icon" onClick={() => list.update({ date: addDaysISO(date, 1) })} disabled={date >= today} aria-label="Next day">
          <ChevronRight />
        </Button>
        {date !== today && (
          <Button variant="ghost" onClick={() => list.update({ date: today })}>
            Today
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Present" value={summary?.present} tone="green" loading={summaryLoading} hint={summary && `of ${summary.totalEmployees} employees`} />
        <Stat label="Late" value={summary?.late} tone="amber" loading={summaryLoading} />
        <Stat label="On leave" value={summary?.onLeave} tone="violet" loading={summaryLoading} />
        <Stat label="Absent" value={summary?.absent} tone="red" loading={summaryLoading} />
        <Stat label="Not marked" value={summary?.notMarked} tone="neutral" loading={summaryLoading} />
      </div>

      <Card>
        <Toolbar>
          <SearchInput value={list.search} onChange={(v) => list.update({ search: v })} placeholder="Search employee…" />
          <FilterSelect label="Department" value={list.filters.departmentId} onChange={(v) => list.update({ departmentId: v })} options={departmentOptions(departments)} />
          <FilterSelect label="Status" value={list.filters.status} onChange={(v) => list.update({ status: v })} options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
        </Toolbar>
        <DataTable
          caption={`Attendance for ${date}`}
          columns={columns}
          rows={data?.data}
          rowKey={(r) => r.id}
          loading={isLoading}
          columnMenu
          rowActions={
            can('attendance.manage')
              ? (r) => (
                  <span className="flex justify-end gap-0.5">
                    <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(r); setOpen(true); }} aria-label={`Edit ${r.employeeName}`}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(r)} aria-label={`Delete ${r.employeeName}`}>
                      <Trash2 />
                    </Button>
                  </span>
                )
              : undefined
          }
          empty={
            <EmptyState
              icon={<CalendarCheck />}
              title="No attendance recorded for this day"
              description={summary?.dayType === 'WORKING' ? 'Use bulk entry to mark the whole team at once.' : 'This is not a working day.'}
              action={
                can('attendance.manage') &&
                summary?.dayType === 'WORKING' && (
                  <Button asChild>
                    <Link to={`/app/attendance/bulk?date=${date}`}>Open bulk entry</Link>
                  </Button>
                )
              }
            />
          }
        />
        {data && <Pagination {...data.pagination} onPage={(p) => list.update({ page: p }, false)} />}
      </Card>

      <AttendanceDialog open={open} onOpenChange={setOpen} record={editing} date={date} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete attendance record?"
        description={`The record for ${deleting?.employeeName} on ${formatDate(deleting?.date)} will be removed.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
