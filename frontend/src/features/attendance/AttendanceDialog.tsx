import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmployeePicker } from '@/components/common/EmployeePicker';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { todayISO } from '@/lib/utils';
import type { AttendanceRecord } from '@/types';

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'WORK_FROM_HOME', 'ABSENT', 'LEAVE', 'HOLIDAY', 'WEEKEND'] as const;
const LABELS: Record<string, string> = { PRESENT: 'Present', LATE: 'Late', HALF_DAY: 'Half day', WORK_FROM_HOME: 'Work from home', ABSENT: 'Absent', LEAVE: 'Leave', HOLIDAY: 'Holiday', WEEKEND: 'Weekend' };
export const statusLabel = (s: string) => LABELS[s] ?? s;

/** Add or edit one attendance record. Leave status blank to calculate it from the times and shift. */
export function AttendanceDialog({ open, onOpenChange, record, date }: { open: boolean; onOpenChange: (o: boolean) => void; record: AttendanceRecord | null; date?: string }) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [day, setDay] = useState(date ?? todayISO());
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [status, setStatus] = useState('');
  const [remarks, setRemarks] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmployeeId(record?.employeeId ?? null);
    setDay(record?.date.slice(0, 10) ?? date ?? todayISO());
    setCheckIn(record?.checkIn ?? '');
    setCheckOut(record?.checkOut ?? '');
    setStatus(record && ['ABSENT', 'LEAVE', 'HOLIDAY', 'WEEKEND', 'WORK_FROM_HOME', 'HALF_DAY'].includes(record.status) ? record.status : '');
    setRemarks(record?.remarks ?? '');
    setErr(null);
  }, [open, record, date]);

  const save = useApiMutation(
    () => {
      const body = { checkIn: checkIn || null, checkOut: checkOut || null, status: status || undefined, remarks: remarks || null };
      return record ? api.put(`/attendance/${record.id}`, body) : api.post('/attendance', { ...body, employeeId, date: day });
    },
    { success: 'Attendance saved', invalidate: [['attendance'], ['attendance-summary'], ['dashboard'], ['attendance-month']], onSuccess: () => onOpenChange(false) },
  );

  const submit = () => {
    if (!record && !employeeId) return setErr('Choose an employee');
    if (checkOut && !checkIn) return setErr('Enter a check-in time before check-out');
    setErr(null);
    save.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={record ? `Edit attendance · ${record.employeeName}` : 'Record attendance'}
      description="Leave the status on Automatic to work out present, late or half day from the times and the employee’s shift."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!record && (
          <FormGrid>
            <Field label="Employee" required error={err === 'Choose an employee' ? err : undefined}>
              {(p) => <EmployeePicker id={p.id} value={employeeId} onChange={setEmployeeId} />}
            </Field>
            <Field label="Date" required>
              {(p) => <Input {...p} type="date" value={day} max={todayISO()} onChange={(e) => setDay(e.target.value)} />}
            </Field>
          </FormGrid>
        )}
        <FormGrid>
          <Field label="Check in">{(p) => <Input {...p} type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />}</Field>
          <Field label="Check out" error={err && err !== 'Choose an employee' ? err : undefined}>
            {(p) => <Input {...p} type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />}
          </Field>
        </FormGrid>
        <Field label="Status">
          {(p) => (
            <Select {...p} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Automatic (from times)</option>
              {ATTENDANCE_STATUSES.filter((s) => s !== 'PRESENT' && s !== 'LATE').map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Remarks">{(p) => <Input {...p} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Client visit in Lalitpur" />}</Field>
      </div>
    </Dialog>
  );
}
