import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from './AuthShell';

const schema = z.object({ email: z.string().trim().email('Enter a valid email') });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      const res = await api.post('/auth/forgot-password', v);
      setSent(res.message ?? 'Check your email.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  });

  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link to choose a new one." footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to sign in</Link>}>
      {sent ? (
        <div className="rounded-lg border border-border bg-surface p-5 text-sm" role="status">
          <MailCheck className="size-6 text-primary" aria-hidden />
          <p className="mt-2 text-fg">{sent}</p>
          <p className="mt-1 text-subtle">The link expires in one hour. Check your spam folder if it doesn’t arrive.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          <Field label="Email" error={formState.errors.email?.message}>
            {(p) => <Input {...p} {...register('email')} type="email" autoComplete="email" autoFocus />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
