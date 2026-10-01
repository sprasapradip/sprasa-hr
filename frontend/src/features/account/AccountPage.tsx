import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useForm, type FieldValues, type UseFormSetError } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlay';
import { api, tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDateTime } from '@/lib/utils';
import { passwordRule } from '@/pages/auth/ResetPasswordPage';

const schema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordRule, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a different password' });

function Security() {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const change = useApiMutation((v: z.infer<typeof schema>) => api.post<{ accessToken: string }>('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }), {
    success: 'Password changed. Other devices have been signed out.',
    setError: form.setError as unknown as UseFormSetError<FieldValues>,
    onSuccess: (r) => {
      tokenStore.set(r.data.accessToken);
      form.reset({ currentPassword: '', newPassword: '', confirm: '' });
    },
  });
  const { data: history } = useQuery({ queryKey: ['login-history'], queryFn: () => api.list<{ id: string; success: boolean; reason: string | null; ipAddress: string | null; userAgent: string | null; createdAt: string }>('/auth/login-history', { limit: 10 }) });
  const e = form.formState.errors;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Change password" />
        <form onSubmit={form.handleSubmit((v) => change.mutate(v))}>
          <CardBody className="space-y-4">
            <Field label="Current password" error={e.currentPassword?.message}>{(p) => <Input {...p} type="password" autoComplete="current-password" {...form.register('currentPassword')} />}</Field>
            <Field label="New password" error={e.newPassword?.message} hint="At least 8 characters, with a letter and a number">{(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register('newPassword')} />}</Field>
            <Field label="Confirm new password" error={e.confirm?.message}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register('confirm')} />}</Field>
          </CardBody>
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button type="submit" loading={change.isPending}>
              Update password
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Recent sign-ins" description="If you see one you don’t recognise, change your password." />
        <ul className="divide-y divide-border">
          {history?.data.map((h) => (
            <li key={h.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="num block text-fg">{formatDateTime(h.createdAt)}</span>
                <span className="block truncate text-xs text-subtle">
                  {h.ipAddress} · {h.userAgent?.slice(0, 60)}
                </span>
              </span>
              <Badge tone={h.success ? 'green' : 'red'}>{h.success ? 'Signed in' : 'Failed'}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const verify = useApiMutation(() => api.post('/auth/send-verification'), { success: 'Verification email sent' });
  if (!user) return null;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My account" />
      <Tabs value={params.get('tab') ?? 'profile'} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="profile">Account</TabsTrigger>
          <TabsTrigger value="security">Password & security</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <Card>
            <CardBody className="space-y-5">
              {!user.emailVerified && (
                <Alert tone="amber" icon={<MailCheck />} title="Confirm your email address">
                  So password resets and payslip notices reach you.{' '}
                  <button type="button" className="cursor-pointer font-medium underline" onClick={() => verify.mutate()}>
                    Send confirmation email
                  </button>
                </Alert>
              )}
              <DescriptionList
                items={[
                  { label: 'Name', value: user.name },
                  { label: 'Email', value: user.email },
                  { label: 'Username', value: user.username },
                  { label: 'Role', value: user.role.name },
                  { label: 'Organisation', value: user.organisation.name },
                  { label: 'Last sign-in', value: user.lastLoginAt && formatDateTime(user.lastLoginAt) },
                  { label: 'Employee record', value: user.employee ? <Link className="text-primary hover:underline" to="/app/me/profile">{`${user.employee.firstName} ${user.employee.lastName} (${user.employee.employeeCode})`}</Link> : 'Not linked' },
                ]}
              />
            </CardBody>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Security />
        </TabsContent>
      </Tabs>
    </div>
  );
}
