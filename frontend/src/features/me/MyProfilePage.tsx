import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Alert, Avatar, Card, CardBody, CardHeader, DescriptionList, Skeleton } from '@/components/ui/display';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { useObjectUrl } from '@/hooks';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { NEPAL_PHONE, PROVINCES } from '@/lib/nepal';
import { formatDate, titleCase } from '@/lib/utils';
import type { Employee } from '@/types';

const EDITABLE = ['phone', 'address', 'province', 'district', 'municipality', 'maritalStatus', 'emergencyContactName', 'emergencyContactPhone'] as const;

export default function MyProfilePage() {
  const { data: e, isLoading } = useQuery({ queryKey: ['my-profile'], queryFn: () => api.get<Employee>('/me/profile') });
  const photo = useObjectUrl(e?.hasPhoto ? `/employees/${e.id}/photo` : null);
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (e) setF(Object.fromEntries(EDITABLE.map((k) => [k, (e[k] as string | null) ?? ''])));
  }, [e]);
  const save = useApiMutation(() => api.put('/me/profile', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null]))), { success: 'Profile updated', invalidate: [['my-profile']] });

  if (isLoading || !e) return <Skeleton className="h-96" />;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="My profile" />
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={e.fullName} src={photo} size="lg" />
        <div>
          <p className="text-lg font-semibold text-fg">{e.fullName}</p>
          <p className="text-sm text-subtle">
            {e.designation?.name} · {e.department?.name} · {e.employeeCode}
          </p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Employment" description="Managed by HR. Ask them if something needs correcting." />
        <CardBody>
          <DescriptionList
            cols={3}
            items={[
              { label: 'Joined', value: formatDate(e.joinDate, 'long') },
              { label: 'Type', value: titleCase(e.employmentType) },
              { label: 'Status', value: titleCase(e.status) },
              { label: 'Manager', value: e.manager && `${e.manager.firstName} ${e.manager.lastName}` },
              { label: 'Shift', value: e.currentShift && `${e.currentShift.name} (${e.currentShift.startTime}–${e.currentShift.endTime})` },
              { label: 'Email', value: e.email },
              { label: 'PAN', value: e.panNumber },
              { label: 'Bank', value: e.bankName && `${e.bankName} ····${e.bankAccountNumber?.slice(-4) ?? ''}` },
              { label: 'SSF number', value: e.ssfNumber },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Contact details" description="You can keep these up to date yourself." />
        <CardBody className="space-y-4">
          {err && <Alert tone="red">{err}</Alert>}
          <FormGrid cols={3}>
            <Field label="Mobile">{(p) => <Input {...p} type="tel" value={f.phone ?? ''} onChange={(ev) => setF({ ...f, phone: ev.target.value })} />}</Field>
            <Field label="Marital status">
              {(p) => (
                <Select {...p} value={f.maritalStatus ?? ''} onChange={(ev) => setF({ ...f, maritalStatus: ev.target.value })}>
                  <option value="">Not specified</option>
                  {['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'].map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Province">
              {(p) => (
                <Select {...p} value={f.province ?? ''} onChange={(ev) => setF({ ...f, province: ev.target.value })}>
                  <option value="">Select</option>
                  {PROVINCES.map((pr) => (
                    <option key={pr}>{pr}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="District">{(p) => <Input {...p} value={f.district ?? ''} onChange={(ev) => setF({ ...f, district: ev.target.value })} />}</Field>
            <Field label="Municipality">{(p) => <Input {...p} value={f.municipality ?? ''} onChange={(ev) => setF({ ...f, municipality: ev.target.value })} />}</Field>
            <Field label="Address">{(p) => <Input {...p} value={f.address ?? ''} onChange={(ev) => setF({ ...f, address: ev.target.value })} />}</Field>
            <Field label="Emergency contact">{(p) => <Input {...p} value={f.emergencyContactName ?? ''} onChange={(ev) => setF({ ...f, emergencyContactName: ev.target.value })} />}</Field>
            <Field label="Emergency phone">{(p) => <Input {...p} type="tel" value={f.emergencyContactPhone ?? ''} onChange={(ev) => setF({ ...f, emergencyContactPhone: ev.target.value })} />}</Field>
          </FormGrid>
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button
            loading={save.isPending}
            onClick={() => {
              if ((f.phone && !NEPAL_PHONE.test(f.phone)) || (f.emergencyContactPhone && !NEPAL_PHONE.test(f.emergencyContactPhone))) return setErr('Enter valid Nepali phone numbers');
              setErr(null);
              save.mutate();
            }}
          >
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}
