import { useQuery } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Code, Money, PageHeader } from '@/components/common';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Skeleton, StatusBadge } from '@/components/ui/display';
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Dialog, Drawer, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { titleCase } from '@/lib/utils';
import { useSalaryComponents } from '@/services/lookups';
import type { SalaryComponent } from '@/types';

type Calc = SalaryComponent['calculationType'];
interface Structure {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  employeeCount: number;
  lines: { id: string; componentId: string; calculationType: Calc; value: number; component: SalaryComponent }[];
}

const CATEGORIES = ['ALLOWANCE', 'OVERTIME', 'BONUS', 'COMMISSION', 'PROVIDENT_FUND', 'SOCIAL_SECURITY', 'LOAN', 'ADVANCE', 'OTHER'];
const calcText = (t: Calc, v: number) => (t === 'FIXED' ? <Money value={v} /> : `${v}% of ${t === 'PERCENT_OF_BASIC' ? 'basic' : 'gross'}`);

// ── Structures ──────────────────────────────────────────────

function StructureDrawer({ open, onOpenChange, structure }: { open: boolean; onOpenChange: (o: boolean) => void; structure: Structure | null }) {
  const { data: components } = useSalaryComponents();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [lines, setLines] = useState<{ componentId: string; calculationType: Calc; value: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(structure?.name ?? '');
    setDescription(structure?.description ?? '');
    setStatus(structure?.status ?? 'ACTIVE');
    setLines(structure?.lines.map((l) => ({ componentId: l.componentId, calculationType: l.calculationType, value: String(l.value) })) ?? []);
    setErr(null);
  }, [open, structure]);

  const body = () => ({ name, description: description || null, status, lines: lines.filter((l) => l.componentId).map((l) => ({ ...l, value: Number(l.value) })) });
  const save = useApiMutation(() => (structure ? api.put(`/salary-structures/${structure.id}`, body()) : api.post('/salary-structures', body())), { success: 'Structure saved', invalidate: [['salary-structures']], onSuccess: () => onOpenChange(false) });
  const usable = (components ?? []).filter((c) => c.status === 'ACTIVE' && c.isRecurring && !['TAX', 'UNPAID_LEAVE', 'OVERTIME'].includes(c.category));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={structure ? `Edit ${structure.name}` : 'New salary structure'}
      description="A template of allowances and deductions. Employees get a copy when their salary is set; editing the template later does not change existing salaries."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => (name.trim().length < 2 ? setErr('Enter a name') : save.mutate())}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormGrid>
          <Field label="Name" required error={err ?? undefined}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard staff (SSF)" />}
          </Field>
          <Field label="Status">
            {(p) => (
              <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="Description">{(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">Lines</h3>
            <Button variant="ghost" size="sm" onClick={() => setLines((l) => [...l, { componentId: '', calculationType: 'FIXED', value: '' }])}>
              <Plus /> Add line
            </Button>
          </div>
          <ul className="space-y-2">
            {lines.map((l, i) => {
              const comp = components?.find((c) => c.id === l.componentId);
              const up = (patch: Partial<typeof l>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-border p-2 sm:grid-cols-[2fr_1.4fr_1fr_auto]">
                  <Select
                    aria-label="Component"
                    className="col-span-2 sm:col-span-1"
                    value={l.componentId}
                    onChange={(e) => {
                      const c = components?.find((x) => x.id === e.target.value);
                      up({ componentId: e.target.value, calculationType: c?.calculationType ?? 'FIXED', value: c ? String(c.defaultValue) : '' });
                    }}
                  >
                    <option value="">Choose component</option>
                    {usable.map((c) => (
                      <option key={c.id} value={c.id} disabled={lines.some((x, j) => j !== i && x.componentId === c.id)}>
                        {c.type === 'EARNING' ? '+ ' : '− '}
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="Calculation" value={l.calculationType} onChange={(e) => up({ calculationType: e.target.value as Calc })}>
                    <option value="FIXED">Fixed amount</option>
                    <option value="PERCENT_OF_BASIC">% of basic</option>
                    {comp?.type === 'DEDUCTION' && <option value="PERCENT_OF_GROSS">% of gross</option>}
                  </Select>
                  <Input aria-label="Value" inputMode="decimal" className="num" value={l.value} onChange={(e) => up({ value: e.target.value })} />
                  <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
          {!lines.length && <p className="text-sm text-subtle">Add allowances like housing and transport, and deductions like SSF.</p>}
        </div>
      </div>
    </Drawer>
  );
}

function StructuresTab() {
  const { can } = useAuth();
  const manage = can('salary.manage');
  const { data, isLoading } = useQuery({ queryKey: ['salary-structures'], queryFn: () => api.get<Structure[]>('/salary-structures') });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Structure | null>(null);
  const [deleting, setDeleting] = useState<Structure | null>(null);
  const remove = useApiMutation((id: string) => api.del(`/salary-structures/${id}`), { success: 'Structure deleted', invalidate: [['salary-structures']], onSuccess: () => setDeleting(null) });

  if (isLoading) return <Skeleton className="h-64" />;
  return (
    <>
      {manage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus /> New structure
          </Button>
        </div>
      )}
      {!data?.length ? (
        <Card>
          <EmptyState icon={<Layers />} title="No salary structures" description="Create a template, then apply it when setting employee salaries." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((s) => (
            <Card key={s.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {s.name} <StatusBadge status={s.status} />
                  </span>
                }
                description={`${s.employeeCount} employee(s) currently on this structure`}
                actions={
                  manage && (
                    <>
                      <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(s); setOpen(true); }} aria-label={`Edit ${s.name}`}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`}>
                        <Trash2 />
                      </Button>
                    </>
                  )
                }
              />
              <CardBody className="space-y-2 text-sm">
                {s.description && <p className="text-subtle">{s.description}</p>}
                <ul className="divide-y divide-border">
                  <li className="flex justify-between py-1.5 font-medium text-fg">
                    <span>Basic salary</span>
                    <span className="text-subtle">Set per employee</span>
                  </li>
                  {s.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2 py-1.5">
                      <span className="text-muted">
                        <Badge tone={l.component.type === 'EARNING' ? 'green' : 'red'} className="mr-2">
                          {l.component.type === 'EARNING' ? '+' : '−'}
                        </Badge>
                        {l.component.name}
                      </span>
                      <span className="num text-fg">{calcText(l.calculationType, l.value)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      <StructureDrawer open={open} onOpenChange={setOpen} structure={editing} />
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="Delete structure?" description="Structures used by employee salaries cannot be deleted. Mark them inactive instead." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}

// ── Components ──────────────────────────────────────────────

const blank = { name: '', code: '', type: 'EARNING', category: 'ALLOWANCE', calculationType: 'FIXED', defaultValue: '0', taxable: true, reducesTaxableIncome: false, employerContribution: '0', isRecurring: true, sortOrder: '0', description: '', status: 'ACTIVE' };

function ComponentsTab() {
  const { can } = useAuth();
  const manage = can('salary.manage');
  const { data, isLoading } = useSalaryComponents();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryComponent | null>(null);
  const [deleting, setDeleting] = useState<SalaryComponent | null>(null);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setF(editing ? { ...editing, defaultValue: String(editing.defaultValue), employerContribution: String(editing.employerContribution), sortOrder: String(editing.sortOrder), description: editing.description ?? '' } : blank);
    setErr({});
  }, [open, editing]);
  const set = (k: keyof typeof blank, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const body = () => ({ ...f, description: f.description || null, defaultValue: Number(f.defaultValue), employerContribution: Number(f.employerContribution), sortOrder: Number(f.sortOrder) });
  const save = useApiMutation(() => (editing ? api.put(`/salary-components/${editing.id}`, body()) : api.post('/salary-components', body())), { success: 'Component saved', invalidate: [['salary-components']], onSuccess: () => setOpen(false) });
  const remove = useApiMutation((id: string) => api.del(`/salary-components/${id}`), { success: 'Component deleted', invalidate: [['salary-components']], onSuccess: () => setDeleting(null) });

  const columns: Column<SalaryComponent>[] = [
    { key: 'name', header: 'Component', mobile: 'title', cell: (c) => <span className="font-medium text-fg">{c.name}</span> },
    { key: 'code', header: 'Code', mobile: 'subtitle', cell: (c) => <Code>{c.code}</Code> },
    { key: 'type', header: 'Type', cell: (c) => <Badge tone={c.type === 'EARNING' ? 'green' : 'red'}>{c.type === 'EARNING' ? 'Earning' : 'Deduction'}</Badge> },
    { key: 'category', header: 'Category', cell: (c) => titleCase(c.category) },
    { key: 'default', header: 'Default', align: 'right', cell: (c) => calcText(c.calculationType, c.defaultValue) },
    {
      key: 'tax',
      header: 'Tax treatment',
      optional: true,
      cell: (c) => (c.type === 'EARNING' ? (c.taxable ? 'Taxable' : 'Tax free') : c.reducesTaxableIncome ? 'Reduces taxable income' : '—'),
    },
    { key: 'recurring', header: 'Used as', optional: true, cell: (c) => (c.isRecurring ? 'Monthly' : 'One-off') },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <>
      {manage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus /> New component
          </Button>
        </div>
      )}
      <Card>
        <DataTable
          caption="Salary components"
          columns={columns}
          rows={data}
          rowKey={(c) => c.id}
          loading={isLoading}
          columnMenu
          rowActions={
            manage
              ? (c) => (
                  <span className="flex justify-end gap-0.5">
                    <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(c); setOpen(true); }} aria-label={`Edit ${c.name}`}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>
                      <Trash2 />
                    </Button>
                  </span>
                )
              : undefined
          }
        />
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={editing ? `Edit ${editing.name}` : 'New salary component'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              onClick={() => {
                const e: Record<string, string> = {};
                if (f.name.trim().length < 2) e.name = 'Enter a name';
                if (!/^[A-Za-z0-9_]{2,20}$/.test(f.code)) e.code = '2–20 letters, numbers or underscores';
                setErr(e);
                if (!Object.keys(e).length) save.mutate();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid cols={3}>
            <Field label="Name" required error={err.name} className="sm:col-span-2">
              {(p) => <Input {...p} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Dashain Allowance" />}
            </Field>
            <Field label="Code" required error={err.code}>
              {(p) => <Input {...p} value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} className="font-mono" placeholder="DASHAIN" />}
            </Field>
            <Field label="Type">
              {(p) => (
                <Select {...p} value={f.type} onChange={(e) => set('type', e.target.value)} disabled={Boolean(editing)}>
                  <option value="EARNING">Earning</option>
                  <option value="DEDUCTION">Deduction</option>
                </Select>
              )}
            </Field>
            <Field label="Category">
              {(p) => (
                <Select {...p} value={f.category} onChange={(e) => set('category', e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {titleCase(c)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Status">
              {(p) => (
                <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              )}
            </Field>
            <Field label="Default calculation">
              {(p) => (
                <Select {...p} value={f.calculationType} onChange={(e) => set('calculationType', e.target.value)}>
                  <option value="FIXED">Fixed amount</option>
                  <option value="PERCENT_OF_BASIC">% of basic</option>
                  {f.type === 'DEDUCTION' && <option value="PERCENT_OF_GROSS">% of gross</option>}
                </Select>
              )}
            </Field>
            <Field label="Default value">{(p) => <Input {...p} inputMode="decimal" className="num" value={f.defaultValue} onChange={(e) => set('defaultValue', e.target.value)} />}</Field>
            <Field label="Employer share %" hint="For reports (e.g. SSF employer 20%)">
              {(p) => <Input {...p} inputMode="decimal" className="num" value={f.employerContribution} onChange={(e) => set('employerContribution', e.target.value)} />}
            </Field>
          </FormGrid>
          <Field label="Description">{(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {f.type === 'EARNING' ? (
              <Checkbox label="Taxable income" checked={f.taxable} onChange={(e) => set('taxable', e.target.checked)} />
            ) : (
              <Checkbox label="Reduces taxable income (retirement contribution such as PF, SSF, CIT)" checked={f.reducesTaxableIncome} onChange={(e) => set('reducesTaxableIncome', e.target.checked)} />
            )}
            <Checkbox label="Monthly (used in salary structures)" checked={f.isRecurring} onChange={(e) => set('isRecurring', e.target.checked)} />
          </div>
          {!f.isRecurring && <Alert tone="blue">One-off components are added per month from Payroll → Adjustments (bonus, loan instalment, advance recovery).</Alert>}
        </div>
      </Dialog>
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="Delete component?" description="Components already used in salaries or adjustments cannot be deleted." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}

export default function SalaryStructuresPage() {
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <PageHeader title="Salary structures" description="Allowance and deduction building blocks used by payroll. Rates here are yours to set; nothing is hard-coded." />
      <Tabs value={params.get('tab') ?? 'structures'} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="structures">Structures</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
        </TabsList>
        <TabsContent value="structures">
          <StructuresTab />
        </TabsContent>
        <TabsContent value="components">
          <ComponentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
