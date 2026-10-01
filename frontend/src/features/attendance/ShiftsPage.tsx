import { Clock, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { Checkbox, Field, FormGrid, Input, Select } from '@/components/ui/form';
import { ConfirmDialog, Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { useShifts } from '@/services/lookups';
import type { Shift } from '@/types';

const empty = { name: '', startTime: '09:00', endTime: '17:00', gracePeriod: '15', breakDuration: '60', workingHours: '7', isFlexible: false, status: 'ACTIVE' };

export default function ShiftsPage() {
  const { can } = useAuth();
  const manage = can('shifts.manage');
  const { data, isLoading } = useShifts();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [deleting, setDeleting] = useState<Shift | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open)
      setForm(
        editing
          ? { name: editing.name, startTime: editing.startTime, endTime: editing.endTime, gracePeriod: String(editing.gracePeriod), breakDuration: String(editing.breakDuration), workingHours: String(editing.workingHours), isFlexible: editing.isFlexible, status: editing.status }
          : empty,
      );
    setError(null);
  }, [open, editing]);

  const set = (k: keyof typeof empty, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const payload = () => ({ ...form, gracePeriod: Number(form.gracePeriod), breakDuration: Number(form.breakDuration), workingHours: Number(form.workingHours) });
  const save = useApiMutation(() => (editing ? api.put(`/shifts/${editing.id}`, payload()) : api.post('/shifts', payload())), { success: 'Shift saved', invalidate: [['shifts']], onSuccess: () => setOpen(false) });
  const remove = useApiMutation((id: string) => api.del(`/shifts/${id}`), { success: 'Shift deleted', invalidate: [['shifts']], onSuccess: () => setDeleting(null) });
  const makeDefault = useApiMutation((id: string) => api.put('/organisations/current', { defaultShiftId: id }), { success: 'Default shift updated', invalidate: [['shifts']] });

  const columns: Column<Shift>[] = [
    {
      key: 'name',
      header: 'Shift',
      mobile: 'title',
      cell: (s) => (
        <span className="flex items-center gap-2 font-medium text-fg">
          {s.name} {s.isDefault && <Badge tone="teal">Default</Badge>}
        </span>
      ),
    },
    { key: 'time', header: 'Hours', mobile: 'subtitle', cell: (s) => <span className="num">{s.isFlexible ? `Flexible · ${s.workingHours} h/day` : `${s.startTime} – ${s.endTime}`}</span> },
    { key: 'grace', header: 'Grace', align: 'right', cell: (s) => `${s.gracePeriod} min` },
    { key: 'break', header: 'Break', align: 'right', cell: (s) => `${s.breakDuration} min` },
    { key: 'working', header: 'Working hours', align: 'right', cell: (s) => `${s.workingHours} h` },
    { key: 'employees', header: 'Employees', align: 'right', cell: (s) => s._count?.employees ?? 0 },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Shifts" description="Late, early-leave and overtime minutes are measured against each employee’s shift." actions={manage && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Add shift</Button>} />
      <Card>
        <DataTable
          caption="Shifts"
          columns={columns}
          rows={data}
          rowKey={(s) => s.id}
          loading={isLoading}
          rowActions={
            manage
              ? (s) => (
                  <span className="flex justify-end gap-0.5">
                    {!s.isDefault && s.status === 'ACTIVE' && (
                      <Button variant="ghost" size="icon-sm" onClick={() => makeDefault.mutate(s.id)} aria-label={`Make ${s.name} the default`} title="Make default">
                        <Star />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(s); setOpen(true); }} aria-label={`Edit ${s.name}`}>
                      <Pencil />
                    </Button>
                    {!s.isDefault && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`}>
                        <Trash2 />
                      </Button>
                    )}
                  </span>
                )
              : undefined
          }
          empty={<EmptyState icon={<Clock />} title="No shifts" />}
        />
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit shift' : 'Add shift'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              onClick={() => {
                if (form.name.trim().length < 2) return setError('Give the shift a name');
                if (!(Number(form.workingHours) > 0)) return setError('Working hours must be more than 0');
                save.mutate();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required error={error ?? undefined}>
            {(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Morning Shift" />}
          </Field>
          <FormGrid>
            <Field label="Starts">{(p) => <Input {...p} type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />}</Field>
            <Field label="Ends" hint="Earlier than the start means an overnight shift">{(p) => <Input {...p} type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />}</Field>
            <Field label="Grace period (minutes)" hint="Arrivals within this are not late">{(p) => <Input {...p} type="number" min={0} value={form.gracePeriod} onChange={(e) => set('gracePeriod', e.target.value)} />}</Field>
            <Field label="Break (minutes)">{(p) => <Input {...p} type="number" min={0} value={form.breakDuration} onChange={(e) => set('breakDuration', e.target.value)} />}</Field>
            <Field label="Working hours per day">{(p) => <Input {...p} type="number" step="0.25" min={0.5} value={form.workingHours} onChange={(e) => set('workingHours', e.target.value)} />}</Field>
            <Field label="Status">
              {(p) => (
                <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              )}
            </Field>
          </FormGrid>
          <Checkbox label="Flexible shift: only total hours count, never late" checked={form.isFlexible} onChange={(e) => set('isFlexible', e.target.checked)} />
        </div>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete shift?"
        description="A shift that has been used cannot be deleted; mark it inactive instead."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
