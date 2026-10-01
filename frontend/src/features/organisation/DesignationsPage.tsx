import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, type FieldValues, type UseFormSetError } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { FilterSelect, PageHeader, Toolbar } from '@/components/common';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { clean, useApiMutation } from '@/lib/mutation';
import { departmentOptions, useDepartments, useDesignations } from '@/services/lookups';
import type { Designation } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  departmentId: z.string().optional(),
  description: z.string().optional(),
  level: z.coerce.number().int().min(1).max(20),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
type Values = z.infer<typeof schema>;

export default function DesignationsPage() {
  const { can } = useAuth();
  const manage = can('departments.manage');
  const { data: departments } = useDepartments();
  const { data, isLoading } = useDesignations();
  const [dept, setDept] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [deleting, setDeleting] = useState<Designation | null>(null);

  const form = useForm<Values>({ resolver: zodResolver(schema) as never, defaultValues: { level: 5, status: 'ACTIVE' } });
  useEffect(() => {
    if (open) form.reset(editing ? { name: editing.name, departmentId: editing.departmentId ?? '', description: editing.description ?? '', level: editing.level, status: editing.status } : { name: '', departmentId: '', description: '', level: 5, status: 'ACTIVE' });
  }, [open, editing, form]);

  const save = useApiMutation((v: Values) => (editing ? api.put(`/designations/${editing.id}`, clean(v)) : api.post('/designations', clean(v))), {
    success: 'Designation saved',
    invalidate: [['designations']],
    setError: form.setError as unknown as UseFormSetError<FieldValues>,
    onSuccess: () => setOpen(false),
  });
  const remove = useApiMutation((id: string) => api.del(`/designations/${id}`), { success: 'Designation deleted', invalidate: [['designations']], onSuccess: () => setDeleting(null) });

  const rows = (data ?? []).filter((d) => !dept || d.departmentId === dept);
  const columns: Column<Designation>[] = [
    { key: 'name', header: 'Designation', mobile: 'title', cell: (d) => <span className="font-medium text-fg">{d.name}</span> },
    { key: 'department', header: 'Department', mobile: 'subtitle', cell: (d) => d.department?.name ?? 'Any' },
    { key: 'level', header: 'Level', align: 'right', cell: (d) => d.level },
    { key: 'employees', header: 'Employees', align: 'right', cell: (d) => <Link to={`/app/employees?designationId=${d.id}`} className="hover:underline">{d._count.employees}</Link> },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (d) => <StatusBadge status={d.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Designations" description="Job titles. Level 1 is the most senior and is used to order the organisation chart." actions={manage && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Add designation</Button>} />
      <Card>
        <Toolbar>
          <FilterSelect label="Department" value={dept} onChange={setDept} options={departmentOptions(departments)} />
        </Toolbar>
        <DataTable
          caption="Designations"
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          loading={isLoading}
          rowActions={
            manage
              ? (d) => (
                  <DropdownMenu>
                    <DropdownTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      <DropdownItem onSelect={() => { setEditing(d); setOpen(true); }}>
                        <Pencil /> Edit
                      </DropdownItem>
                      <DropdownItem danger onSelect={() => setDeleting(d)}>
                        <Trash2 /> Delete
                      </DropdownItem>
                    </DropdownContent>
                  </DropdownMenu>
                )
              : undefined
          }
          empty={<EmptyState icon={<BadgeCheck />} title="No designations" description="Add job titles like Accountant or Software Engineer." />}
        />
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit designation' : 'Add designation'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={form.handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(p) => <Input {...p} {...form.register('name')} placeholder="Senior Accountant" />}
          </Field>
          <FormGrid>
            <Field label="Department">
              {(p) => (
                <Select {...p} {...form.register('departmentId')}>
                  <option value="">Any department</option>
                  {departmentOptions(departments).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Level" hint="1 = most senior" error={form.formState.errors.level?.message}>
              {(p) => <Input {...p} {...form.register('level')} type="number" min={1} max={20} />}
            </Field>
          </FormGrid>
          <Field label="Description">{(p) => <Textarea {...p} {...form.register('description')} rows={2} />}</Field>
          <Field label="Status">
            {(p) => (
              <Select {...p} {...form.register('status')}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            )}
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete designation?"
        description={`Are you sure you want to delete ${deleting?.name}?`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
