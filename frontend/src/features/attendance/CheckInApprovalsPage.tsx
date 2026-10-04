import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { useState } from 'react';
import { Code, FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { ApprovalBadge, Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Dialog, Tabs, TabsList, TabsTrigger } from '@/components/ui/overlay';
import { useListParams } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate } from '@/lib/utils';
import { departmentOptions, useDepartments } from '@/services/lookups';
import type { AttendanceRecord } from '@/types';

type Review = 'PENDING' | 'APPROVED' | 'REJECTED';

const INVALIDATE = [['checkin-approvals'], ['checkin-approvals-count'], ['attendance'], ['attendance-summary'], ['dashboard']];

/** HR review of check-ins employees made from the app. */
export default function CheckInApprovalsPage() {
  const { user } = useAuth();
  const list = useListParams({ approvalStatus: 'PENDING', departmentId: '', from: '', to: '' });
  const { data: departments } = useDepartments();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [reason, setReason] = useState('');
  const tab = list.filters.approvalStatus as Review;

  const query = { page: list.page, limit: list.limit, search: list.search, approvalStatus: tab, departmentId: list.filters.departmentId, from: list.filters.from, to: list.filters.to };
  const { data, isLoading } = useQuery({ queryKey: ['checkin-approvals', query], queryFn: () => api.list<AttendanceRecord>('/attendance/approvals', query), placeholderData: keepPreviousData });

  const clear = () => setSelected(new Set());
  const approve = useApiMutation((ids: string[]) => api.post<{ approved: number }>('/attendance/approvals/approve', { ids }), {
    success: (r) => (r.data.approved === 1 ? 'Check-in approved' : `${r.data.approved} check-ins approved`),
    invalidate: INVALIDATE,
    onSuccess: clear,
  });
  const reject = useApiMutation((v: { ids: string[]; reason: string }) => api.post<{ rejected: number }>('/attendance/approvals/reject', v), {
    success: (r) => (r.data.rejected === 1 ? 'Check-in rejected' : `${r.data.rejected} check-ins rejected`),
    invalidate: INVALIDATE,
    onSuccess: () => {
      clear();
      setRejecting(null);
      setReason('');
    },
  });

  // Nobody reviews their own check-in; the API enforces this too.
  const canReview = (r: AttendanceRecord) => r.approvalStatus === 'PENDING' && r.employeeId !== user?.employee?.id;
  const reviewableIds = (data?.data ?? []).filter(canReview).map((r) => r.id);
  const allSelected = reviewableIds.length > 0 && reviewableIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: Column<AttendanceRecord>[] = [
    ...(tab === 'PENDING'
      ? [
          {
            key: 'select',
            header: '',
            className: 'w-10',
            mobile: 'hidden' as const,
            cell: (r: AttendanceRecord) =>
              canReview(r) ? <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.employeeName}`} /> : null,
          },
        ]
      : []),
    { key: 'employee', header: 'Employee', mobile: 'title', cell: (r) => <span className="font-medium text-fg">{r.employeeName}</span> },
    { key: 'code', header: 'ID', optional: true, cell: (r) => <Code>{r.employee.employeeCode}</Code> },
    { key: 'department', header: 'Department', optional: true, cell: (r) => r.employee.department?.name ?? '—' },
    { key: 'date', header: 'Date', mobile: 'subtitle', cell: (r) => <span className="num whitespace-nowrap">{formatDate(r.date)}</span> },
    {
      key: 'times',
      header: 'Check-in / out',
      cell: (r) => (
        <span className="num whitespace-nowrap">
          {r.checkIn ?? '—'} – {r.checkOut ?? <span className="text-subtle">not yet</span>}
        </span>
      ),
    },
    { key: 'late', header: 'Late', align: 'right', optional: true, cell: (r) => (r.lateMinutes > 0 ? `${r.lateMinutes} min` : '—') },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          <StatusBadge status={r.status} />
          <ApprovalBadge status={r.approvalStatus} />
        </span>
      ),
    },
    ...(tab !== 'PENDING'
      ? [
          {
            key: 'reviewed',
            header: 'Reviewed',
            cell: (r: AttendanceRecord) => (
              <span className="text-xs text-subtle">
                {r.approvedByName ?? '—'}
                {r.approvedAt && ` · ${formatDate(r.approvedAt.slice(0, 10))}`}
                {r.rejectionReason && <span className="block text-rose-600 dark:text-rose-400">{r.rejectionReason}</span>}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Check-in approvals" description="Employees who check in or out from the app wait here until HR approves the times. Rejected days are marked absent." />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          clear();
          list.update({ approvalStatus: v });
        }}
      >
        <TabsList>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <Toolbar>
          <SearchInput value={list.search} onChange={(v) => list.update({ search: v })} placeholder="Search name or ID…" />
          <FilterSelect label="Department" value={list.filters.departmentId} onChange={(v) => list.update({ departmentId: v })} options={departmentOptions(departments)} />
          <Input type="date" value={list.filters.from} onChange={(e) => list.update({ from: e.target.value })} aria-label="From date" className="sm:w-40" />
          <Input type="date" value={list.filters.to} onChange={(e) => list.update({ to: e.target.value })} aria-label="To date" className="sm:w-40" />
        </Toolbar>

        {tab === 'PENDING' && reviewableIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(reviewableIds))} />
              {selected.size ? `${selected.size} selected` : 'Select all on this page'}
            </label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" disabled={!selected.size} onClick={() => setRejecting([...selected])}>
                <X /> Reject
              </Button>
              <Button size="sm" disabled={!selected.size} loading={approve.isPending} onClick={() => approve.mutate([...selected])}>
                <Check /> Approve {selected.size > 0 && selected.size}
              </Button>
            </div>
          </div>
        )}

        <DataTable
          caption="Check-ins awaiting approval"
          columns={columns}
          rows={data?.data}
          rowKey={(r) => r.id}
          loading={isLoading}
          columnMenu
          rowActions={
            tab === 'PENDING'
              ? (r) =>
                  canReview(r) ? (
                    <span className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Reject ${r.employeeName}`} title="Reject" onClick={() => setRejecting([r.id])}>
                        <X className="text-rose-600" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Approve ${r.employeeName}`} title="Approve" disabled={approve.isPending} onClick={() => approve.mutate([r.id])}>
                        <Check className="text-emerald-600" />
                      </Button>
                    </span>
                  ) : (
                    <span className="text-xs text-subtle">Your own</span>
                  )
              : undefined
          }
          empty={
            <EmptyState
              icon={<ClipboardCheck />}
              title={tab === 'PENDING' ? 'Nothing waiting for approval' : tab === 'APPROVED' ? 'No approved check-ins' : 'No rejected check-ins'}
              description={tab === 'PENDING' ? 'When employees check in from the app, their check-ins appear here for review.' : 'Try a different date range or filter.'}
            />
          }
        />
        {data && <Pagination {...data.pagination} onPage={(p) => list.update({ page: p }, false)} />}
      </Card>

      <Dialog
        open={rejecting !== null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={rejecting && rejecting.length > 1 ? `Reject ${rejecting.length} check-ins` : 'Reject check-in'}
        description="The day will be marked absent and the employee is told why."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => rejecting && reject.mutate({ ids: rejecting, reason: reason.trim() })}>
              Reject
            </Button>
          </>
        }
      >
        <Field label="Reason" required hint="Visible to the employee.">
          {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Not in the office at this time" maxLength={300} autoFocus />}
        </Field>
      </Dialog>
    </div>
  );
}
