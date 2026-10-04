import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm, type FieldValues, type UseFormSetError } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ErrorState, PageHeader } from '@/components/common';
import { EmployeePicker } from '@/components/common/EmployeePicker';
import { Button } from '@/components/ui/button';
import { Card, CardBody, Skeleton } from '@/components/ui/display';
import { Checkbox, Field, FormGrid, FormSection, Input, Select, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { clean, useApiMutation } from '@/lib/mutation';
import { NEPAL_PHONE, PROVINCES } from '@/lib/nepal';
import { fullNameOf, titleCase, todayISO } from './helpers';
import { useDepartments, useDesignations, useShifts } from '@/services/lookups';
import type { Employee } from '@/types';

const opt = z.string().trim().optional().or(z.literal(''));
const phone = z.string().trim().refine((v) => !v || NEPAL_PHONE.test(v), 'Enter a valid Nepali phone number').optional();

const schema = z.object({
  employeeCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, '2–20 letters, numbers or dashes'),
  firstName: z.string().trim().min(1, 'Required'),
  middleName: opt,
  lastName: z.string().trim().min(1, 'Required'),
  gender: opt,
  maritalStatus: opt,
  dateOfBirth: opt,
  phone,
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  address: opt,
  province: opt,
  district: opt,
  municipality: opt,
  emergencyContactName: opt,
  emergencyContactPhone: phone,
  citizenshipNumber: opt,
  panNumber: z.string().trim().regex(/^\d{9}$/, 'PAN must be 9 digits').optional().or(z.literal('')),
  joinDate: z.string().min(1, 'Required'),
  exitDate: opt,
  employmentType: z.string(),
  status: z.string(),
  departmentId: opt,
  designationId: opt,
  managerId: z.string().nullable().optional(),
  supervisorId: z.string().nullable().optional(),
  branch: opt,
  workLocation: opt,
  deviceUserId: z.string().trim().regex(/^[\w-]{0,30}$/, 'Use the number shown on the machine').optional(),
  bankName: opt,
  bankAccountNumber: opt,
  ssfNumber: opt,
  pfNumber: opt,
  citNumber: opt,
  taxCategory: z.string(),
  notes: opt,
  shiftId: opt,
  basicSalary: z.string().refine((v) => !v || (Number(v) >= 0 && !Number.isNaN(Number(v))), 'Enter an amount').optional(),
  salaryStructureId: opt,
  createUserAccount: z.boolean().optional(),
  changeRemarks: opt,
});
type Values = z.infer<typeof schema>;

export default function EmployeeFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: departments } = useDepartments();
  const { data: designations } = useDesignations();
  const { data: shifts } = useShifts();
  const { data: structures } = useQuery({ queryKey: ['salary-structures'], queryFn: () => api.get<{ id: string; name: string; status: string }[]>('/salary-structures'), enabled: !editing && can('salary.manage') });
  const { data: nextCode } = useQuery({ queryKey: ['next-code'], queryFn: () => api.get<{ employeeCode: string }>('/employees/next-code'), enabled: !editing });
  const { data: employee, isLoading, error } = useQuery({ queryKey: ['employee', id], queryFn: () => api.get<Employee>(`/employees/${id}`), enabled: editing });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { employmentType: 'FULL_TIME', status: 'PROBATION', taxCategory: 'INDIVIDUAL', joinDate: todayISO(), createUserAccount: false, managerId: null, supervisorId: null },
  });
  const { register, handleSubmit, reset, watch, control, setValue, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (nextCode && !editing) setValue('employeeCode', nextCode.employeeCode);
  }, [nextCode, editing, setValue]);

  useEffect(() => {
    if (!employee) return;
    const v: Record<string, unknown> = {};
    for (const key of Object.keys(schema.shape)) {
      const raw = (employee as unknown as Record<string, unknown>)[key];
      v[key] = raw === null || raw === undefined ? (key === 'managerId' || key === 'supervisorId' ? null : '') : typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw) ? raw.slice(0, 10) : raw;
    }
    reset(v as Values);
  }, [employee, reset]);

  const departmentId = watch('departmentId');
  const status = watch('status');
  const filteredDesignations = (designations ?? []).filter((d) => d.status === 'ACTIVE' && (!departmentId || !d.departmentId || d.departmentId === departmentId));

  const save = useApiMutation(
    (values: Values) => {
      const payload: Record<string, unknown> = clean(values);
      for (const k of ['basicSalary', 'salaryStructureId', 'shiftId', 'createUserAccount', 'changeRemarks']) if (payload[k] === null) delete payload[k];
      if (payload.basicSalary !== undefined) payload.basicSalary = Number(payload.basicSalary);
      if (editing) {
        delete payload.shiftId;
        delete payload.basicSalary;
        delete payload.salaryStructureId;
        delete payload.createUserAccount;
        if (payload.changeRemarks === undefined || payload.changeRemarks === null) delete payload.changeRemarks;
        return api.put<Employee>(`/employees/${id}`, payload);
      }
      delete payload.exitDate;
      delete payload.changeRemarks;
      return api.post<Employee>('/employees', payload);
    },
    {
      success: editing ? 'Employee updated' : 'Employee added',
      invalidate: [['employees'], ['employee', id], ['dashboard'], ['employee-options']],
      setError: form.setError as unknown as UseFormSetError<FieldValues>,
      onSuccess: (res) => navigate(`/app/employees/${res.data.id}`),
    },
  );

  if (error) return <ErrorState error={error} />;
  if (editing && isLoading) return <Skeleton className="h-96" />;

  const title = editing ? `Edit ${employee ? fullNameOf(employee) : 'employee'}` : 'Add employee';

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={title} breadcrumb={<Link to="/app/employees" className="hover:text-fg">Employees</Link>} />
      <form
        onSubmit={handleSubmit((v) => {
          // On edit, send only changed fields so redacted values (shown blank) are never overwritten.
          if (!editing) return save.mutate(v);
          const dirty = Object.keys(formState.dirtyFields) as (keyof Values)[];
          save.mutate(Object.fromEntries(dirty.map((k) => [k, v[k]])) as Values);
        })}
        noValidate
      >
        <Card>
          <CardBody className="space-y-8">
            <FormSection title="Basic details">
              <FormGrid cols={3}>
                <Field label="Employee ID" required error={e.employeeCode?.message} hint="Unique within your organisation">
                  {(p) => <Input {...p} {...register('employeeCode')} className="font-mono uppercase" />}
                </Field>
                <div className="hidden sm:block lg:hidden" />
                <div className="hidden lg:block" />
                <Field label="First name" required error={e.firstName?.message}>
                  {(p) => <Input {...p} {...register('firstName')} autoComplete="off" />}
                </Field>
                <Field label="Middle name" error={e.middleName?.message}>
                  {(p) => <Input {...p} {...register('middleName')} autoComplete="off" />}
                </Field>
                <Field label="Last name" required error={e.lastName?.message}>
                  {(p) => <Input {...p} {...register('lastName')} autoComplete="off" />}
                </Field>
                <Field label="Gender">
                  {(p) => (
                    <Select {...p} {...register('gender')}>
                      <option value="">Not specified</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  )}
                </Field>
                <Field label="Date of birth" error={e.dateOfBirth?.message}>
                  {(p) => <Input {...p} {...register('dateOfBirth')} type="date" max={todayISO()} />}
                </Field>
                <Field label="Marital status">
                  {(p) => (
                    <Select {...p} {...register('maritalStatus')}>
                      <option value="">Not specified</option>
                      {['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'].map((s) => (
                        <option key={s} value={s}>
                          {titleCase(s)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FormGrid>
            </FormSection>

            <FormSection title="Contact">
              <FormGrid cols={3}>
                <Field label="Mobile" error={e.phone?.message}>
                  {(p) => <Input {...p} {...register('phone')} type="tel" placeholder="98XXXXXXXX" />}
                </Field>
                <Field label="Email" error={e.email?.message} hint="Also used for the login, if you create one">
                  {(p) => <Input {...p} {...register('email')} type="email" placeholder="name@company.com.np" />}
                </Field>
                <div className="hidden lg:block" />
                <Field label="Province">
                  {(p) => (
                    <Select {...p} {...register('province')}>
                      <option value="">Select province</option>
                      {PROVINCES.map((pr) => (
                        <option key={pr} value={pr}>
                          {pr}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="District">{(p) => <Input {...p} {...register('district')} placeholder="Kathmandu" />}</Field>
                <Field label="Municipality">{(p) => <Input {...p} {...register('municipality')} placeholder="Kathmandu Metropolitan City" />}</Field>
                <Field label="Address (tole, ward)" className="sm:col-span-2 lg:col-span-3">
                  {(p) => <Input {...p} {...register('address')} placeholder="Ward 10, New Baneshwor" />}
                </Field>
                <Field label="Emergency contact">{(p) => <Input {...p} {...register('emergencyContactName')} placeholder="Name and relationship" />}</Field>
                <Field label="Emergency contact phone" error={e.emergencyContactPhone?.message}>
                  {(p) => <Input {...p} {...register('emergencyContactPhone')} type="tel" />}
                </Field>
              </FormGrid>
            </FormSection>

            <FormSection title="Employment">
              <FormGrid cols={3}>
                <Field label="Join date" required error={e.joinDate?.message}>
                  {(p) => <Input {...p} {...register('joinDate')} type="date" />}
                </Field>
                <Field label="Employment type" required>
                  {(p) => (
                    <Select {...p} {...register('employmentType')}>
                      {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'].map((s) => (
                        <option key={s} value={s}>
                          {titleCase(s)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Status" required>
                  {(p) => (
                    <Select {...p} {...register('status')}>
                      {['PROBATION', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED'].map((s) => (
                        <option key={s} value={s}>
                          {titleCase(s)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {editing && ['RESIGNED', 'TERMINATED', 'RETIRED'].includes(status) && (
                  <Field label="Exit date" hint="Their login is disabled when they leave">
                    {(p) => <Input {...p} {...register('exitDate')} type="date" />}
                  </Field>
                )}
                <Field label="Department">
                  {(p) => (
                    <Select {...p} {...register('departmentId')}>
                      <option value="">No department</option>
                      {(departments ?? [])
                        .filter((d) => d.status === 'ACTIVE' || d.id === departmentId)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
                <Field label="Designation">
                  {(p) => (
                    <Select {...p} {...register('designationId')}>
                      <option value="">No designation</option>
                      {filteredDesignations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Reports to (manager)">
                  {(p) => (
                    <Controller
                      control={control}
                      name="managerId"
                      render={({ field }) => (
                        <EmployeePicker id={p.id} value={field.value} onChange={(v) => field.onChange(v)} excludeId={id} selectedLabel={employee?.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : undefined} />
                      )}
                    />
                  )}
                </Field>
                <Field label="Supervisor" hint="If different from the manager">
                  {(p) => (
                    <Controller
                      control={control}
                      name="supervisorId"
                      render={({ field }) => (
                        <EmployeePicker id={p.id} value={field.value} onChange={(v) => field.onChange(v)} excludeId={id} selectedLabel={employee?.supervisor ? `${employee.supervisor.firstName} ${employee.supervisor.lastName}` : undefined} />
                      )}
                    />
                  )}
                </Field>
                {!editing && (
                  <Field label="Shift" hint="Default shift if left blank">
                    {(p) => (
                      <Select {...p} {...register('shiftId')}>
                        <option value="">Organisation default</option>
                        {(shifts ?? [])
                          .filter((s) => s.status === 'ACTIVE')
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.startTime}–{s.endTime})
                            </option>
                          ))}
                      </Select>
                    )}
                  </Field>
                )}
                <Field label="Branch">{(p) => <Input {...p} {...register('branch')} placeholder="Head Office" />}</Field>
                <Field label="Work location">{(p) => <Input {...p} {...register('workLocation')} placeholder="Kathmandu office" />}</Field>
                <Field label="Thumb machine ID" hint="The user number this person was enrolled under on the attendance machine" error={e.deviceUserId?.message}>
                  {(p) => <Input {...p} {...register('deviceUserId')} inputMode="numeric" placeholder="e.g. 12" className="num" />}
                </Field>
              </FormGrid>
              {editing && (
                <Field label="Reason for change" className="mt-4" hint="Saved on the employment history when department, designation, manager or status changes">
                  {(p) => <Input {...p} {...register('changeRemarks')} placeholder="e.g. Promoted after annual review" />}
                </Field>
              )}
            </FormSection>

            <FormSection title="Identity, tax and bank" description="Visible only to people with permission to see sensitive details.">
              <FormGrid cols={3}>
                <Field label="Citizenship number">{(p) => <Input {...p} {...register('citizenshipNumber')} />}</Field>
                <Field label="PAN" error={e.panNumber?.message}>
                  {(p) => <Input {...p} {...register('panNumber')} inputMode="numeric" maxLength={9} className="font-mono" />}
                </Field>
                <Field label="Tax category" hint="Selects which tax slabs apply">
                  {(p) => (
                    <Select {...p} {...register('taxCategory')}>
                      <option value="INDIVIDUAL">Individual</option>
                      <option value="COUPLE">Couple</option>
                    </Select>
                  )}
                </Field>
                <Field label="SSF number">{(p) => <Input {...p} {...register('ssfNumber')} />}</Field>
                <Field label="PF number">{(p) => <Input {...p} {...register('pfNumber')} />}</Field>
                <Field label="CIT number">{(p) => <Input {...p} {...register('citNumber')} />}</Field>
                <Field label="Bank name">{(p) => <Input {...p} {...register('bankName')} placeholder="e.g. Nabil Bank" />}</Field>
                <Field label="Bank account number" className="sm:col-span-2">
                  {(p) => <Input {...p} {...register('bankAccountNumber')} className="font-mono" />}
                </Field>
              </FormGrid>
            </FormSection>

            {!editing && can('salary.manage') && (
              <FormSection title="Starting salary" description="Optional. You can also add it later from the employee’s Payroll tab.">
                <FormGrid cols={3}>
                  <Field label="Basic salary (NPR, monthly)" error={e.basicSalary?.message}>
                    {(p) => <Input {...p} {...register('basicSalary')} inputMode="decimal" placeholder="45000" className="num" />}
                  </Field>
                  <Field label="Salary structure" hint="Copies its allowances and deductions">
                    {(p) => (
                      <Select {...p} {...register('salaryStructureId')}>
                        <option value="">None</option>
                        {(structures ?? [])
                          .filter((s) => s.status === 'ACTIVE')
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </Select>
                    )}
                  </Field>
                </FormGrid>
              </FormSection>
            )}

            <FormSection title="Notes">
              <Field label="Internal notes">{(p) => <Textarea {...p} {...register('notes')} rows={3} />}</Field>
              {!editing && can('users.manage') && (
                <Checkbox className="mt-4" label="Create a self-service login and email the employee an invitation (needs an email address)" {...register('createUserAccount')} />
              )}
            </FormSection>
          </CardBody>
          <div className="sticky bottom-16 flex justify-end gap-2 rounded-b-lg border-t border-border bg-surface px-5 py-3 md:bottom-0">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add employee'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
