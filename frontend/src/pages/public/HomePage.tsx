import { ArrowRight, BarChart3, CalendarCheck, Check, FileSpreadsheet, Lock, MessageCircle, Plane, Users, Wallet } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CONTACT_PHONE, CONTACT_TEL } from '@/layouts/PublicLayout';

const TITLE = 'HR Management Software Nepal | Sprasa HR';
const DESCRIPTION = 'Manage employees, attendance, leave, payroll and HR reports with Sprasa HR, a practical HR management system built for Nepali organisations.';

const modules = [
  { icon: Users, title: 'Employee records', body: 'One record per employee: personal details, history, salary structure and documents.' },
  { icon: CalendarCheck, title: 'Attendance and shifts', body: 'Late, early-leave and overtime worked out per shift, holidays included.' },
  { icon: Plane, title: 'Leave', body: 'Employees apply, supervisors approve, balances update by leave type.' },
  { icon: Wallet, title: 'Payroll', body: 'Allowances, deductions, SSF or PF and tax, with payslips and a register.' },
  { icon: BarChart3, title: 'Reports', body: '21 reports across people, attendance, leave and payroll, all exportable.' },
];

/** A small, static preview of the dashboard, drawn in HTML so it stays sharp and themable. */
function ProductPreview() {
  const bars = [62, 48, 40, 34, 22, 18];
  const depts = ['Operations', 'IT', 'Admin', 'Finance', 'HR', 'Marketing'];
  return (
    <div className="relative rounded-xl border border-border bg-bg p-3 shadow-xl shadow-slate-900/5" aria-hidden>
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold text-fg">Dashboard</span>
          <span className="num rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">FY 2083/84</span>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          {[
            ['Present today', '34', 'text-emerald-600'],
            ['On leave', '3', 'text-violet-600'],
            ['Pending leave', '5', 'text-amber-600'],
          ].map(([l, v, c]) => (
            <div key={l} className="rounded-md border border-border p-2.5">
              <p className="text-[10px] text-subtle">{l}</p>
              <p className={`num mt-0.5 text-lg font-semibold ${c}`}>{v}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 px-3 pb-3 sm:grid-cols-5">
          <div className="rounded-md border border-border p-3 sm:col-span-3">
            <p className="text-[10px] font-medium text-subtle">Employees by department</p>
            <div className="mt-2 space-y-1.5">
              {bars.map((b, i) => (
                <div key={depts[i]} className="flex items-center gap-2">
                  <span className="w-16 truncate text-[10px] text-muted">{depts[i]}</span>
                  <span className="h-2 rounded-sm bg-brand-500/80" style={{ width: `${b}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border p-3 sm:col-span-2">
            <p className="text-[10px] font-medium text-subtle">Bhadra payroll</p>
            <p className="num mt-1 text-sm font-semibold text-fg">NPR 24,86,310.00</p>
            <p className="mt-0.5 text-[10px] text-emerald-600">Approved · 37 payslips</p>
            <div className="mt-3 space-y-1 text-[10px]">
              {[
                ['Gross', '27,40,500.00'],
                ['SSF / PF', '1,92,140.00'],
                ['Tax', '62,050.00'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-muted">
                  <span>{k}</span>
                  <span className="num">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Sprasa HR',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: DESCRIPTION,
    publisher: { '@type': 'Organization', name: 'Sprasa Technical Solution', url: 'https://sprasatechnicalsolution.com.np/', telephone: CONTACT_TEL },
    areaServed: 'NP',
  };

  return (
    <>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://sprasatechnicalsolution.com.np/sprasa-hr" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="text-sm font-medium text-primary">Sprasa HR</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl lg:text-[2.6rem]">HR management software built for Nepali organisations.</h1>
            <p className="mt-4 max-w-lg text-lg text-muted">Manage employees, attendance, leave, payroll and HR reports from one secure platform.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/consultancy">
                  Request a consultation <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link to="/contact">
                  <MessageCircle /> Ask a question
                </Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-subtle">
              Or call <a href={`tel:${CONTACT_TEL}`} className="num font-medium text-fg hover:underline">{CONTACT_PHONE}</a>
            </p>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* Features teaser */}
      <section className="border-b border-border bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-fg">What you get</h2>
              <p className="mt-2 max-w-2xl text-muted">Everything an HR team in a Nepali office handles in a month, from the joining letter to the payslip.</p>
            </div>
            <Link to="/features" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              See all features <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {modules.map((m) => (
              <li key={m.title} className="rounded-lg border border-border bg-surface p-4">
                <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                  <m.icon className="size-4" aria-hidden />
                </span>
                <p className="mt-3 font-medium text-fg">{m.title}</p>
                <p className="mt-1 text-sm text-subtle">{m.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Security teaser */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 sm:px-6 md:grid-cols-[2fr_1fr]">
          <div>
            <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
              <Lock className="size-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-fg">Salary data is sensitive. We treat it that way.</h2>
            <p className="mt-3 max-w-xl text-muted">Role-based access, an audit log and private document storage — enforced on the server, not just hidden in the UI.</p>
          </div>
          <Button variant="secondary" size="lg" asChild>
            <Link to="/security">
              How we secure it <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      {/* How it works / FAQ teaser */}
      <section className="border-b border-border bg-bg">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2">
          <Link to="/how-it-works" className="group rounded-xl border border-border bg-surface p-6 hover:border-primary">
            <h2 className="text-lg font-semibold text-fg">How it works</h2>
            <p className="mt-2 text-sm text-muted">From a first call to going live, in four steps, with a month run side by side before you rely on it.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              See the steps <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
          <Link to="/faq" className="group rounded-xl border border-border bg-surface p-6 hover:border-primary">
            <h2 className="text-lg font-semibold text-fg">Questions we get asked</h2>
            <p className="mt-2 text-sm text-muted">Fiscal year, tax slabs, SSF and PF, self-service and where your data is kept.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Read the FAQ <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </div>
      </section>

      {/* Inclusions */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">Included from day one</h2>
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

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl bg-brand-800 px-6 py-8 text-white sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold">Thinking about moving HR off spreadsheets?</h2>
              <p className="mt-1.5 max-w-xl text-brand-100">Tell us what you need and we will come back with a written recommendation and a realistic cost.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="bg-white text-brand-800 hover:bg-brand-50" asChild>
                <Link to="/consultancy">
                  <FileSpreadsheet /> Request a consultation
                </Link>
              </Button>
              <a href={`tel:${CONTACT_TEL}`} className="num inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-white ring-1 ring-white/40 hover:bg-white/10">
                {CONTACT_PHONE}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
