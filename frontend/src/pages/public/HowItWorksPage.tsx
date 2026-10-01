import { ArrowRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const TITLE = 'How it works | Sprasa HR';
const DESCRIPTION = 'From a first call to going live: how an organisation moves its HR and payroll onto Sprasa HR.';

const steps = [
  ['Tell us how you work', 'A short call about your staff size, departments, leave policy and how you pay salaries today.'],
  ['We set it up with you', 'Departments, shifts, leave types and salary structures are configured, and your employee list is imported from Excel.'],
  ['Run one month side by side', 'Process a month in Sprasa HR next to your current payroll and compare the numbers before you rely on it.'],
  ['Go live', 'Employees get their logins, managers start approving leave in the app, and payslips come out of the system.'],
];

export default function HowItWorksPage() {
  return (
    <>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://sprasatechnicalsolution.com.np/sprasa-hr/how-it-works" />
      </Helmet>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-sm font-medium text-primary">How it works</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Getting from spreadsheets to Sprasa HR</h1>
          <p className="mt-2 max-w-2xl text-muted">No big-bang cutover. You see your own numbers in the system before you depend on it.</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
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

      <section>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl bg-brand-800 px-6 py-8 text-white sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold">Ready for the first call?</h2>
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
