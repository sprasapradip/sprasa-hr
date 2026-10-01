import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarCheck, ChevronRight, Plane, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common';
import { Card, CardHeader, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';

export interface ReportMeta {
  key: string;
  category: 'employees' | 'attendance' | 'leave' | 'payroll';
  title: string;
  description: string;
  filters: ('dateRange' | 'date' | 'period' | 'year' | 'department' | 'employee' | 'leaveType')[];
}

const GROUPS = [
  { key: 'employees', title: 'Employee reports', icon: Users },
  { key: 'attendance', title: 'Attendance reports', icon: CalendarCheck },
  { key: 'leave', title: 'Leave reports', icon: Plane },
  { key: 'payroll', title: 'Payroll reports', icon: Wallet },
] as const;

export default function ReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['reports'], queryFn: () => api.get<ReportMeta[]>('/reports') });
  return (
    <div>
      <PageHeader title="Reports" description="Every report can be filtered and exported to Excel, CSV or PDF." />
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {GROUPS.map((g) => {
            const reports = data?.filter((r) => r.category === g.key) ?? [];
            if (!reports.length) return null;
            return (
              <Card key={g.key}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <g.icon className="size-4 text-primary" aria-hidden /> {g.title}
                    </span>
                  }
                />
                <ul className="divide-y divide-border">
                  {reports.map((r) => (
                    <li key={r.key}>
                      <Link to={`/app/reports/${r.category}/${r.key}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-fg">{r.title}</span>
                          <span className="block text-xs text-subtle">{r.description}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
      {!isLoading && !data?.length && (
        <Card className="p-10 text-center">
          <BarChart3 className="mx-auto size-6 text-subtle" />
          <p className="mt-2 text-sm text-subtle">Your role doesn’t include any reports.</p>
        </Card>
      )}
    </div>
  );
}
