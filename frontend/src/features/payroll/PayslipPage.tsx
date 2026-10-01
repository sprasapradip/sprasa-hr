import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, Money, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, Skeleton, StatusBadge } from '@/components/ui/display';
import { useObjectUrl } from '@/hooks';
import { api, download } from '@/lib/api';
import { formatDate, formatAmount } from '@/lib/utils';

interface Payslip {
  id: string;
  payslipNumber: string;
  period: string;
  generatedAt: string;
  status: string;
  organisation: { name: string; legalName: string | null; address: string; phone: string | null; email: string | null; panNumber: string | null; hasLogo: boolean; currency: string };
  employee: { id: string; employeeCode: string; name: string; department: string | null; designation: string | null; panNumber: string | null; ssfNumber: string | null; joinDate: string };
  payment: { method: string; bankName: string | null; bankAccountNumber: string | null };
  attendance: { workingDays: number; payableDays: number; presentDays: number; paidLeaveDays: number; unpaidDays: number; overtimeHours: number };
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  netInWords: string;
  taxNote: string;
}

/** Printable payslip. The same data renders to PDF on the server. */
export default function PayslipPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: p, isLoading, error } = useQuery({ queryKey: ['payslip', id], queryFn: () => api.get<Payslip>(`/payslips/${id}`) });
  const logo = useObjectUrl(p?.organisation.hasLogo ? '/organisations/current/logo' : null);

  if (error) return <ErrorState error={error} />;
  if (isLoading || !p) return <Skeleton className="mx-auto h-[36rem] max-w-3xl" />;

  const rows = Math.max(p.earnings.length, p.deductions.length);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print">
        <PageHeader
          title={`Payslip · ${p.period}`}
          breadcrumb={
            <button type="button" onClick={() => navigate(-1)} className="cursor-pointer hover:text-fg">
              ← Back
            </button>
          }
          actions={
            <>
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer /> Print
              </Button>
              <Button onClick={() => download(`/payslips/${p.id}/pdf`, undefined, `${p.payslipNumber}.pdf`).catch((e) => toast.error(e.message))}>
                <Download /> Download PDF
              </Button>
            </>
          }
        />
      </div>
      <Card className="p-6 sm:p-8 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-start gap-3">
            {logo && <img src={logo} alt="" className="size-12 rounded object-contain" />}
            <div>
              <p className="text-lg font-semibold text-fg">{p.organisation.name}</p>
              {p.organisation.address && <p className="text-xs text-subtle">{p.organisation.address}</p>}
              <p className="text-xs text-subtle">{[p.organisation.phone, p.organisation.email, p.organisation.panNumber && `PAN ${p.organisation.panNumber}`].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tracking-wide text-primary">PAYSLIP</p>
            <p className="text-sm text-fg">{p.period}</p>
            <p className="num text-xs text-subtle">{p.payslipNumber}</p>
            <StatusBadge status={p.status} className="mt-1" />
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-border py-5 text-sm sm:grid-cols-3">
          {[
            ['Employee', p.employee.name],
            ['Employee ID', p.employee.employeeCode],
            ['Department', p.employee.department ?? '—'],
            ['Designation', p.employee.designation ?? '—'],
            ['PAN', p.employee.panNumber ?? '—'],
            ['Joined', formatDate(p.employee.joinDate)],
            ['Working days', p.attendance.workingDays],
            ['Payable days', p.attendance.payableDays],
            ['Unpaid days', p.attendance.unpaidDays],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs text-subtle">{k}</dt>
              <dd className="num font-medium text-fg">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="overflow-x-auto py-5">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-brand-700 text-left text-xs uppercase tracking-wide text-white">
                <th className="px-3 py-2">Earnings</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="border-l border-white/20 px-3 py-2">Deductions</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: rows }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-muted">{p.earnings[i]?.name}</td>
                  <td className="num px-3 py-1.5 text-right text-fg">{p.earnings[i] && formatAmount(p.earnings[i].amount)}</td>
                  <td className="border-l border-border px-3 py-1.5 text-muted">{p.deductions[i]?.name}</td>
                  <td className="num px-3 py-1.5 text-right text-fg">{p.deductions[i] && formatAmount(p.deductions[i].amount)}</td>
                </tr>
              ))}
              <tr className="bg-surface-2 font-semibold">
                <td className="px-3 py-2">Gross salary</td>
                <td className="num px-3 py-2 text-right">{formatAmount(p.grossSalary)}</td>
                <td className="border-l border-border px-3 py-2">Total deductions</td>
                <td className="num px-3 py-2 text-right">{formatAmount(p.totalDeductions)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-brand-50 px-5 py-4 dark:bg-brand-900/40">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">Net pay</p>
            <Money value={p.netSalary} currency={p.organisation.currency} className="text-2xl font-semibold text-fg" />
          </div>
          <p className="max-w-sm text-right text-xs text-muted">{p.netInWords}</p>
        </div>

        <footer className="mt-5 space-y-1 text-xs text-subtle">
          <p>
            Payment: {[p.payment.method, p.payment.bankName, p.payment.bankAccountNumber && `A/C ${p.payment.bankAccountNumber}`].filter(Boolean).join(' · ')}
          </p>
          <p>{p.taxNote}</p>
          <p>Generated on {formatDate(p.generatedAt, 'long')}. This is a computer-generated payslip and does not need a signature.</p>
        </footer>
      </Card>
    </div>
  );
}
