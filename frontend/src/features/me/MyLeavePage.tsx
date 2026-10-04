import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plane } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { LeaveBalanceCards } from '@/components/common/LeaveBalanceCards';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, StatusBadge } from '@/components/ui/display';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { LeaveBalance, LeaveRequest } from '@/types';
import { ApplyLeaveDialog } from '../leave/ApplyLeaveDialog';
import { LeaveRequestDrawer } from '../leave/LeaveRequestDrawer';

export default function MyLeavePage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpenState] = useState(params.get('apply') === '1');
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v && params.has('apply')) setParams({}, { replace: true });
  };
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: balances, isLoading: balLoading } = useQuery({ queryKey: ['leave-balances', 'me'], queryFn: () => api.get<LeaveBalance[]>('/me/leave/balances') });
  const { data, isLoading } = useQuery({ queryKey: ['leave-requests', 'me', page], queryFn: () => api.list<LeaveRequest>('/me/leave/requests', { page, limit: 20 }), placeholderData: keepPreviousData });

  const columns: Column<LeaveRequest>[] = [
    { key: 'type', header: 'Leave type', mobile: 'title', cell: (r) => <span className="font-medium text-fg">{r.leaveType.name}</span> },
    { key: 'dates', header: 'Dates', mobile: 'subtitle', cell: (r) => <span className="num">{formatDate(r.startDate)}{r.endDate !== r.startDate && ` – ${formatDate(r.endDate)}`}</span> },
    { key: 'days', header: 'Days', align: 'right', cell: (r) => (r.halfDay ? '½' : r.totalDays) },
    { key: 'applied', header: 'Applied', cell: (r) => <span className="num text-subtle">{formatDate(r.createdAt)}</span> },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="My leave" actions={<Button onClick={() => setOpen(true)}><Plane /> Apply for leave</Button>} />
      <LeaveBalanceCards balances={balances} loading={balLoading} />
      <Card>
        <CardHeader title="My requests" description="Open a pending request to cancel it." />
        <DataTable
          caption="My leave requests"
          columns={columns}
          rows={data?.data}
          rowKey={(r) => r.id}
          loading={isLoading}
          onRowClick={(r) => setSelected(r.id)}
          empty={<EmptyState icon={<Plane />} title="You haven’t applied for leave yet" action={<Button onClick={() => setOpen(true)}>Apply for leave</Button>} />}
        />
        {data && <Pagination {...data.pagination} onPage={setPage} />}
      </Card>
      <ApplyLeaveDialog open={open} onOpenChange={setOpen} />
      <LeaveRequestDrawer id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
