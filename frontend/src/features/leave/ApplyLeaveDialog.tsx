import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { EmployeePicker } from '@/components/common/EmployeePicker';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { todayISO } from '@/lib/utils';
import { useLeaveTypes } from '@/services/lookups';
import type { LeaveBalance } from '@/types';

/**
 * Leave application. With `onBehalf`, HR picks the employee; otherwise the signed-in employee applies.
 * The server makes the final check on overlaps, balance and working days.
 */
export function ApplyLeaveDialog({ open, onOpenChange, onBehalf }: { open: boolean; onOpenChange: (o: boolean) => void; onBehalf?: boolean }) {
  const { user } = useAuth();
  const { data: types } = useLeaveTypes(true);
  const [employeeId, setEmployeeId] = useState<string | null>(onBehalf ? null : user?.employee?.id ?? null);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setEmployeeId(onBehalf ? null : user?.employee?.id ?? null);
    setLeaveTypeId('');
    setStart(todayISO());
    setEnd(todayISO());
    setHalfDay(false);
    setReason('');
    setFile(null);
    setErrors({});
  }, [open, onBehalf, user]);

  const balancesPath = onBehalf ? '/leave/balances' : '/me/leave/balances';
  const { data: balances } = useQuery({
    queryKey: ['leave-balances', employeeId, 'apply'],
    queryFn: () => api.get<LeaveBalance[]>(balancesPath, onBehalf ? { employeeId: employeeId! } : undefined),
    enabled: open && Boolean(employeeId),
  });
  const type = types?.find((t) => t.id === leaveTypeId);
  const balance = balances?.find((b) => b.leaveType.id === leaveTypeId);
  const calendarDays = useMemo(() => (start && end && end >= start ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : 0), [start, end]);

  const submit = useApiMutation(
    () => {
      const form = new FormData();
      if (onBehalf && employeeId) form.append('employeeId', employeeId);
      form.append('leaveTypeId', leaveTypeId);
      form.append('startDate', start);
      form.append('endDate', halfDay ? start : end);
      form.append('halfDay', String(halfDay));
      form.append('reason', reason);
      if (file) form.append('attachment', file);
      return api.upload(onBehalf ? '/leave/requests' : '/me/leave/requests', form);
    },
    { success: 'Leave request submitted', invalidate: [['leave-requests'], ['leave-balances'], ['my-dashboard'], ['leave-dashboard']], onSuccess: () => onOpenChange(false) },
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!employeeId) e.employee = 'Choose an employee';
    if (!leaveTypeId) e.type = 'Choose a leave type';
    if (!start) e.start = 'Choose a start date';
    if (!halfDay && end < start) e.end = 'End date must be on or after the start date';
    if (reason.trim().length < 3) e.reason = 'Give a short reason';
    if (type?.requiresDocument && !file) e.file = `${type.name} needs a supporting document`;
    setErrors(e);
    return !Object.keys(e).length;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={onBehalf ? 'Apply leave for an employee' : 'Apply for leave'}
      description="Weekends and public holidays inside your dates are not counted."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={submit.isPending} onClick={() => validate() && submit.mutate()}>
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {onBehalf && (
          <Field label="Employee" required error={errors.employee}>
            {(p) => <EmployeePicker id={p.id} value={employeeId} onChange={setEmployeeId} invalid={Boolean(errors.employee)} />}
          </Field>
        )}
        <Field label="Leave type" required error={errors.type}>
          {(p) => (
            <Select {...p} value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
              <option value="">Choose a leave type</option>
              {types?.map((t) => {
                const b = balances?.find((x) => x.leaveType.id === t.id);
                return (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {b && t.limitToBalance ? ` (${b.remaining} days left)` : ''}
                  </option>
                );
              })}
            </Select>
          )}
        </Field>
        {type && balance && type.limitToBalance && (
          <Alert tone={balance.remaining > 0 ? 'teal' : 'amber'}>
            {balance.remaining} day(s) of {type.name} available{balance.pending > 0 ? `, ${balance.pending} already pending` : ''}.{type.requiresHrApproval ? ' Needs supervisor and HR approval.' : ''}
          </Alert>
        )}
        <FormGrid>
          <Field label="From" required error={errors.start}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (end < e.target.value) setEnd(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="To" required error={errors.end} hint={!halfDay && calendarDays > 1 ? `${calendarDays} calendar days` : undefined}>
            {(p) => <Input {...p} type="date" value={halfDay ? start : end} min={start} disabled={halfDay} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
        </FormGrid>
        {(!type || type.allowHalfDay) && <Checkbox label="Half day" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />}
        <Field label="Reason" required error={errors.reason}>
          {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Attending a family wedding in Pokhara" />}
        </Field>
        <Field label={`Supporting document${type?.requiresDocument ? '' : ' (optional)'}`} required={type?.requiresDocument} error={errors.file} hint="PDF or image, up to 5 MB">
          {(p) => <Input {...p} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm file:text-fg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
      </div>
    </Dialog>
  );
}
