import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <ShieldX className="size-10 text-subtle" aria-hidden />
      <h1 className="mt-3 text-xl font-semibold text-fg">You don’t have access to this page</h1>
      <p className="mt-2 max-w-sm text-sm text-subtle">Your role doesn’t include this area. If you need it for your work, ask your HR administrator.</p>
      <Button asChild variant="secondary" className="mt-6">
        <Link to="/app">Back to dashboard</Link>
      </Button>
    </div>
  );
}
