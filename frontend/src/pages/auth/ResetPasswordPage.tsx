import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from './AuthShell';

export const passwordRule = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

const schema = z
  .object({ password: passwordRule, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password: v.password });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  });

  return (
    <AuthShell title="Choose a new password" subtitle="At least 8 characters, with a letter and a number.">
      {!token ? (
        <Alert tone="red">This link is incomplete. Open the link from your email again, or request a new one.</Alert>
      ) : done ? (
        <div className="rounded-lg border border-border bg-surface p-5" role="status">
          <CheckCircle2 className="size-6 text-emerald-600" aria-hidden />
          <p className="mt-2 text-sm text-fg">Your password is set. You can sign in now.</p>
          <Button asChild className="mt-4">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && (
            <Alert tone="red">
              {error}{' '}
              <Link to="/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            </Alert>
          )}
          <Field label="New password" required error={formState.errors.password?.message}>
            {(p) => <Input {...p} {...register('password')} type="password" autoComplete="new-password" autoFocus />}
          </Field>
          <Field label="Confirm password" required error={formState.errors.confirm?.message}>
            {(p) => <Input {...p} {...register('confirm')} type="password" autoComplete="new-password" />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            Save password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
