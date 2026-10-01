import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Money } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/display';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { Drawer } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate, todayISO } from '@/lib/utils';
import { useSalaryComponents } from '@/services/lookups';
import type { Employee } from '@/types';

interface SalaryRecord {
  id: string;
  basicSalary: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  structure: { id: string; name: string } | null;
  lines: { id: string; componentId: string; calculationType: string; value: number; component: { name: string; code: string; type: 'EARNING' | 'DEDUCTION' } }[];
}

interface Line {
  componentId: string;
  calculationType: 'FIXED' | 'PERCENT_OF_BASIC' | 'PERCENT_OF_GROSS';
  value: string;
}

const calcLabel = (t: string, v: number) => (t === 'FIXED' ? <Money value={v} /> : `${v}% of ${t === 'PERCENT_OF_BASIC' ? 'basic' : 'gross'}`);

function ReviseSalary({ employee, current, open, onOpenChange }: { employee: Employee; current?: SalaryRecord; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: components } = useSalaryComponents();
  const { data: structures } = useQuery({ queryKey: ['salary-structures'], queryFn: () => api.get<{ id: string; name: string; status: string; lines: { componentId: string; calculationType: Line['calculationType']; value: number }[] }[]>('/salary-structures') });
  const [basic, setBasic] = useState(current ? String(current.basicSalary) : '');
  const [from, setFrom] = useState(todayISO());
  const [structureId, setStructureId] = useState(current?.structure?.id ?? '');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>(current?.lines.map((l) => ({ componentId: l.componentId, calculationType: l.calculationType as Line['calculationType'], value: String(l.value) })) ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useApiMutation(
    () =>
      api.post(`/employees/${employee.id}/salaries`, {
        basicSalary: Number(basic),
        effectiveFrom: from,
        structureId: structureId || undefined,
        reason: reason || undefined,
        lines: lines.filter((l) => l.componentId).map((l) => ({ ...l, value: Number(l.value) })),
      }),
    { success: 'Salary revised', invalidate: [['salaries', employee.id], ['employee', employee.id]], onSuccess: () => onOpenChange(false) },
  );

  const applyStructure = (id: string) => {
    setStructureId(id);
    const s = structures?.find((x) => x.id === id);
    if (s) setLines(s.lines.map((l) => ({ componentId: l.componentId, calculationType: l.calculationType, value: String(l.value) })));
  };

  const recurring = (components ?? []).filter((c) => c.status === 'ACTIVE' && c.category !== 'TAX' && c.category !== 'UNPAID_LEAVE' && c.category !== 'OVERTIME');

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Revise salary"
      description="Creates a new salary from the effective date. Earlier salaries and past payroll stay as they were."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => {
              if (!basic || Number(basic) < 0 || Number.isNaN(Number(basic))) return setError('Enter the monthly basic salary');
              if (current && from <= current.effectiveFrom.slice(0, 10)) return setError(`The new salary must start after ${formatDate(current.effectiveFrom)}`);
              setError(null);
              save.mutate();
            }}
          >
            Save salary
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="red">{error}</Alert>}
        <FormGrid>
          <Field label="Basic salary (NPR, monthly)" required>
            {(p) => <Input {...p} value={basic} onChange={(e) => setBasic(e.target.value)} inputMode="decimal" className="num" />}
          </Field>
          <Field label="Effective from" required>
            {(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
          <Field label="Start from a structure" hint="Replaces the lines below">
            {(p) => (
              <Select {...p} value={structureId} onChange={(e) => applyStructure(e.target.value)}>
                <option value="">None</option>
                {structures
                  ?.filter((s) => s.status === 'ACTIVE')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Reason">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Annual increment" />}</Field>
        </FormGrid>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">Allowances and deductions</h3>
            <Button variant="ghost" size="sm" onClick={() => setLines((l) => [...l, { componentId: '', calculationType: 'FIXED', value: '' }])}>
              <Plus /> Add line
            </Button>
          </div>
          {lines.length === 0 && <p className="text-sm text-subtle">Basic salary only. Add allowances such as housing or transport, or deductions such as SSF.</p>}
          <ul className="space-y-2">
            {lines.map((l, i) => {
              const comp = components?.find((c) => c.id === l.componentId);
              const update = (patch: Partial<Line>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-border p-2 sm:grid-cols-[2fr_1.4fr_1fr_auto]">
                  <Select
                    aria-label="Component"
                    value={l.componentId}
                    onChange={(e) => {
                      const c = components?.find((x) => x.id === e.target.value);
                      update({ componentId: e.target.value, calculationType: c?.calculationType ?? l.calculationType, value: l.value || (c ? String(c.defaultValue) : '') });
                    }}
                    className="col-span-2 sm:col-span-1"
                  >
                    <option value="">Choose component</option>
                    {recurring.map((c) => (
                      <option key={c.id} value={c.id} disabled={lines.some((x, j) => j !== i && x.componentId === c.id)}>
                        {c.type === 'EARNING' ? '+ ' : '− '}
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="Calculation" value={l.calculationType} onChange={(e) => update({ calculationType: e.target.value as Line['calculationType'] })}>
                    <option value="FIXED">Fixed amount</option>
                    <option value="PERCENT_OF_BASIC">% of basic</option>
                    {comp?.type === 'DEDUCTION' && <option value="PERCENT_OF_GROSS">% of gross</option>}
                  </Select>
                  <Input aria-label="Value" value={l.value} onChange={(e) => update({ value: e.target.value })} inputMode="decimal" className="num" />
                  <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line">
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

export function SalaryPanel({ employee }: { employee: Employee }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['salaries', employee.id], queryFn: () => api.get<SalaryRecord[]>(`/employees/${employee.id}/salaries`) });
  const { data: payslips } = useQuery({
    queryKey: ['payslips', 'employee', employee.id],
    queryFn: () => api.list<{ id: string; period: string; netSalary: number; grossSalary: number; payslipNumber: string }>('/payslips', { employeeId: employee.id, limit: 12 }),
  });
  const current = data?.find((s) => !s.effectiveTo) ?? data?.[0];

  if (isLoading) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Salary structure"
          description={current ? `Effective from ${formatDate(current.effectiveFrom, 'long')}${current.structure ? ` · ${current.structure.name}` : ''}` : undefined}
          actions={
            can('salary.manage') && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <TrendingUp /> {current ? 'Revise salary' : 'Add salary'}
              </Button>
            )
          }
        />
        {current ? (
          <CardBody>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 font-medium text-fg">Basic salary</td>
                  <td className="py-2 text-right">
                    <Money value={current.basicSalary} currency="NPR" />
                  </td>
                </tr>
                {current.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-muted">
                      <Badge tone={l.component.type === 'EARNING' ? 'green' : 'red'} className="mr-2">
                        {l.component.type === 'EARNING' ? '+' : '−'}
                      </Badge>
                      {l.component.name}
                    </td>
                    <td className="num py-2 text-right text-fg">{calcLabel(l.calculationType, l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-subtle">Tax, overtime and unpaid leave are worked out during payroll from attendance and the configured tax rules.</p>
          </CardBody>
        ) : (
          <EmptyState title="No salary recorded" description="Add a salary so this employee is included in payroll." />
        )}
      </Card>
      <Card>
        <CardHeader title="Salary history" />
        <ul className="divide-y divide-border">
          {data?.map((s) => (
            <li key={s.id} className="px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Money value={s.basicSalary} className="font-medium text-fg" />
                {!s.effectiveTo && <Badge tone="green">Current</Badge>}
              </div>
              <p className="num mt-0.5 text-xs text-subtle">
                {formatDate(s.effectiveFrom)} – {s.effectiveTo ? formatDate(s.effectiveTo) : 'now'}
              </p>
              {s.reason && <p className="text-xs text-subtle">{s.reason}</p>}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader title="Payslips" />
        {payslips?.data.length ? (
          <ul className="divide-y divide-border">
            {payslips.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link to={`/app/payslips/${p.id}`} className="font-medium text-primary hover:underline">
                  {p.period}
                </Link>
                <span className="text-subtle">
                  Net <Money value={p.netSalary} className="text-fg" />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No payslips yet" className="py-8" />
        )}
      </Card>
      {open && <ReviseSalary employee={employee} current={current} open={open} onOpenChange={setOpen} />}
    </div>
  );
}
