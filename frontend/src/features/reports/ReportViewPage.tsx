import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileBarChart } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ErrorState, ExportMenu, FilterSelect, Money, PageHeader, Toolbar } from '@/components/common';
import { HBarChart } from '@/components/common/charts';
import { EmployeePicker } from '@/components/common/EmployeePicker';
import { Card, CardBody, EmptyState, Skeleton, Stat } from '@/components/ui/display';
import { Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { cn, formatDate, MONTH_NAMES, todayISO } from '@/lib/utils';
import { departmentOptions, useDepartments, useLeaveTypes } from '@/services/lookups';
import type { ReportMeta } from './ReportsPage';

interface ReportResult {
  report: { key: string; title: string; description: string };
  filters: { from: string; to: string; year: number; month: number };
  columns: { key: string; header: string; format?: 'money' | 'date' | 'number' | 'text' }[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  summary?: { label: string; value: string | number }[];
  chart?: { label: string; value: number }[];
}

function cell(v: unknown, format?: string) {
  if (v === null || v === undefined || v === '') return <span className="text-subtle">—</span>;
  if (format === 'money') return <Money value={Number(v)} />;
  if (format === 'date') return <span className="num">{formatDate(String(v))}</span>;
  if (format === 'number') return <span className="num">{String(v)}</span>;
  return String(v);
}

export default function ReportViewPage() {
  const { category, key } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: catalogue } = useQuery({ queryKey: ['reports'], queryFn: () => api.get<ReportMeta[]>('/reports') });
  const meta = catalogue?.find((r) => r.category === category && r.key === key);
  const { data: departments } = useDepartments();
  const { data: leaveTypes } = useLeaveTypes();
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;

  const f = {
    from: params.get('from') ?? monthStart,
    to: params.get('to') ?? today,
    date: params.get('date') ?? today,
    year: params.get('year') ?? today.slice(0, 4),
    month: params.get('month') ?? String(Number(today.slice(5, 7))),
    departmentId: params.get('departmentId') ?? '',
    employeeId: params.get('employeeId') ?? '',
    leaveTypeId: params.get('leaveTypeId') ?? '',
  };
  const set = (patch: Partial<typeof f>) => {
    const n = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    setParams(n, { replace: true });
  };
  const has = (x: ReportMeta['filters'][number]) => meta?.filters.includes(x);
  const query = meta
    ? {
        ...(has('dateRange') ? { from: f.from, to: f.to } : {}),
        ...(has('date') ? { date: f.date } : {}),
        ...(has('period') ? { year: f.year, month: f.month } : {}),
        ...(has('year') ? { year: f.year } : {}),
        ...(has('department') ? { departmentId: f.departmentId } : {}),
        ...(has('employee') ? { employeeId: f.employeeId } : {}),
        ...(has('leaveType') ? { leaveTypeId: f.leaveTypeId } : {}),
      }
    : {};
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['report', category, key, query],
    queryFn: () => api.get<ReportResult>(`/reports/${category}/${key}`, query),
    enabled: Boolean(meta),
    placeholderData: keepPreviousData,
  });
  const moneyChart = data?.columns.some((c) => c.format === 'money');

  return (
    <div className="space-y-4">
      <PageHeader title={meta?.title ?? 'Report'} description={meta?.description} breadcrumb={<Link to="/app/reports" className="hover:text-fg">Reports</Link>} actions={meta && <ExportMenu path={`/reports/${category}/${key}`} query={query} />} />
      {meta && (
        <Card>
          <Toolbar className="border-b-0">
            {has('dateRange') && (
              <>
                <Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} className="w-auto" aria-label="From" />
                <span className="hidden text-subtle sm:inline">to</span>
                <Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} className="w-auto" aria-label="To" />
              </>
            )}
            {has('date') && <Input type="date" value={f.date} max={today} onChange={(e) => set({ date: e.target.value })} className="w-auto" aria-label="Date" />}
            {(has('period') || has('year')) && (
              <Select value={f.year} onChange={(e) => set({ year: e.target.value })} className="w-28" aria-label="Year">
                {[0, 1, 2].map((i) => {
                  const y = String(Number(today.slice(0, 4)) - i);
                  return (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  );
                })}
              </Select>
            )}
            {has('period') && (
              <Select value={f.month} onChange={(e) => set({ month: e.target.value })} className="w-40" aria-label="Month">
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
            {has('department') && <FilterSelect label="Department" value={f.departmentId} onChange={(v) => set({ departmentId: v })} options={departmentOptions(departments)} />}
            {has('leaveType') && <FilterSelect label="Leave type" value={f.leaveTypeId} onChange={(v) => set({ leaveTypeId: v })} options={(leaveTypes ?? []).map((t) => ({ value: t.id, label: t.name }))} />}
            {has('employee') && <EmployeePicker value={f.employeeId || null} onChange={(v) => set({ employeeId: v ?? '' })} placeholder="All employees" className="w-full sm:w-64" />}
          </Toolbar>
        </Card>
      )}

      {error ? (
        <ErrorState error={error} />
      ) : isLoading || !data ? (
        <Skeleton className="h-80" />
      ) : (
        <div className={cn('space-y-4', isFetching && 'opacity-70')}>
          {data.summary && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {data.summary.map((s) => (
                <Stat key={s.label} label={s.label} value={s.value} />
              ))}
            </div>
          )}
          {data.chart && data.chart.some((c) => c.value > 0) && (
            <Card>
              <CardBody>
                <HBarChart data={data.chart} x="value" y="label" label={`${data.report.title} chart`} valueFormatter={moneyChart ? (v) => new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v) : undefined} />
              </CardBody>
            </Card>
          )}
          <Card>
            {!data.rows.length ? (
              <EmptyState icon={<FileBarChart />} title="No records for these filters" description="Try a wider date range or remove a filter." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{data.report.title}</caption>
                  <thead className="bg-surface-2/60">
                    <tr>
                      {data.columns.map((c) => (
                        <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle', c.format === 'money' || c.format === 'number' ? 'text-right' : 'text-left')}>
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-surface-2/50">
                        {data.columns.map((c) => (
                          <td key={c.key} className={cn('px-4 py-2 text-fg', c.format === 'money' || c.format === 'number' ? 'text-right' : '')}>
                            {cell(r[c.key], c.format)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {data.totals && (
                    <tfoot className="border-t-2 border-border bg-surface-2/60 font-semibold">
                      <tr>
                        {data.columns.map((c) => (
                          <td key={c.key} className={cn('px-4 py-2.5', c.format === 'money' || c.format === 'number' ? 'text-right' : '')}>
                            {data.totals![c.key] !== undefined ? cell(data.totals![c.key], c.format) : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Card>
          <p className="text-xs text-subtle">{data.rows.length} row(s)</p>
        </div>
      )}
    </div>
  );
}
