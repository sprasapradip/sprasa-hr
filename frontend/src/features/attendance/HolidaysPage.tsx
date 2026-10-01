import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { ConfirmDialog, Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate, todayISO } from '@/lib/utils';
import type { Holiday } from '@/types';

const TYPE_LABEL = { PUBLIC: 'Public', ORGANISATION: 'Organisation', OPTIONAL: 'Optional' } as const;
const weekday = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

export default function HolidaysPage() {
  const { can } = useAuth();
  const manage = can('shifts.manage');
  const [year, setYear] = useState(Number(todayISO().slice(0, 4)));
  const { data, isLoading } = useQuery({ queryKey: ['holidays', year], queryFn: () => api.get<Holiday[]>('/holidays', { year }) });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ name: '', date: todayISO(), type: 'PUBLIC', description: '', status: 'ACTIVE' });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) setForm(editing ? { name: editing.name, date: editing.date.slice(0, 10), type: editing.type, description: editing.description ?? '', status: editing.status } : { name: '', date: todayISO(), type: 'PUBLIC', description: '', status: 'ACTIVE' });
    setErr(null);
  }, [open, editing]);

  const save = useApiMutation(() => (editing ? api.put(`/holidays/${editing.id}`, { ...form, description: form.description || null }) : api.post('/holidays', { ...form, description: form.description || null })), {
    success: 'Holiday saved',
    invalidate: [['holidays']],
    onSuccess: () => setOpen(false),
  });
  const remove = useApiMutation((id: string) => api.del(`/holidays/${id}`), { success: 'Holiday deleted', invalidate: [['holidays']], onSuccess: () => setDeleting(null) });
  const today = todayISO();

  const columns: Column<Holiday>[] = [
    { key: 'date', header: 'Date', mobile: 'subtitle', cell: (h) => <span className={`num ${h.date.slice(0, 10) < today ? 'text-subtle' : 'text-fg'}`}>{formatDate(h.date)} · {weekday(h.date)}</span> },
    { key: 'name', header: 'Holiday', mobile: 'title', cell: (h) => <span className="font-medium text-fg">{h.name}</span> },
    { key: 'type', header: 'Type', cell: (h) => <Badge tone={h.type === 'PUBLIC' ? 'blue' : h.type === 'ORGANISATION' ? 'teal' : 'neutral'}>{TYPE_LABEL[h.type]}</Badge> },
    { key: 'description', header: 'Notes', optional: true, cell: (h) => <span className="text-subtle">{h.description ?? '—'}</span> },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (h) => <StatusBadge status={h.status} /> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Holidays"
        description="Public and organisation holidays are skipped when counting working days, leave and payroll. Optional holidays are not."
        actions={
          <>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" aria-label="Year">
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            {manage && (
              <Button onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus /> Add holiday
              </Button>
            )}
          </>
        }
      />
      <Alert tone="blue">Nepal’s holiday dates move with the lunar calendar every year. Check them against the official government notice before the year starts.</Alert>
      <Card>
        <DataTable
          caption={`Holidays in ${year}`}
          columns={columns}
          rows={data}
          rowKey={(h) => h.id}
          loading={isLoading}
          rowActions={
            manage
              ? (h) => (
                  <span className="flex justify-end gap-0.5">
                    <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(h); setOpen(true); }} aria-label={`Edit ${h.name}`}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(h)} aria-label={`Delete ${h.name}`}>
                      <Trash2 />
                    </Button>
                  </span>
                )
              : undefined
          }
          empty={<EmptyState icon={<CalendarDays />} title={`No holidays for ${year}`} description="Add Dashain, Tihar and other public holidays so attendance and leave count correctly." />}
        />
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit holiday' : 'Add holiday'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => (form.name.trim().length < 2 ? setErr('Enter a name') : save.mutate())}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required error={err ?? undefined}>
            {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vijaya Dashami" />}
          </Field>
          <FormGrid>
            <Field label="Date" required>{(p) => <Input {...p} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}</Field>
            <Field label="Type">
              {(p) => (
                <Select {...p} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="PUBLIC">Public holiday</option>
                  <option value="ORGANISATION">Organisation holiday</option>
                  <option value="OPTIONAL">Optional holiday</option>
                </Select>
              )}
            </Field>
          </FormGrid>
          <Field label="Notes">{(p) => <Input {...p} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
        </div>
      </Dialog>
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="Delete holiday?" description={`Remove ${deleting?.name}?`} confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}
