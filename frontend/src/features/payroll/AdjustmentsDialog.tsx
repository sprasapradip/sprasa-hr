import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmployeePicker } from '@/components/common/EmployeePicker';
import { Money } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/display';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { MONTH_NAMES, todayISO } from '@/lib/utils';
import { useSalaryComponents } from '@/services/lookups';

interface Adjustment {
  id: string;
  amount: number;
  note: string | null;
  component: { name: string; type: 'EARNING' | 'DEDUCTION' };
  employee: { employeeCode: string; firstName: string; lastName: string };
}

/** One-off items for a month: bonus, commission, loan instalment, advance recovery. */
export function AdjustmentsDialog({ open, onOpenChange, year: y, month: m, locked }: { open: boolean; onOpenChange: (o: boolean) => void; year?: number; month?: number; locked?: boolean }) {
  const t = todayISO();
  const [year, setYear] = useState(y ?? Number(t.slice(0, 4)));
  const [month, setMonth] = useState(m ?? Number(t.slice(5, 7)));
  const { data: components } = useSalaryComponents();
  const { data, isLoading } = useQuery({ queryKey: ['adjustments', year, month], queryFn: () => api.get<Adjustment[]>('/payroll-adjustments', { year, month }) });
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [componentId, setComponentId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const add = useApiMutation(() => api.post('/payroll-adjustments', { employeeId, componentId, year, month, amount: Number(amount), note: note || null }), {
    success: 'Adjustment added',
    invalidate: [['adjustments', year, month]],
    onSuccess: () => {
      setAmount('');
      setNote('');
    },
  });
  const remove = useApiMutation((id: string) => api.del(`/payroll-adjustments/${id}`), { success: 'Adjustment removed', invalidate: [['adjustments', year, month]] });
  const options = (components ?? []).filter((c) => c.status === 'ACTIVE' && !['TAX', 'UNPAID_LEAVE'].includes(c.category));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Monthly adjustments" description="Bonus, commission, loan instalments and advance recovery for one month. Recalculate the draft payroll after changes.">
      <div className="space-y-5">
        {!y && (
          <FormGrid>
            <Field label="Month">
              {(p) => (
                <Select {...p} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTH_NAMES.map((mn, i) => (
                    <option key={mn} value={i + 1}>
                      {mn}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Year">{(p) => <Input {...p} type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />}</Field>
          </FormGrid>
        )}
        {!locked && (
          <div className="rounded-lg border border-border p-3">
            <FormGrid>
              <Field label="Employee">{(p) => <EmployeePicker id={p.id} value={employeeId} onChange={setEmployeeId} />}</Field>
              <Field label="Component">
                {(p) => (
                  <Select {...p} value={componentId} onChange={(e) => setComponentId(e.target.value)}>
                    <option value="">Choose</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.type === 'EARNING' ? '+ ' : '− '}
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Amount (NPR)">{(p) => <Input {...p} inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
              <Field label="Note">{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dashain bonus" />}</Field>
            </FormGrid>
            <Button className="mt-3" size="sm" disabled={!employeeId || !componentId || !(Number(amount) > 0)} loading={add.isPending} onClick={() => add.mutate()}>
              Add adjustment
            </Button>
          </div>
        )}
        {isLoading ? null : !data?.length ? (
          <EmptyState title={`No adjustments for ${MONTH_NAMES[month - 1]} ${year}`} className="py-6" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Badge tone={a.component.type === 'EARNING' ? 'green' : 'red'}>{a.component.type === 'EARNING' ? '+' : '−'}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">
                    {a.employee.firstName} {a.employee.lastName} · {a.component.name}
                  </span>
                  {a.note && <span className="block truncate text-xs text-subtle">{a.note}</span>}
                </span>
                <Money value={a.amount} />
                {!locked && (
                  <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(a.id)} aria-label="Remove adjustment">
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
