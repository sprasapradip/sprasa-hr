import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Code, FilterSelect, Money, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/display';
import { useListParams } from '@/hooks';
import { api, download } from '@/lib/api';
import { MONTH_NAMES, todayISO } from '@/lib/utils';
import { departmentOptions, useDepartments } from '@/services/lookups';

export interface PayslipRow {
  id: string;
  payslipNumber: string;
  period: string;
  year: number;
  month: number;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string | null;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
}

export const payslipColumns = (showEmployee: boolean): Column<PayslipRow>[] => [
  { key: 'period', header: 'Period', mobile: showEmployee ? 'subtitle' : 'title', cell: (p) => <span className="font-medium text-fg">{p.period}</span> },
  ...(showEmployee
    ? [
        { key: 'employee', header: 'Employee', mobile: 'title' as const, cell: (p: PayslipRow) => <span className="font-medium text-fg">{p.employeeName}</span> },
        { key: 'department', header: 'Department', optional: true, cell: (p: PayslipRow) => p.department ?? '—' },
      ]
    : []),
  { key: 'number', header: 'Payslip no.', optional: true, cell: (p) => <Code>{p.payslipNumber}</Code> },
  { key: 'gross', header: 'Gross', align: 'right', cell: (p) => <Money value={p.grossSalary} /> },
  { key: 'deductions', header: 'Deductions', align: 'right', cell: (p) => <Money value={p.totalDeductions} /> },
  { key: 'net', header: 'Net pay', align: 'right', mobile: 'badge', cell: (p) => <Money value={p.netSalary} className="font-semibold" /> },
];

export function PayslipDownload({ p }: { p: PayslipRow }) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={() => download(`/payslips/${p.id}/pdf`, undefined, `${p.payslipNumber}.pdf`).catch((e) => toast.error(e.message))} aria-label={`Download payslip ${p.period}`}>
      <Download />
    </Button>
  );
}

export default function PayslipsPage() {
  const navigate = useNavigate();
  const thisYear = Number(todayISO().slice(0, 4));
  const list = useListParams({ year: String(thisYear), month: '', departmentId: '' });
  const { data: departments } = useDepartments();
  const q = { page: list.page, limit: list.limit, search: list.search, ...list.filters };
  const { data, isLoading } = useQuery({ queryKey: ['payslips', q], queryFn: () => api.list<PayslipRow>('/payslips', q), placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader title="Payslips" description="Issued when a payroll month is approved." />
      <Card>
        <Toolbar>
          <SearchInput value={list.search} onChange={(v) => list.update({ search: v })} placeholder="Employee or payslip number…" />
          <FilterSelect label="Year" value={list.filters.year} onChange={(v) => list.update({ year: v })} options={[thisYear, thisYear - 1, thisYear - 2].map((y) => ({ value: String(y), label: String(y) }))} />
          <FilterSelect label="Month" value={list.filters.month} onChange={(v) => list.update({ month: v })} options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))} />
          <FilterSelect label="Department" value={list.filters.departmentId} onChange={(v) => list.update({ departmentId: v })} options={departmentOptions(departments)} />
        </Toolbar>
        <DataTable
          caption="Payslips"
          columns={payslipColumns(true)}
          rows={data?.data}
          rowKey={(p) => p.id}
          loading={isLoading}
          columnMenu
          onRowClick={(p) => navigate(`/app/payslips/${p.id}`)}
          rowActions={(p) => <PayslipDownload p={p} />}
          empty={<EmptyState icon={<Receipt />} title="No payslips found" description="Payslips appear once a payroll month is approved." />}
        />
        {data && <Pagination {...data.pagination} onPage={(p) => list.update({ page: p }, false)} />}
      </Card>
    </div>
  );
}
