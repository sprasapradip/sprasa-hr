import { useQuery } from '@tanstack/react-query';
import { Briefcase, Camera, CalendarDays, Mail, Pencil, Phone, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Code, ErrorState } from '@/components/common';
import { AttendanceMonth } from '@/components/common/AttendanceMonth';
import { DocumentList, type DocumentRow } from '@/components/common/DocumentList';
import { LeaveBalanceCards } from '@/components/common/LeaveBalanceCards';
import { UploadDocumentDialog } from '@/components/common/UploadDocumentDialog';
import { Button } from '@/components/ui/button';
import { Avatar, Card, CardBody, CardHeader, DescriptionList, EmptyState, Skeleton, StatusBadge } from '@/components/ui/display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlay';
import { useObjectUrl } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate, formatDateTime, titleCase } from '@/lib/utils';
import type { Employee, LeaveBalance, LeaveRequest } from '@/types';
import { SalaryPanel } from './SalaryPanel';
import { ShiftPanel } from './ShiftPanel';

interface HistoryRow {
  id: string;
  eventType: string;
  effectiveDate: string;
  remarks: string | null;
  status: string | null;
  department: { name: string } | null;
  designation: { name: string } | null;
}

function SummaryCard({ e }: { e: Employee }) {
  const { can } = useAuth();
  const photo = useObjectUrl(e.hasPhoto ? `/employees/${e.id}/photo` : null);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useApiMutation(
    (file: File) => {
      const f = new FormData();
      f.append('photo', file);
      return api.upload(`/employees/${e.id}/photo`, f);
    },
    { success: 'Photo updated', invalidate: [['employee', e.id], ['employees']], onSuccess: () => window.location.reload() },
  );
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative w-fit">
          <Avatar name={e.fullName} src={photo} size="xl" />
          {can('employees.update') && (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 cursor-pointer rounded-full border border-border bg-surface p-1.5 shadow-sm hover:bg-surface-2" aria-label="Change photo">
                <Camera className="size-3.5 text-muted" />
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(ev) => ev.target.files?.[0] && upload.mutate(ev.target.files[0])} />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-fg">{e.fullName}</h1>
            <StatusBadge status={e.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {e.designation?.name ?? 'No designation'}
            {e.department && ` · ${e.department.name}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-subtle">
            <span className="flex items-center gap-1.5">
              <Briefcase className="size-4" aria-hidden /> <Code>{e.employeeCode}</Code>
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden /> Joined <span className="num">{formatDate(e.joinDate)}</span>
            </span>
            {e.email && (
              <a href={`mailto:${e.email}`} className="flex items-center gap-1.5 hover:text-fg">
                <Mail className="size-4" aria-hidden /> {e.email}
              </a>
            )}
            {e.phone && (
              <a href={`tel:${e.phone}`} className="flex items-center gap-1.5 hover:text-fg">
                <Phone className="size-4" aria-hidden /> <span className="num">{e.phone}</span>
              </a>
            )}
          </div>
        </div>
        {can('employees.update') && (
          <Button variant="secondary" asChild className="self-start">
            <Link to={`/app/employees/${e.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

function OverviewTab({ e }: { e: Employee }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="At a glance" />
        <CardBody>
          <DescriptionList
            items={[
              { label: 'Department', value: e.department?.name },
              { label: 'Designation', value: e.designation?.name },
              { label: 'Manager', value: e.manager && <Link className="text-primary hover:underline" to={`/app/employees/${e.manager.id}`}>{`${e.manager.firstName} ${e.manager.lastName}`}</Link> },
              { label: 'Employment type', value: titleCase(e.employmentType) },
              { label: 'Shift', value: e.currentShift && `${e.currentShift.name} (${e.currentShift.startTime}–${e.currentShift.endTime})` },
              { label: 'Work location', value: [e.branch, e.workLocation].filter(Boolean).join(' · ') },
              { label: 'Login', value: e.user ? `${e.user.email} · ${e.user.role.name}` : 'No login' },
              { label: 'Current basic salary', value: e.currentSalary ? <span className="num">NPR {e.currentSalary.basicSalary.toLocaleString('en-IN')}</span> : undefined },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={`Direct reports (${e.reports.length})`} />
        {e.reports.length ? (
          <ul className="divide-y divide-border">
            {e.reports.map((r) => (
              <li key={r.id}>
                <Link to={`/app/employees/${r.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                  <Avatar name={`${r.firstName} ${r.lastName}`} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">
                      {r.firstName} {r.lastName}
                    </span>
                    <span className="block truncate text-xs text-subtle">{r.designation?.name ?? r.employeeCode}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No direct reports" className="py-8" />
        )}
      </Card>
    </div>
  );
}

function PersonalTab({ e }: { e: Employee }) {
  const { can } = useAuth();
  const hidden = !can('employees.view_sensitive');
  return (
    <Card>
      <CardBody className="space-y-6">
        {hidden && <p className="text-xs text-subtle">Some details are hidden because your role can’t view sensitive information.</p>}
        <DescriptionList
          cols={3}
          items={[
            { label: 'Full name', value: e.fullName },
            { label: 'Gender', value: e.gender && titleCase(e.gender) },
            { label: 'Date of birth', value: e.dateOfBirth && formatDate(e.dateOfBirth) },
            { label: 'Marital status', value: e.maritalStatus && titleCase(e.maritalStatus) },
            { label: 'Mobile', value: e.phone },
            { label: 'Email', value: e.email },
            { label: 'Address', value: e.address },
            { label: 'Municipality', value: e.municipality },
            { label: 'District / Province', value: [e.district, e.province].filter(Boolean).join(', ') },
            { label: 'Emergency contact', value: e.emergencyContactName },
            { label: 'Emergency phone', value: e.emergencyContactPhone },
          ]}
        />
        <div className="border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-fg">Identity, tax and bank</h3>
          <DescriptionList
            cols={3}
            items={[
              { label: 'Citizenship number', value: e.citizenshipNumber },
              { label: 'PAN', value: e.panNumber && <Code>{e.panNumber}</Code> },
              { label: 'Tax category', value: titleCase(e.taxCategory) },
              { label: 'SSF number', value: e.ssfNumber },
              { label: 'PF number', value: e.pfNumber },
              { label: 'CIT number', value: e.citNumber },
              { label: 'Bank', value: e.bankName },
              { label: 'Account number', value: e.bankAccountNumber && <Code>{e.bankAccountNumber}</Code> },
            ]}
          />
        </div>
        {e.notes && (
          <div className="border-t border-border pt-5">
            <h3 className="mb-1 text-sm font-semibold text-fg">Notes</h3>
            <p className="whitespace-pre-line text-sm text-muted">{e.notes}</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function EmploymentTab({ e }: { e: Employee }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Employment" />
        <CardBody>
          <DescriptionList
            items={[
              { label: 'Employee ID', value: <Code>{e.employeeCode}</Code> },
              { label: 'Status', value: <StatusBadge status={e.status} /> },
              { label: 'Join date', value: formatDate(e.joinDate, 'long') },
              { label: 'Exit date', value: e.exitDate && formatDate(e.exitDate, 'long') },
              { label: 'Type', value: titleCase(e.employmentType) },
              { label: 'Department', value: e.department?.name },
              { label: 'Designation', value: e.designation?.name },
              { label: 'Manager', value: e.manager && `${e.manager.firstName} ${e.manager.lastName}` },
              { label: 'Supervisor', value: e.supervisor && `${e.supervisor.firstName} ${e.supervisor.lastName}` },
              { label: 'Branch', value: e.branch },
              { label: 'Work location', value: e.workLocation },
            ]}
          />
        </CardBody>
      </Card>
      <ShiftPanel employee={e} />
    </div>
  );
}

function LeaveTab({ e }: { e: Employee }) {
  const { data: balances, isLoading } = useQuery({ queryKey: ['leave-balances', e.id], queryFn: () => api.get<LeaveBalance[]>('/leave/balances', { employeeId: e.id }) });
  const { data: requests } = useQuery({ queryKey: ['leave-requests', 'employee', e.id], queryFn: () => api.list<LeaveRequest>('/leave/requests', { employeeId: e.id, limit: 20 }) });
  return (
    <div className="space-y-5">
      <LeaveBalanceCards balances={balances} loading={isLoading} />
      <Card>
        <CardHeader title="Recent requests" actions={<Button variant="ghost" size="sm" asChild><Link to={`/app/leave/requests?employeeId=${e.id}`}>All requests</Link></Button>} />
        {requests?.data.length ? (
          <ul className="divide-y divide-border">
            {requests.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  <span className="font-medium text-fg">{r.leaveType.name}</span>
                  <span className="num ml-2 text-subtle">
                    {formatDate(r.startDate)}
                    {r.endDate !== r.startDate && ` – ${formatDate(r.endDate)}`} · {r.totalDays} d
                  </span>
                </span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No leave requests" className="py-8" />
        )}
      </Card>
    </div>
  );
}

function DocumentsTab({ e }: { e: Employee }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['documents', 'employee', e.id], queryFn: () => api.list<DocumentRow>('/documents', { employeeId: e.id, limit: 100 }) });
  return (
    <Card>
      <CardHeader
        title="Documents"
        actions={
          can('documents.manage') && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Upload /> Upload
            </Button>
          )
        }
      />
      <DocumentList docs={data?.data} loading={isLoading} canDelete={can('documents.manage')} />
      {can('documents.manage') && <UploadDocumentDialog open={open} onOpenChange={setOpen} employeeId={e.id} />}
    </Card>
  );
}

function HistoryTab({ e }: { e: Employee }) {
  const { data, isLoading } = useQuery({ queryKey: ['employee-history', e.id], queryFn: () => api.get<HistoryRow[]>(`/employees/${e.id}/history`) });
  if (isLoading) return <Skeleton className="h-40" />;
  if (!data?.length) return <EmptyState title="No history yet" />;
  return (
    <Card className="p-5">
      <ol className="relative space-y-6 border-l border-border pl-6">
        {data.map((h) => (
          <li key={h.id} className="relative">
            <span className="absolute -left-[29px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-surface" aria-hidden />
            <p className="num text-xs text-subtle">{formatDate(h.effectiveDate, 'long')}</p>
            <p className="mt-0.5 text-sm font-medium text-fg">{titleCase(h.eventType)}</p>
            <p className="text-sm text-muted">{[h.designation?.name, h.department?.name].filter(Boolean).join(' · ')}</p>
            {h.remarks && <p className="mt-0.5 text-sm text-subtle">{h.remarks}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ActivityTab({ e }: { e: Employee }) {
  const { data, isLoading } = useQuery({ queryKey: ['employee-activity', e.id], queryFn: () => api.get<{ id: string; action: string; module: string; createdAt: string; user: { name: string } | null }[]>(`/employees/${e.id}/activity`) });
  if (isLoading) return <Skeleton className="h-40" />;
  if (!data?.length) return <EmptyState title="No recorded activity" />;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {data.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <span className="text-fg">
              {titleCase(a.action)}
              <span className="ml-2 text-subtle">by {a.user?.name ?? 'System'}</span>
            </span>
            <span className="num text-xs text-subtle">{formatDateTime(a.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const { data: e, isLoading, error, refetch } = useQuery({ queryKey: ['employee', id], queryFn: () => api.get<Employee>(`/employees/${id}`) });

  if (error) return <ErrorState error={error} retry={() => refetch()} />;
  if (isLoading || !e)
    return (
      <div className="space-y-4">
        <Skeleton className="h-36" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );

  const tabs = [
    ['overview', 'Overview'],
    ['personal', 'Personal information'],
    ['employment', 'Employment'],
    can('attendance.view') && ['attendance', 'Attendance'],
    can('leave.view') && ['leave', 'Leave'],
    can('salary.view') && ['payroll', 'Payroll'],
    can('documents.view') && ['documents', 'Documents'],
    ['history', 'Employment history'],
    ['activity', 'Activity'],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="space-y-5">
      <Helmet>
        <title>{`${e.fullName} · Sprasa HR`}</title>
      </Helmet>
      <Link to="/app/employees" className="text-xs text-subtle hover:text-fg">
        ← Employees
      </Link>
      <SummaryCard e={e} />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          {tabs.map(([v, l]) => (
            <TabsTrigger key={v} value={v}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab e={e} />
        </TabsContent>
        <TabsContent value="personal">
          <PersonalTab e={e} />
        </TabsContent>
        <TabsContent value="employment">
          <EmploymentTab e={e} />
        </TabsContent>
        <TabsContent value="attendance">
          <Card className="p-5">
            <AttendanceMonth path={`/attendance/employee/${e.id}/month`} />
          </Card>
        </TabsContent>
        <TabsContent value="leave">
          <LeaveTab e={e} />
        </TabsContent>
        <TabsContent value="payroll">
          <SalaryPanel employee={e} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab e={e} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab e={e} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab e={e} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

