import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { api } from '@/lib/api';
import { AuthShell } from './AuthShell';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { isLoading, isSuccess, error } = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => api.post('/auth/verify-email', { token }),
    enabled: Boolean(token),
    retry: false,
  });

  return (
    <AuthShell title="Confirm your email">
      {!token && <Alert tone="red">This link is incomplete.</Alert>}
      {isLoading && <p className="text-sm text-subtle">Checking your link…</p>}
      {isSuccess && <Alert tone="green">Thanks, your email address is confirmed.</Alert>}
      {error && <Alert tone="red">{(error as Error).message}</Alert>}
      <Button asChild variant="secondary" className="mt-6">
        <Link to="/app">Continue to Sprasa HR</Link>
      </Button>
    </AuthShell>
  );
}
