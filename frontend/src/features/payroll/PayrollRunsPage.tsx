import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Calculator, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Money, PageHeader } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Alert, Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate, MONTH_NAMES, todayISO } from '@/lib/utils';
import type { PayrollRun } from '@/types';
import { AdjustmentsDialog } from './AdjustmentsDialog';

export default function PayrollRunsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const t = todayISO();
  const [year, setYear] = useState(Number(t.slice(0, 4)));
  const [month, setMonth] = useState(Number(t.slice(5, 7)));
  const [notes, setNotes] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['payroll', page], queryFn: () => api.list<PayrollRun>('/payroll', { page, limit: 12 }), placeholderData: keepPreviousData });

  const generate = useApiMutation(() => api.post<PayrollRun>('/payroll/generate', { year, month, notes: notes || undefined }), {
    success: (r) => `Payroll for ${r.data.period} generated`,
    invalidate: [['payroll'], ['dashboard']],
    onSuccess: (r) => navigate(`/app/payroll/runs/${r.data.id}`),
  });

  const columns: Column<PayrollRun>[] = [
    { key: 'period', header: 'Period', mobile: 'title', cell: (p) => <span className="font-medium text-fg">{p.period}</span> },
    { key: 'employees', header: 'Employees', align: 'right', cell: (p) => p.employeeCount },
    { key: 'gross', header: 'Gross', align: 'right', cell: (p) => <Money value={p.totalGross} /> },
    { key: 'tax', header: 'Tax', align: 'right', cell: (p) => <Money value={p.totalTax} /> },
    { key: 'net', header: 'Net pay', align: 'right', mobile: 'subtitle', cell: (p) => <Money value={p.totalNet} className="font-medium" /> },
    { key: 'created', header: 'Generated', optional: true, cell: (p) => <span className="num text-subtle">{formatDate(p.createdAt)}</span> },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Each month moves from draft to reviewed to approved. Approving locks the figures and issues payslips."
        actions={
          can('payroll.process') && (
            <>
              <Button variant="secondary" onClick={() => setAdjOpen(true)}>
                Monthly adjustments
              </Button>
              <Button onClick={() => setOpen(true)}>
                <Calculator /> Run payroll
              </Button>
            </>
          )
        }
      />
      <Card>
        <DataTable
          caption="Payroll runs"
          columns={columns}
          rows={data?.data}
          rowKey={(p) => p.id}
          loading={isLoading}
          onRowClick={(p) => navigate(`/app/payroll/runs/${p.id}`)}
          empty={<EmptyState icon={<Wallet />} title="No payroll yet" description="Run payroll for a month to calculate salaries from attendance, leave and salary structures." action={can('payroll.process') && <Button onClick={() => setOpen(true)}>Run payroll</Button>} />}
        />
        {data && <Pagination {...data.pagination} onPage={setPage} />}
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Run payroll"
        description="Salaries are calculated from each employee’s salary structure, attendance, approved leave and this month’s adjustments."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={generate.isPending} onClick={() => generate.mutate()}>
              Generate draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid>
            <Field label="Month">
              {(p) => (
                <Select {...p} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Year">{(p) => <Input {...p} type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />}</Field>
          </FormGrid>
          <Field label="Notes">{(p) => <Input {...p} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />}</Field>
          <Alert tone="amber">Record attendance, approve leave and add bonuses or loan instalments first. You can recalculate a draft if anything changes.</Alert>
        </div>
      </Dialog>
      {adjOpen && <AdjustmentsDialog open={adjOpen} onOpenChange={setAdjOpen} />}
    </div>
  );
}
