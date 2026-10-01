import { ArrowRight, BarChart3, CalendarCheck, Check, Plane, Users, Wallet } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const TITLE = 'Features | Sprasa HR';
const DESCRIPTION = 'Employee records, attendance, leave, payroll and HR reports — everything a Nepali HR team handles in a month, in one platform.';

const modules = [
  {
    id: 'employees',
    icon: Users,
    title: 'Employee records',
    body: 'Personal details, employment history, department and designation, salary structure and documents sit in one record, not spread across spreadsheets and cupboard files.',
    points: ['PAN, citizenship, SSF and bank details, visible only to people allowed to see them', 'Promotions, transfers and salary revisions kept as history', 'Import your current staff list from Excel'],
  },
  {
    id: 'attendance',
    icon: CalendarCheck,
    title: 'Attendance and shifts',
    body: 'Record attendance for one person, a whole department at once, or let employees check in from their phone. The shift decides who was late and who stayed back.',
    points: ['Saturdays and public holidays are skipped for you', 'Late, early-leave and overtime minutes worked out per shift', 'Night and flexible shifts supported'],
  },
  {
    id: 'leave',
    icon: Plane,
    title: 'Leave',
    body: 'Employees apply, their supervisor approves, and HR signs off where your policy asks for it. Balances change by leave type as soon as a request is approved.',
    points: ['Annual, sick, casual, maternity, paternity and unpaid leave out of the box', 'Carry-forward limits you set per leave type', 'Overlapping requests and over-balance requests are blocked'],
  },
  {
    id: 'payroll',
    icon: Wallet,
    title: 'Payroll',
    body: 'Monthly salary with allowances, deductions, SSF or PF and tax, producing a payslip for each employee and a payroll register for accounts.',
    points: ['Draft, review and approve before anything goes out', 'Approved months are locked so figures cannot drift', 'Unpaid leave and absences deducted from attendance'],
  },
  {
    id: 'reports',
    icon: BarChart3,
    title: 'Reports',
    body: 'Headcount by department, attendance summaries, leave balances and payroll cost, exportable for management and audit.',
    points: ['21 reports across people, attendance, leave and payroll', 'Excel, CSV and PDF export on every report', 'Filter by date range, department or employee'],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://sprasatechnicalsolution.com.np/sprasa-hr/features" />
      </Helmet>

      <section className="border-b border-border bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-sm font-medium text-primary">Features</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">What you get</h1>
          <p className="mt-2 max-w-2xl text-muted">Everything an HR team in a Nepali office handles in a month, from the joining letter to the payslip.</p>
          <ul className="mt-8 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              'Employee records with documents and employment history',
              'Departments, designations and reporting lines',
              'Attendance tracking with shift support',
              'Leave applications and approvals',
              'Automatic leave balances',
              'Monthly payroll with allowances and deductions',
              'Payslips employees can download themselves',
              'Management reporting',
              'An audit trail of who changed what',
            ].map((item) => (
              <li key={item} className="flex gap-2.5 text-fg">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl divide-y divide-border px-4 sm:px-6">
          {modules.map((m) => (
            <article key={m.id} id={m.id} className="grid scroll-mt-20 gap-6 py-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
              <div>
                <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                  <m.icon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-3 text-xl font-semibold text-fg">{m.title}</h2>
              </div>
              <div>
                <p className="text-muted">{m.body}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {m.points.map((p) => (
                    <li key={p} className="flex gap-2.5 text-fg">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl bg-brand-800 px-6 py-8 text-white sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold">See how it fits your organisation</h2>
              <p className="mt-1.5 max-w-xl text-brand-100">Tell us what you need and we will come back with a written recommendation and a realistic cost.</p>
            </div>
            <Button size="lg" className="bg-white text-brand-800 hover:bg-brand-50" asChild>
              <Link to="/consultancy">
                Request a consultation <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
