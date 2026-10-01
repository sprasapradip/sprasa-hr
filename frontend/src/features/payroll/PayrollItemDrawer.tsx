import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Money } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Alert, DescriptionList, Skeleton } from '@/components/ui/display';
import { Drawer } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { formatAmount, minutesToHours, titleCase } from '@/lib/utils';
import type { PayrollItem } from '@/types';

/** Breakdown of one employee's payroll, including the tax calculation. */
export function PayrollItemDrawer({ payrollId, itemId, onClose }: { payrollId: string; itemId: string | null; onClose: () => void }) {
  const { data: i, isLoading } = useQuery({ queryKey: ['payroll-item', itemId], queryFn: () => api.get<PayrollItem>(`/payroll/${payrollId}/items/${itemId}`), enabled: Boolean(itemId) });
  const earnings = i?.components.filter((c) => c.type === 'EARNING') ?? [];
  const deductions = i?.components.filter((c) => c.type === 'DEDUCTION') ?? [];
  const notes = i?.calculationNotes;

  return (
    <Drawer
      open={Boolean(itemId)}
      onOpenChange={(o) => !o && onClose()}
      title={i ? i.employeeName : 'Payroll detail'}
      description={i ? `${i.employeeCode}${i.designationName ? ` · ${i.designationName}` : ''}${i.departmentName ? ` · ${i.departmentName}` : ''}` : undefined}
      footer={
        i?.payslip && (
          <Button asChild>
            <Link to={`/app/payslips/${i.payslip.id}`}>Open payslip</Link>
          </Button>
        )
      }
    >
      {isLoading || !i ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="space-y-6">
          <DescriptionList
            cols={3}
            items={[
              { label: 'Working days', value: i.workingDays },
              { label: 'Payable days', value: i.payableDays },
              { label: 'Present', value: i.presentDays },
              { label: 'Paid leave', value: i.paidLeaveDays },
              { label: 'Unpaid days', value: i.unpaidDays },
              { label: 'Overtime', value: minutesToHours(i.overtimeMinutes) },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['Earnings', earnings, i.grossSalary, 'Gross'],
              ['Deductions', deductions, i.totalDeductions, 'Total'],
            ].map(([title, rows, total, label]) => (
              <div key={title as string} className="rounded-lg border border-border">
                <p className="border-b border-border px-3 py-2 text-sm font-semibold text-fg">{title as string}</p>
                <ul className="divide-y divide-border text-sm">
                  {(rows as PayrollItem['components']).map((c) => (
                    <li key={c.id} className="flex justify-between gap-2 px-3 py-1.5">
                      <span className="text-muted">{c.name}</span>
                      <Money value={c.amount} />
                    </li>
                  ))}
                  <li className="flex justify-between gap-2 bg-surface-2/60 px-3 py-2 font-semibold">
                    <span>{label as string}</span>
                    <Money value={total as number} />
                  </li>
                </ul>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3 dark:bg-brand-900/40">
            <span className="text-sm font-medium text-brand-800 dark:text-brand-200">Net salary</span>
            <Money value={i.netSalary} currency="NPR" className="text-lg font-semibold text-fg" />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-fg">How tax was worked out</h3>
            <DescriptionList
              items={[
                { label: 'Taxable income this month', value: <Money value={i.taxableIncome} /> },
                { label: 'Annualised taxable income', value: <Money value={notes?.annualTaxableIncome} /> },
                { label: 'Annual tax', value: <Money value={notes?.annualTax} /> },
                { label: 'Tax category', value: titleCase(notes?.taxCategory ?? '') + (notes?.ssfContributor ? ' · SSF contributor' : '') },
              ]}
            />
            {notes?.taxBreakdown?.length ? (
              <table className="mt-3 w-full text-xs">
                <thead className="text-subtle">
                  <tr>
                    <th className="py-1 text-left font-medium">Slab</th>
                    <th className="py-1 text-right font-medium">Income in slab</th>
                    <th className="py-1 text-right font-medium">Rate</th>
                    <th className="py-1 text-right font-medium">Tax / year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {notes.taxBreakdown.map((b) => (
                    <tr key={b.ruleName}>
                      <td className="py-1.5 text-muted">{b.ruleName}</td>
                      <td className="num py-1.5 text-right">{formatAmount(b.taxableAmount)}</td>
                      <td className="num py-1.5 text-right">{b.rate}%</td>
                      <td className="num py-1.5 text-right">{b.waived ? 'Waived (SSF)' : formatAmount(b.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-subtle">No tax slabs applied.</p>
            )}
            {notes?.disclaimer && (
              <Alert tone="amber" className="mt-3">
                {notes.disclaimer}
              </Alert>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
