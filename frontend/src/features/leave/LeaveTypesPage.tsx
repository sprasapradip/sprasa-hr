import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Code, PageHeader } from '@/components/common';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { useLeaveTypes } from '@/services/lookups';
import type { LeaveType } from '@/types';

type Form = Omit<LeaveType, 'id' | 'annualDays' | 'maxCarryForward' | 'description'> & { annualDays: string; maxCarryForward: string; description: string };
const blank: Form = { name: '', code: '', description: '', annualDays: '0', carryForward: false, maxCarryForward: '0', requiresDocument: false, requiresHrApproval: false, paid: true, allowHalfDay: true, limitToBalance: true, status: 'ACTIVE' };

export default function LeaveTypesPage() {
  const { data, isLoading } = useLeaveTypes();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [deleting, setDeleting] = useState<LeaveType | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setForm(editing ? { ...editing, description: editing.description ?? '', annualDays: String(editing.annualDays), maxCarryForward: String(editing.maxCarryForward) } : blank);
    setErr({});
  }, [open, editing]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const body = () => ({ ...form, description: form.description || null, annualDays: Number(form.annualDays), maxCarryForward: form.carryForward ? Number(form.maxCarryForward) : 0 });
  const save = useApiMutation(() => (editing ? api.put(`/leave/types/${editing.id}`, body()) : api.post('/leave/types', body())), { success: 'Leave type saved', invalidate: [['leave-types']], onSuccess: () => setOpen(false) });
  const remove = useApiMutation((id: string) => api.del(`/leave/types/${id}`), { success: 'Leave type deleted', invalidate: [['leave-types']], onSuccess: () => setDeleting(null) });

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Enter a name';
    if (!/^[A-Za-z0-9_-]{1,10}$/.test(form.code)) e.code = '1–10 letters or numbers';
    if (Number.isNaN(Number(form.annualDays)) || Number(form.annualDays) < 0) e.annualDays = 'Enter 0 or more days';
    setErr(e);
    if (!Object.keys(e).length) save.mutate();
  };

  const columns: Column<LeaveType>[] = [
    { key: 'name', header: 'Leave type', mobile: 'title', cell: (t) => <span className="font-medium text-fg">{t.name}</span> },
    { key: 'code', header: 'Code', mobile: 'subtitle', cell: (t) => <Code>{t.code}</Code> },
    { key: 'days', header: 'Days / year', align: 'right', cell: (t) => (t.limitToBalance ? t.annualDays : 'No limit') },
    { key: 'carry', header: 'Carry forward', cell: (t) => (t.carryForward ? `Up to ${t.maxCarryForward} days` : 'No') },
    {
      key: 'rules',
      header: 'Rules',
      cell: (t) => (
        <span className="flex flex-wrap gap-1">
          {!t.paid && <Badge tone="amber">Unpaid</Badge>}
          {t.requiresHrApproval && <Badge tone="blue">HR approval</Badge>}
          {t.requiresDocument && <Badge tone="violet">Document</Badge>}
          {!t.allowHalfDay && <Badge>Full days only</Badge>}
        </span>
      ),
    },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Leave types" description="Entitlements, carry-forward and approval rules for each kind of leave." actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Add leave type</Button>} />
      <Card>
        <DataTable
          caption="Leave types"
          columns={columns}
          rows={data}
          rowKey={(t) => t.id}
          loading={isLoading}
          rowActions={(t) => (
            <span className="flex justify-end gap-0.5">
              <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(t); setOpen(true); }} aria-label={`Edit ${t.name}`}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}>
                <Trash2 />
              </Button>
            </span>
          )}
          empty={<EmptyState icon={<Tags />} title="No leave types" />}
        />
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${editing.name}` : 'Add leave type'}
        description={editing ? 'Changes to days per year apply to balances created from now on. Adjust existing balances from Leave Balances.' : undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={submit}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid cols={3}>
            <Field label="Name" required error={err.name} className="sm:col-span-2">
              {(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Annual Leave" />}
            </Field>
            <Field label="Code" required error={err.code}>
              {(p) => <Input {...p} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="AL" className="font-mono" />}
            </Field>
            <Field label="Days per year" required error={err.annualDays}>
              {(p) => <Input {...p} type="number" min={0} step="0.5" value={form.annualDays} onChange={(e) => set('annualDays', e.target.value)} />}
            </Field>
            <Field label="Max carry forward" hint="Days moved into next year">
              {(p) => <Input {...p} type="number" min={0} step="0.5" value={form.maxCarryForward} disabled={!form.carryForward} onChange={(e) => set('maxCarryForward', e.target.value)} />}
            </Field>
            <Field label="Status">
              {(p) => (
                <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value as Form['status'])}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              )}
            </Field>
          </FormGrid>
          <Field label="Description">{(p) => <Textarea {...p} rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox label="Paid leave" checked={form.paid} onChange={(e) => set('paid', e.target.checked)} />
            <Checkbox label="Limit requests to the available balance" checked={form.limitToBalance} onChange={(e) => set('limitToBalance', e.target.checked)} />
            <Checkbox label="Carry unused days into next year" checked={form.carryForward} onChange={(e) => set('carryForward', e.target.checked)} />
            <Checkbox label="HR approval after the supervisor" checked={form.requiresHrApproval} onChange={(e) => set('requiresHrApproval', e.target.checked)} />
            <Checkbox label="Supporting document required" checked={form.requiresDocument} onChange={(e) => set('requiresDocument', e.target.checked)} />
            <Checkbox label="Half days allowed" checked={form.allowHalfDay} onChange={(e) => set('allowHalfDay', e.target.checked)} />
          </div>
        </div>
      </Dialog>
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="Delete leave type?" description="Leave types that have been used cannot be deleted. Mark them inactive instead." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}
