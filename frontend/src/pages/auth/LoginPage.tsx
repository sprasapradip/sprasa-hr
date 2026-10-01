import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthShell } from './AuthShell';

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username'),
  password: z.string().min(1, 'Enter your password'),
});

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async ({ identifier, password }) => {
    setError(null);
    try {
      await login(identifier, password);
      const next = params.get('next');
      // Only follow in-app redirects.
      navigate(next && next.startsWith('/app') ? next : '/app', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in. Check your connection.');
    }
  });

  return (
    <AuthShell title="Sign in" subtitle="Use the email or username your HR team gave you.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="Email or username" error={formState.errors.identifier?.message}>
          {(p) => <Input {...p} {...register('identifier')} autoComplete="username" autoFocus placeholder="name@company.com.np" />}
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          {(p) => (
            <div className="relative">
              <Input {...p} {...register('password')} type={show ? 'text' : 'password'} autoComplete="current-password" className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-subtle hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
