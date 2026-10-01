import { useQuery } from '@tanstack/react-query';
import { Check, Download, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, DescriptionList, Skeleton, StatusBadge } from '@/components/ui/display';
import { Field, Textarea } from '@/components/ui/form';
import { Drawer } from '@/components/ui/overlay';
import { api, download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { LeaveBalance, LeaveRequest } from '@/types';

/** Leave request detail with approve / reject / cancel, shown to approvers and the requester. */
export function LeaveRequestDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { user, can } = useAuth();
  const { data: r, isLoading } = useQuery({ queryKey: ['leave-request', id], queryFn: () => api.get<LeaveRequest>(`/leave/requests/${id}`), enabled: Boolean(id) });
  const { data: balances } = useQuery({
    queryKey: ['leave-balances', r?.employeeId],
    queryFn: () => api.get<LeaveBalance[]>('/leave/balances', { employeeId: r!.employeeId }),
    enabled: Boolean(r) && can('leave.view'),
  });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const invalidate = [['leave-requests'], ['leave-request', id], ['leave-balances'], ['leave-dashboard'], ['dashboard'], ['leave-calendar']];

  const approve = useApiMutation(() => api.post<LeaveRequest>(`/leave/requests/${id}/approve`, {}), {
    success: (res) => (res.data.status === 'APPROVED' ? 'Leave approved' : 'Approved and sent to HR'),
    invalidate,
    onSuccess: onClose,
  });
  const reject = useApiMutation(() => api.post(`/leave/requests/${id}/reject`, { reason }), { success: 'Leave rejected', invalidate, onSuccess: onClose });
  const cancel = useApiMutation(() => api.post(`/leave/requests/${id}/cancel`, {}), { success: 'Leave cancelled', invalidate, onSuccess: onClose });

  const own = r && user?.employee?.id === r.employeeId;
  const canCancel = r && (['PENDING', 'SUPERVISOR_APPROVED'].includes(r.status) || (r.status === 'APPROVED' && (can('leave.manage') || r.startDate.slice(0, 10) > new Date().toISOString().slice(0, 10)))) && (own || can('leave.manage'));
  const balance = balances?.find((b) => b.leaveType.id === r?.leaveType.id);

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title="Leave request"
      footer={
        r && (
          <>
            {canCancel && (
              <Button variant="ghost" className="mr-auto" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel request
              </Button>
            )}
            {r.canAct && !rejecting && (
              <>
                <Button variant="secondary" onClick={() => setRejecting(true)}>
                  <X /> Reject
                </Button>
                <Button loading={approve.isPending} onClick={() => approve.mutate()}>
                  <Check /> Approve
                </Button>
              </>
            )}
            {rejecting && (
              <>
                <Button variant="secondary" onClick={() => setRejecting(false)}>
                  Back
                </Button>
                <Button variant="danger" loading={reject.isPending} onClick={() => (reason.trim().length < 3 ? toast.error('Give a reason for rejecting') : reject.mutate())}>
                  Confirm rejection
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {isLoading || !r ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link to={`/app/employees/${r.employeeId}`} className="text-base font-semibold text-fg hover:text-primary">
                {r.employeeName}
              </Link>
              <p className="text-sm text-subtle">
                {r.employee.employeeCode}
                {r.employee.department && ` · ${r.employee.department.name}`}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
          {r.status === 'SUPERVISOR_APPROVED' && <Alert tone="blue">The supervisor approved this. It is waiting for HR.</Alert>}
          <DescriptionList
            items={[
              { label: 'Leave type', value: `${r.leaveType.name}${r.leaveType.paid ? '' : ' (unpaid)'}` },
              { label: 'Days', value: <span className="num">{r.totalDays}</span> },
              { label: 'From', value: formatDate(r.startDate, 'long') },
              { label: 'To', value: `${formatDate(r.endDate, 'long')}${r.halfDay ? ' (half day)' : ''}` },
              { label: 'Applied', value: formatDateTime(r.createdAt) },
              { label: 'Balance', value: balance && r.leaveType.paid ? `${balance.remaining} days left after pending` : undefined },
            ]}
          />
          <div>
            <p className="text-xs font-medium text-subtle">Reason</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-fg">{r.reason}</p>
          </div>
          {r.hasAttachment && (
            <Button variant="secondary" size="sm" onClick={() => download(`/leave/requests/${r.id}/attachment`, undefined, r.attachmentName ?? 'attachment')}>
              <Download /> {r.attachmentName ?? 'Attachment'}
            </Button>
          )}
          {r.rejectionReason && (
            <Alert tone="red" title="Rejected">
              {r.rejectionReason}
            </Alert>
          )}
          {rejecting && (
            <Field label="Reason for rejecting" required hint="The employee sees this">
              {(p) => <Textarea {...p} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />}
            </Field>
          )}
        </div>
      )}
    </Drawer>
  );
}
