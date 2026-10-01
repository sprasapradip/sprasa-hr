import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common';
import { Card, EmptyState, Skeleton, StatusBadge } from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import type { PayrollRun } from '@/types';
import { RegisterTable } from './RegisterTable';

export default function PayrollRegisterPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: ['payroll', 'all-runs'], queryFn: () => api.list<PayrollRun>('/payroll', { limit: 60 }) });
  const runs = useMemo(() => data?.data.filter((r) => r.status !== 'CANCELLED') ?? [], [data]);
  const selected = params.get('run') ?? runs[0]?.id;
  useEffect(() => {
    if (!params.get('run') && runs[0]) setParams({ run: runs[0].id }, { replace: true });
  }, [runs, params, setParams]);
  const run = runs.find((r) => r.id === selected);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payroll register"
        description={run && <span className="flex items-center gap-2">{run.period} <StatusBadge status={run.status} /></span>}
        actions={
          runs.length > 0 && (
            <Select value={selected} onChange={(e) => setParams({ run: e.target.value })} aria-label="Payroll month" className="w-52">
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.period} · {r.status.toLowerCase()}
                </option>
              ))}
            </Select>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : !selected ? (
        <Card>
          <EmptyState icon={<FileSpreadsheet />} title="No payroll to show" description="Run payroll for a month first." action={<Link className="text-sm font-medium text-primary hover:underline" to="/app/payroll/runs">Go to Payroll</Link>} />
        </Card>
      ) : (
        <RegisterTable key={selected} payrollId={selected} />
      )}
    </div>
  );
}
