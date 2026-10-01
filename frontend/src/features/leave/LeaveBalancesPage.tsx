import { useQuery } from '@tanstack/react-query';
import { RefreshCw, SlidersHorizontal, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Code, FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { ConfirmDialog, Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { cn, todayISO } from '@/lib/utils';
import { departmentOptions, useDepartments, useLeaveTypes } from '@/services/lookups';
import type { LeaveBalance } from '@/types';

export default function LeaveBalancesPage() {
  const { can } = useAuth();
  const thisYear = Number(todayISO().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const { data: departments } = useDepartments();
  const { data: types } = useLeaveTypes();
  const q = { year, search, departmentId, leaveTypeId };
  const { data, isLoading } = useQuery({ queryKey: ['leave-balances', 'all', q], queryFn: () => api.get<LeaveBalance[]>('/leave/balances', q) });
  const [adjusting, setAdjusting] = useState<LeaveBalance | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [initOpen, setInitOpen] = useState(false);

  const adjust = useApiMutation(() => api.post(`/leave/balances/${adjusting!.id}/adjust`, { delta: Number(delta), reason }), {
    success: 'Balance adjusted',
    invalidate: [['leave-balances']],
    onSuccess: () => {
      setAdjusting(null);
      setDelta('');
      setReason('');
    },
  });
  const init = useApiMutation(() => api.post('/leave/balances/initialise', { year }), { success: (r) => r.message ?? 'Balances ready', invalidate: [['leave-balances']], onSuccess: () => setInitOpen(false) });

  const columns: Column<LeaveBalance>[] = [
    { key: 'employee', header: 'Employee', mobile: 'title', cell: (b) => <Link to={`/app/employees/${b.employee.id}?tab=leave`} className="font-medium text-fg hover:text-primary">{b.employee.fullName}</Link> },
    { key: 'code', header: 'ID', optional: true, cell: (b) => <Code>{b.employee.employeeCode}</Code> },
    { key: 'type', header: 'Leave type', mobile: 'subtitle', cell: (b) => b.leaveType.name },
    { key: 'entitled', header: 'Entitled', align: 'right', cell: (b) => b.entitled },
    { key: 'carried', header: 'Carried', align: 'right', optional: true, cell: (b) => b.carriedForward },
    { key: 'adjusted', header: 'Adjusted', align: 'right', optional: true, cell: (b) => (b.adjusted > 0 ? `+${b.adjusted}` : b.adjusted) },
    { key: 'used', header: 'Used', align: 'right', cell: (b) => b.used },
    { key: 'pending', header: 'Pending', align: 'right', cell: (b) => b.pending },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      mobile: 'badge',
      cell: (b) => (b.leaveType.limitToBalance ? <span className={cn('num font-semibold', b.remaining <= 0 ? 'text-rose-600' : 'text-fg')}>{b.remaining}</span> : <span className="text-subtle">No limit</span>),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leave balances"
        description="Remaining = entitled + carried forward + adjustments − used − pending."
        actions={
          <>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" aria-label="Year">
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            {can('leave.manage') && (
              <Button variant="secondary" onClick={() => setInitOpen(true)}>
                <RefreshCw /> Prepare {year} balances
              </Button>
            )}
          </>
        }
      />
      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search employee…" />
          <FilterSelect label="Department" value={departmentId} onChange={setDepartmentId} options={departmentOptions(departments)} />
          <FilterSelect label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        </Toolbar>
        <DataTable
          caption={`Leave balances ${year}`}
          columns={columns}
          rows={data}
          rowKey={(b) => b.id}
          loading={isLoading}
          columnMenu
          rowActions={
            can('leave.manage')
              ? (b) => (
                  <Button variant="ghost" size="icon-sm" onClick={() => setAdjusting(b)} aria-label={`Adjust ${b.employee.fullName} ${b.leaveType.name}`}>
                    <SlidersHorizontal />
                  </Button>
                )
              : undefined
          }
          empty={<EmptyState icon={<Wallet />} title={`No balances for ${year}`} description="Prepare the year’s balances to give every employee their entitlement and carry-forward." />}
        />
      </Card>
      <Dialog
        open={Boolean(adjusting)}
        onOpenChange={(o) => !o && setAdjusting(null)}
        title="Adjust balance"
        description={adjusting ? `${adjusting.employee.fullName} · ${adjusting.leaveType.name} · ${adjusting.remaining} remaining` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjusting(null)}>
              Cancel
            </Button>
            <Button loading={adjust.isPending} disabled={!Number(delta) || reason.trim().length < 3} onClick={() => adjust.mutate()}>
              Save adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Days to add or remove" required hint="Use a minus sign to remove days, e.g. -2">
            {(p) => <Input {...p} type="number" step="0.5" value={delta} onChange={(e) => setDelta(e.target.value)} />}
          </Field>
          <Field label="Reason" required hint="Recorded in the audit log">
            {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Compensatory leave for weekend work" />}
          </Field>
        </div>
      </Dialog>
      <ConfirmDialog
        open={initOpen}
        onOpenChange={setInitOpen}
        tone="primary"
        title={`Prepare ${year} balances?`}
        description="Creates missing balances for every current employee, with entitlement pro-rated for joiners and carry-forward from the previous year. Existing balances are not changed."
        confirmLabel="Prepare balances"
        loading={init.isPending}
        onConfirm={() => init.mutate()}
      />
    </div>
  );
}
