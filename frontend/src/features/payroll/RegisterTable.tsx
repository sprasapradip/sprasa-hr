import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Code, ExportMenu, FilterSelect, Money, SearchInput, Toolbar } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/display';
import { api } from '@/lib/api';
import { departmentOptions, useDepartments } from '@/services/lookups';
import type { PayrollItem, PayrollRun } from '@/types';
import { PayrollItemDrawer } from './PayrollItemDrawer';

interface Register {
  payroll: PayrollRun;
  data: PayrollItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  totals: Record<string, number>;
}

/** Payroll register: one row per employee with totals, filters, sorting and export. */
export function RegisterTable({ payrollId }: { payrollId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [sort, setSort] = useState<{ by: string; order: 'asc' | 'desc' }>({ by: 'employeeCode', order: 'asc' });
  const [itemId, setItemId] = useState<string | null>(null);
  const { data: departments } = useDepartments();
  const q = { page, limit: 50, search, departmentId, sortBy: sort.by, sortOrder: sort.order };
  const { data, isLoading } = useQuery({ queryKey: ['register', payrollId, q], queryFn: () => api.list<PayrollItem>(`/payroll/${payrollId}/register`, q) as unknown as Promise<Register>, placeholderData: keepPreviousData });

  const columns: Column<PayrollItem>[] = [
    { key: 'employeeCode', header: 'ID', sortable: true, mobile: 'subtitle', cell: (i) => <Code>{i.employeeCode}</Code> },
    { key: 'employeeName', header: 'Employee', sortable: true, mobile: 'title', cell: (i) => <span className="font-medium text-fg">{i.employeeName}</span> },
    { key: 'departmentName', header: 'Department', sortable: true, optional: true, cell: (i) => i.departmentName ?? '—' },
    { key: 'basic', header: 'Basic', align: 'right', cell: (i) => <Money value={i.basicSalary} /> },
    { key: 'allow', header: 'Allowances', align: 'right', optional: true, cell: (i) => <Money value={i.totalAllowances} /> },
    { key: 'grossSalary', header: 'Gross', align: 'right', sortable: true, cell: (i) => <Money value={i.grossSalary} /> },
    { key: 'tax', header: 'Tax', align: 'right', cell: (i) => <Money value={i.taxAmount} /> },
    { key: 'pf', header: 'PF/SSF', align: 'right', optional: true, cell: (i) => <Money value={i.pfSsf} /> },
    { key: 'other', header: 'Other ded.', align: 'right', optional: true, cell: (i) => <Money value={i.otherDeductions} /> },
    { key: 'netSalary', header: 'Net salary', align: 'right', sortable: true, mobile: 'badge', cell: (i) => <Money value={i.netSalary} className="font-semibold" /> },
  ];

  const t = data?.totals;
  return (
    <Card>
      <Toolbar>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, ID, department…" />
        <FilterSelect label="Department" value={departmentId} onChange={(v) => { setDepartmentId(v); setPage(1); }} options={departmentOptions(departments)} />
        <div className="sm:ml-auto">
          <ExportMenu path={`/payroll/${payrollId}/register`} query={{ search, departmentId }} label="Export register" />
        </div>
      </Toolbar>
      <DataTable
        caption="Payroll register"
        columns={columns}
        rows={data?.data}
        rowKey={(i) => i.id}
        loading={isLoading}
        columnMenu
        sortBy={sort.by}
        sortOrder={sort.order}
        onSort={(by, order) => setSort({ by, order })}
        onRowClick={(i) => setItemId(i.id)}
        footer={
          t && (
            <tr className="text-sm">
              <td className="px-4 py-2.5" colSpan={3}>
                Total ({data?.pagination.total} employees)
              </td>
              <td className="num px-4 py-2.5 text-right"><Money value={t.basicSalary} /></td>
              <td className="num px-4 py-2.5 text-right"><Money value={t.totalAllowances} /></td>
              <td className="num px-4 py-2.5 text-right"><Money value={t.grossSalary} /></td>
              <td className="num px-4 py-2.5 text-right"><Money value={t.taxAmount} /></td>
              <td className="num px-4 py-2.5 text-right"><Money value={t.retirementContribution} /></td>
              <td className="num px-4 py-2.5 text-right"><Money value={t.otherDeductions} /></td>
              <td className="num px-4 py-2.5 text-right"><Money value={t.netSalary} /></td>
            </tr>
          )
        }
      />
      {data && <Pagination {...data.pagination} onPage={setPage} />}
      <PayrollItemDrawer payrollId={payrollId} itemId={itemId} onClose={() => setItemId(null)} />
    </Card>
  );
}
