import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate, todayISO } from '@/lib/utils';
import { useShifts } from '@/services/lookups';
import type { Employee, Shift } from '@/types';

export function ShiftPanel({ employee }: { employee: Employee }) {
  const { can } = useAuth();
  const { data: shifts } = useShifts();
  const { data: history } = useQuery({
    queryKey: ['employee-shifts', employee.id],
    queryFn: () => api.get<{ id: string; effectiveFrom: string; effectiveTo: string | null; shift: Shift }[]>(`/employees/${employee.id}/shifts`),
  });
  const [shiftId, setShiftId] = useState('');
  const [from, setFrom] = useState(todayISO());
  const assign = useApiMutation(() => api.post(`/employees/${employee.id}/shifts`, { shiftId, effectiveFrom: from }), {
    success: 'Shift assigned',
    invalidate: [['employee-shifts', employee.id], ['employee', employee.id]],
    onSuccess: () => setShiftId(''),
  });

  return (
    <Card>
      <CardHeader title="Shift" />
      <CardBody className="space-y-4">
        <ul className="space-y-2 text-sm">
          {history?.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2">
              <span className="text-fg">
                {h.shift.name} <span className="num text-subtle">({h.shift.startTime}–{h.shift.endTime})</span>
              </span>
              <span className="num text-xs text-subtle">
                {formatDate(h.effectiveFrom)} – {h.effectiveTo ? formatDate(h.effectiveTo) : <Badge tone="green">Current</Badge>}
              </span>
            </li>
          ))}
          {!history?.length && <li className="text-subtle">Uses the organisation’s default shift.</li>}
        </ul>
        {can('shifts.manage', 'attendance.manage') && (
          <div className="border-t border-border pt-4">
            <FormGrid>
              <Field label="Change shift">
                {(p) => (
                  <Select {...p} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                    <option value="">Choose shift</option>
                    {shifts
                      ?.filter((s) => s.status === 'ACTIVE')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime}–{s.endTime})
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              <Field label="From">{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
            </FormGrid>
            <Button className="mt-3" size="sm" disabled={!shiftId} loading={assign.isPending} onClick={() => assign.mutate()}>
              Assign shift
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
