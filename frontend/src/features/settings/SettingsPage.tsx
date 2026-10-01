import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, DatabaseBackup, ImageUp, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, Skeleton, StatusBadge } from '@/components/ui/display';
import { Checkbox, Field, FormGrid, FormSection, Input, Select } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlay';
import { useObjectUrl } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { PROVINCES, WEEKDAYS } from '@/lib/nepal';
import { cn, formatDateTime, titleCase } from '@/lib/utils';
import { useShifts } from '@/services/lookups';

interface Settings {
  organisation: Record<string, unknown> & { id: string; name: string; hasLogo: boolean; workingDays: number[] };
  leave: { countWeekends: boolean; countHolidays: boolean; allowNegativeBalance: boolean; maxBackdateDays: number };
  payroll: { unpaidDayBasis: string; deductAbsentDays: boolean; treatMissingAttendanceAsAbsent: boolean; overtimeEnabled: boolean; overtimeRateMultiplier: number; retirementDeductionCap: number; retirementDeductionMaxPercent: number; roundNetSalary: boolean; payslipPrefix: string; paymentMethod: string };
  notifications: { emailEnabled: boolean; emailTypes: Record<string, boolean>; documentExpiryWarningDays: number };
  email: { senderName: string; replyTo: string; footerNote: string };
}

const ORG_FIELDS = ['name', 'legalName', 'registrationNumber', 'panNumber', 'address', 'province', 'district', 'municipality', 'phone', 'email', 'website', 'timezone', 'currency', 'fiscalYear', 'fiscalYearStart', 'dateFormat', 'defaultShiftId'] as const;

function SaveBar({ onSave, loading, disabled }: { onSave: () => void; loading: boolean; disabled?: boolean }) {
  const { can } = useAuth();
  if (!can('settings.manage')) return <p className="border-t border-border px-5 py-3 text-xs text-subtle">You can view these settings. Changing them needs the settings permission.</p>;
  return (
    <div className="flex justify-end border-t border-border px-5 py-3">
      <Button onClick={onSave} loading={loading} disabled={disabled}>
        Save changes
      </Button>
    </div>
  );
}

function OrganisationTab({ s }: { s: Settings }) {
  const { reload } = useAuth();
  const { data: shifts } = useShifts();
  const [f, setF] = useState<Record<string, string>>({});
  const [days, setDays] = useState<number[]>(s.organisation.workingDays);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const logo = useObjectUrl(s.organisation.hasLogo || logoVersion ? `/organisations/current/logo?v=${logoVersion}` : null);

  useEffect(() => {
    setF(Object.fromEntries(ORG_FIELDS.map((k) => [k, s.organisation[k] == null ? '' : String(s.organisation[k]).slice(0, k === 'fiscalYearStart' ? 10 : undefined)])));
    setDays(s.organisation.workingDays);
  }, [s]);

  const save = useApiMutation(() => api.put('/organisations/current', { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), name: f.name, workingDays: days }), {
    success: 'Organisation saved',
    invalidate: [['settings']],
    onSuccess: () => reload(),
  });
  const upload = useApiMutation(
    (file: File) => {
      const form = new FormData();
      form.append('logo', file);
      return api.upload('/organisations/current/logo', form);
    },
    { success: 'Logo updated', invalidate: [['settings']], onSuccess: () => setLogoVersion((v) => v + 1) },
  );
  const input = (k: (typeof ORG_FIELDS)[number], label: string, props: Record<string, unknown> = {}) => (
    <Field label={label} required={k === 'name'}>
      {(p) => <Input {...p} {...props} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </Field>
  );

  return (
    <Card>
      <CardBody className="space-y-8">
        <FormSection title="Profile">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">{logo ? <img src={logo} alt="Organisation logo" className="size-full object-contain" /> : <ImageUp className="size-6 text-subtle" />}</div>
            <div>
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
                Upload logo
              </Button>
              <p className="mt-1 text-xs text-subtle">PNG or JPG, up to 2 MB. Appears on payslips.</p>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
            </div>
          </div>
          <FormGrid cols={3}>
            {input('name', 'Name')}
            {input('legalName', 'Legal name')}
            {input('registrationNumber', 'Registration number')}
            {input('panNumber', 'PAN / VAT number', { inputMode: 'numeric', maxLength: 9 })}
            {input('phone', 'Phone')}
            {input('email', 'Email', { type: 'email' })}
            {input('website', 'Website', { placeholder: 'https://' })}
          </FormGrid>
        </FormSection>
        <FormSection title="Address">
          <FormGrid cols={3}>
            <Field label="Province">
              {(p) => (
                <Select {...p} value={f.province ?? ''} onChange={(e) => setF({ ...f, province: e.target.value })}>
                  <option value="">Select</option>
                  {PROVINCES.map((pr) => (
                    <option key={pr}>{pr}</option>
                  ))}
                </Select>
              )}
            </Field>
            {input('district', 'District')}
            {input('municipality', 'Municipality')}
            <div className="sm:col-span-2 lg:col-span-3">{input('address', 'Street / ward')}</div>
          </FormGrid>
        </FormSection>
        <FormSection title="Calendar and money" description="Nepal defaults: NPR, Asia/Kathmandu, fiscal year starting in Shrawan.">
          <FormGrid cols={3}>
            {input('fiscalYear', 'Fiscal year', { placeholder: '2083/84' })}
            {input('fiscalYearStart', 'Fiscal year starts', { type: 'date' })}
            {input('currency', 'Currency', { maxLength: 3 })}
            {input('timezone', 'Timezone')}
            <Field label="Date format">
              {(p) => (
                <Select {...p} value={f.dateFormat ?? ''} onChange={(e) => setF({ ...f, dateFormat: e.target.value })}>
                  {['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY'].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Default shift">
              {(p) => (
                <Select {...p} value={f.defaultShiftId ?? ''} onChange={(e) => setF({ ...f, defaultShiftId: e.target.value })}>
                  <option value="">None</option>
                  {shifts?.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </FormGrid>
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-medium text-fg">Working days</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays(on ? days.filter((x) => x !== d.value) : [...days, d.value])}
                    className={cn('cursor-pointer rounded-md border px-3 py-1.5 text-sm', on ? 'border-primary bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-200' : 'border-border text-subtle')}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>
        </FormSection>
      </CardBody>
      <SaveBar onSave={() => save.mutate()} loading={save.isPending} disabled={!f.name || !days.length} />
    </Card>
  );
}

/** Generic editor for one JSON settings group. */
function useGroup<T extends object>(initial: T, path: string) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const save = useApiMutation(() => api.put(`/settings/${path}`, v), { success: 'Settings saved', invalidate: [['settings']] });
  return { v, setV, save };
}

function LeaveTab({ s }: { s: Settings }) {
  const { v, setV, save } = useGroup(s.leave, 'leave');
  return (
    <Card>
      <CardBody className="space-y-4">
        <Checkbox label="Count weekends inside a leave request as leave days" checked={v.countWeekends} onChange={(e) => setV({ ...v, countWeekends: e.target.checked })} />
        <Checkbox label="Count public holidays inside a leave request as leave days" checked={v.countHolidays} onChange={(e) => setV({ ...v, countHolidays: e.target.checked })} />
        <Checkbox label="Allow approving leave beyond the available balance" checked={v.allowNegativeBalance} onChange={(e) => setV({ ...v, allowNegativeBalance: e.target.checked })} />
        <Field label="Employees can apply for past dates up to (days)" className="max-w-xs">
          {(p) => <Input {...p} type="number" min={0} max={365} value={v.maxBackdateDays} onChange={(e) => setV({ ...v, maxBackdateDays: Number(e.target.value) })} />}
        </Field>
        <p className="text-xs text-subtle">Leave balances follow the calendar year. Entitlements and carry-forward limits are set per leave type.</p>
      </CardBody>
      <SaveBar onSave={() => save.mutate()} loading={save.isPending} />
    </Card>
  );
}

function PayrollTab({ s }: { s: Settings }) {
  const { v, setV, save } = useGroup(s.payroll, 'payroll');
  return (
    <Card>
      <CardBody className="space-y-6">
        <Alert tone="amber">These rules change how salaries are calculated. Check them with your accountant, then recalculate any draft payroll.</Alert>
        <FormGrid cols={3}>
          <Field label="Daily rate for unpaid days" hint="Basic ÷ this many days">
            {(p) => (
              <Select {...p} value={v.unpaidDayBasis} onChange={(e) => setV({ ...v, unpaidDayBasis: e.target.value })}>
                <option value="WORKING_DAYS">Working days in the month</option>
                <option value="CALENDAR_DAYS">Calendar days in the month</option>
              </Select>
            )}
          </Field>
          <Field label="Overtime rate" hint="× the hourly rate of basic">{(p) => <Input {...p} type="number" step="0.25" min={0} value={v.overtimeRateMultiplier} onChange={(e) => setV({ ...v, overtimeRateMultiplier: Number(e.target.value) })} />}</Field>
          <Field label="Payslip number prefix">{(p) => <Input {...p} value={v.payslipPrefix} maxLength={10} onChange={(e) => setV({ ...v, payslipPrefix: e.target.value })} />}</Field>
          <Field label="Retirement deduction cap (NPR / year)" hint="PF, SSF and CIT deductible from taxable income">{(p) => <Input {...p} type="number" min={0} value={v.retirementDeductionCap} onChange={(e) => setV({ ...v, retirementDeductionCap: Number(e.target.value) })} />}</Field>
          <Field label="…or at most % of gross" hint="Whichever is lower">{(p) => <Input {...p} type="number" step="0.01" min={0} max={100} value={v.retirementDeductionMaxPercent} onChange={(e) => setV({ ...v, retirementDeductionMaxPercent: Number(e.target.value) })} />}</Field>
          <Field label="Payment method on payslips">{(p) => <Input {...p} value={v.paymentMethod} onChange={(e) => setV({ ...v, paymentMethod: e.target.value })} />}</Field>
        </FormGrid>
        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox label="Deduct days marked absent" checked={v.deductAbsentDays} onChange={(e) => setV({ ...v, deductAbsentDays: e.target.checked })} />
          <Checkbox label="Treat working days with no attendance as absent" checked={v.treatMissingAttendanceAsAbsent} disabled={!v.deductAbsentDays} onChange={(e) => setV({ ...v, treatMissingAttendanceAsAbsent: e.target.checked })} />
          <Checkbox label="Pay overtime" checked={v.overtimeEnabled} onChange={(e) => setV({ ...v, overtimeEnabled: e.target.checked })} />
          <Checkbox label="Round net salary to whole rupees" checked={v.roundNetSalary} onChange={(e) => setV({ ...v, roundNetSalary: e.target.checked })} />
        </div>
      </CardBody>
      <SaveBar onSave={() => save.mutate()} loading={save.isPending} />
    </Card>
  );
}

const EMAIL_TYPES = ['LEAVE_SUBMITTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'PAYROLL_PROCESSED', 'PAYSLIP_AVAILABLE', 'DOCUMENT_EXPIRY', 'SECURITY_ALERT'];

function NotificationsTab({ s }: { s: Settings }) {
  const n = useGroup(s.notifications, 'notifications');
  const e = useGroup(s.email, 'email');
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Email notifications" description="In-app notifications are always on." />
        <CardBody className="space-y-4">
          <Checkbox label="Send notifications by email" checked={n.v.emailEnabled} onChange={(ev) => n.setV({ ...n.v, emailEnabled: ev.target.checked })} />
          <div className="grid gap-2 sm:grid-cols-2">
            {EMAIL_TYPES.map((t) => (
              <Checkbox key={t} disabled={!n.v.emailEnabled} label={titleCase(t)} checked={n.v.emailTypes[t] !== false} onChange={(ev) => n.setV({ ...n.v, emailTypes: { ...n.v.emailTypes, [t]: ev.target.checked } })} />
            ))}
          </div>
          <Field label="Warn about expiring documents this many days ahead" className="max-w-xs">
            {(p) => <Input {...p} type="number" min={1} max={180} value={n.v.documentExpiryWarningDays} onChange={(ev) => n.setV({ ...n.v, documentExpiryWarningDays: Number(ev.target.value) })} />}
          </Field>
        </CardBody>
        <SaveBar onSave={() => n.save.mutate()} loading={n.save.isPending} />
      </Card>
      <Card>
        <CardHeader title="Email details" description="SMTP server credentials live in the server’s environment file, never in the database." />
        <CardBody>
          <FormGrid>
            <Field label="Sender name">{(p) => <Input {...p} value={e.v.senderName} onChange={(ev) => e.setV({ ...e.v, senderName: ev.target.value })} placeholder="Sprasa Demo HR" />}</Field>
            <Field label="Reply-to address">{(p) => <Input {...p} type="email" value={e.v.replyTo} onChange={(ev) => e.setV({ ...e.v, replyTo: ev.target.value })} />}</Field>
          </FormGrid>
        </CardBody>
        <SaveBar onSave={() => e.save.mutate()} loading={e.save.isPending} />
      </Card>
    </div>
  );
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      {ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-rose-600" />}
      <span className="font-medium text-fg">{label}</span>
      <span className="text-subtle">{detail}</span>
    </li>
  );
}

function SystemTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['system-status'], queryFn: () => api.get<{ smtp: { configured: boolean; ok: boolean; error?: string }; database: { ok: boolean } }>('/settings/system-status') });
  const { data: backups } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<{ schedule: string; retentionDays: number; jobsEnabled: boolean; lastSuccessAt: string | null; runs: { id: string; kind: string; status: string; filePath: string | null; fileSize: number | null; error: string | null; startedAt: string }[] }>('/settings/backups'),
    enabled: can('backups.manage'),
  });
  const run = useApiMutation(() => api.post('/settings/backups/run'), { success: (r) => r.message ?? 'Backup finished', onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }) });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Health" />
        <CardBody>
          {!status ? (
            <Skeleton className="h-16" />
          ) : (
            <ul className="divide-y divide-border">
              <StatusRow ok={status.database.ok} label="Database" detail={status.database.ok ? 'Connected' : 'Not reachable'} />
              <StatusRow ok={status.smtp.ok} label="Email (SMTP)" detail={!status.smtp.configured ? 'Not configured: emails are written to the server log' : status.smtp.ok ? 'Connected' : status.smtp.error ?? 'Failed'} />
            </ul>
          )}
        </CardBody>
      </Card>
      {can('backups.manage') && (
        <Card>
          <CardHeader
            title="Backups"
            description={backups ? `Schedule ${backups.schedule} (Nepal time) · kept for ${backups.retentionDays} days${backups.jobsEnabled ? '' : ' · scheduled jobs are off on this server'}` : undefined}
            actions={
              <Button size="sm" onClick={() => run.mutate()} loading={run.isPending}>
                <DatabaseBackup /> Back up now
              </Button>
            }
          />
          <CardBody>
            {backups?.runs.length ? (
              <ul className="divide-y divide-border text-sm">
                {backups.runs.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="num text-muted">{formatDateTime(b.startedAt)} · {b.kind}</span>
                    <span className="flex items-center gap-2">
                      {b.fileSize ? <span className="num text-xs text-subtle">{(b.fileSize / 1024 / 1024).toFixed(1)} MB</span> : null}
                      <StatusBadge status={b.status} />
                    </span>
                    {b.error && <p className="w-full text-xs text-rose-600">{b.error}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">No backups have run yet.</p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description={data?.organisation.name} />
      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <Tabs value={params.get('tab') ?? 'organisation'} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="organisation">Organisation</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="notifications">Notifications & email</TabsTrigger>
            <TabsTrigger value="system">System & backups</TabsTrigger>
          </TabsList>
          <TabsContent value="organisation"><OrganisationTab s={data} /></TabsContent>
          <TabsContent value="leave"><LeaveTab s={data} /></TabsContent>
          <TabsContent value="payroll"><PayrollTab s={data} /></TabsContent>
          <TabsContent value="notifications"><NotificationsTab s={data} /></TabsContent>
          <TabsContent value="system"><SystemTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
