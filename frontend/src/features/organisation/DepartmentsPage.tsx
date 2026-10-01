import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, type FieldValues, type UseFormSetError } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Code, PageHeader } from '@/components/common';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EmployeePicker } from '@/components/common/EmployeePicker';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { clean, useApiMutation } from '@/lib/mutation';
import { useDepartments } from '@/services/lookups';
import type { Department } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,12}$/, '2–12 letters, numbers or dashes'),
  description: z.string().optional(),
  headId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
type Values = z.infer<typeof schema>;

function DepartmentDialog({ open, onOpenChange, dept }: { open: boolean; onOpenChange: (o: boolean) => void; dept: Department | null }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { status: 'ACTIVE', headId: null } });
  const { register, handleSubmit, reset, control, formState } = form;
  useEffect(() => {
    if (open) reset(dept ? { name: dept.name, code: dept.code, description: dept.description ?? '', headId: dept.headId, status: dept.status } : { name: '', code: '', description: '', headId: null, status: 'ACTIVE' });
  }, [open, dept, reset]);
  const save = useApiMutation((v: Values) => (dept ? api.put(`/departments/${dept.id}`, clean(v)) : api.post('/departments', clean(v))), {
    success: dept ? 'Department updated' : 'Department added',
    invalidate: [['departments']],
    setError: form.setError as unknown as UseFormSetError<FieldValues>,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={dept ? 'Edit department' : 'Add department'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <FormGrid>
          <Field label="Name" required error={formState.errors.name?.message}>
            {(p) => <Input {...p} {...register('name')} placeholder="Finance" />}
          </Field>
          <Field label="Code" required error={formState.errors.code?.message}>
            {(p) => <Input {...p} {...register('code')} placeholder="FIN" className="font-mono uppercase" />}
          </Field>
        </FormGrid>
        <Field label="Department head">
          {(p) => (
            <Controller
              control={control}
              name="headId"
              render={({ field }) => <EmployeePicker id={p.id} value={field.value} onChange={field.onChange} selectedLabel={dept?.head ? `${dept.head.firstName} ${dept.head.lastName}` : undefined} />}
            />
          )}
        </Field>
        <Field label="Description">{(p) => <Textarea {...p} {...register('description')} rows={2} />}</Field>
        <Field label="Status">
          {(p) => (
            <Select {...p} {...register('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

export default function DepartmentsPage() {
  const { can } = useAuth();
  const manage = can('departments.manage');
  const { data, isLoading } = useDepartments();
  const [editing, setEditing] = useState<Department | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const remove = useApiMutation((id: string) => api.del(`/departments/${id}`), { success: 'Department deleted', invalidate: [['departments']], onSuccess: () => setDeleting(null) });

  const columns: Column<Department>[] = [
    { key: 'name', header: 'Department', mobile: 'title', cell: (d) => <span className="font-medium text-fg">{d.name}</span> },
    { key: 'code', header: 'Code', mobile: 'subtitle', cell: (d) => <Code>{d.code}</Code> },
    { key: 'head', header: 'Head', cell: (d) => (d.head ? <Link to={`/app/employees/${d.head.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{`${d.head.firstName} ${d.head.lastName}`}</Link> : '—') },
    { key: 'employees', header: 'Employees', align: 'right', cell: (d) => <Link to={`/app/employees?departmentId=${d.id}`} className="hover:underline">{d._count.employees}</Link> },
    { key: 'designations', header: 'Designations', align: 'right', cell: (d) => d._count.designations },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (d) => <StatusBadge status={d.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Teams in your organisation and who heads them."
        actions={
          manage && (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus /> Add department
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          caption="Departments"
          columns={columns}
          rows={data}
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
          empty={<EmptyState icon={<Building2 />} title="No departments yet" description="Add departments such as Administration, Finance or IT." action={manage && <Button onClick={() => setOpen(true)}><Plus /> Add department</Button>} />}
        />
      </Card>
      <DepartmentDialog open={open} onOpenChange={setOpen} dept={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete department?"
        description={`Are you sure you want to delete ${deleting?.name}? Departments that still have employees cannot be deleted.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
