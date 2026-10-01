import { ArrowRight, BarChart3, CalendarCheck, Check, ChevronDown, FileSpreadsheet, Lock, MessageCircle, Plane, Users, Wallet } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CONTACT_PHONE, CONTACT_TEL } from '@/layouts/PublicLayout';

const TITLE = 'HR Management Software Nepal | Sprasa HR';
const DESCRIPTION = 'Manage employees, attendance, leave, payroll and HR reports with Sprasa HR, a practical HR management system built for Nepali organisations.';

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

const steps = [
  ['Tell us how you work', 'A short call about your staff size, departments, leave policy and how you pay salaries today.'],
  ['We set it up with you', 'Departments, shifts, leave types and salary structures are configured, and your employee list is imported from Excel.'],
  ['Run one month side by side', 'Process a month in Sprasa HR next to your current payroll and compare the numbers before you rely on it.'],
  ['Go live', 'Employees get their logins, managers start approving leave in the app, and payslips come out of the system.'],
];

const faqs = [
  ['Does it follow the Nepali fiscal year?', 'Yes. The fiscal year and its start date are settings, so a year that starts in Shrawan works fine. Payroll tax rules carry effective dates, so a change in the budget does not rewrite last year’s figures.'],
  ['Are the tax rates built in?', 'Tax slabs are configuration, not code. We include sample slabs for individuals and couples, and your accountant should confirm them before your first official payroll. When rates change, you add new slabs with a start date.'],
  ['Can we use SSF, PF and CIT?', 'Yes. Each is a salary component with its own rate, and contributions reduce taxable income up to the cap you configure.'],
  ['Can employees see their own payslips and leave?', 'Yes. Every employee can sign in to see their attendance, apply for leave, check balances and download payslips. They cannot see anyone else’s records.'],
  ['We only have 15 staff. Is this overkill?', 'No. Small offices use it too. You can start with employee records, attendance and leave, and turn on payroll when you are ready.'],
  ['Is it available in Nepali?', 'The interface is in English today. The main navigation already has a Nepali translation, and full Nepali plus Bikram Sambat dates are on the roadmap.'],
  ['Where is our data kept?', 'We can host it for you or install it on your own server. Uploaded documents are never public links: every download checks who is asking.'],
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
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return (
    <>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://sprasatechnicalsolution.com.np/sprasa-hr" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqLd)}</script>
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

      {/* Inclusions */}
      <section id="features" className="scroll-mt-20 border-b border-border bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">What you get</h2>
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

      {/* Modules */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl divide-y divide-border px-4 sm:px-6">
          {modules.map((m) => (
            <article key={m.id} id={m.id} className="grid scroll-mt-20 gap-6 py-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
              <div>
                <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                  <m.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3 text-xl font-semibold text-fg">{m.title}</h3>
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

      {/* Security */}
      <section id="security" className="border-b border-border bg-bg">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div>
            <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
              <Lock className="size-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-fg">Salary data is sensitive. We treat it that way.</h2>
            <p className="mt-3 text-muted">An accountant needs salaries but not leave approvals. A manager needs their team’s leave but not anyone’s bank account. Sprasa HR checks this on the server for every request, not just by hiding buttons.</p>
          </div>
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['Role-based access', 'Super admin, HR admin, HR officer, manager, accountant and employee roles, each editable.'],
              ['Audit log', 'Logins, salary changes, payroll approvals and leave decisions are recorded with who and when.'],
              ['Private documents', 'Citizenship copies and contracts are stored outside the public web folder.'],
              ['Account protection', 'Passwords are hashed, repeated wrong attempts lock the account, and sessions expire.'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-lg border border-border bg-surface p-4">
                <p className="font-medium text-fg">{t}</p>
                <p className="mt-1 text-subtle">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {steps.map(([t, d], i) => (
              <li key={t} className="border-t-2 border-primary pt-4">
                <span className="num text-sm font-semibold text-primary">0{i + 1}</span>
                <p className="mt-1 font-medium text-fg">{t}</p>
                <p className="mt-1.5 text-sm text-subtle">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-b border-border bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">Questions we get asked</h2>
          <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
            {faqs.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-fg">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
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
