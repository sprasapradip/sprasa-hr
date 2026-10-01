import { ArrowRight, Lock } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const TITLE = 'Security | Sprasa HR';
const DESCRIPTION = 'Role-based access, audit logs and private document storage — how Sprasa HR protects salary and personal data.';

export default function SecurityPage() {
  return (
    <>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://sprasatechnicalsolution.com.np/sprasa-hr/security" />
      </Helmet>

      <section className="border-b border-border bg-bg">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div>
            <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
              <Lock className="size-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-medium text-primary">Security</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Salary data is sensitive. We treat it that way.</h1>
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

      <section>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl bg-brand-800 px-6 py-8 text-white sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold">Questions about how we protect your data?</h2>
              <p className="mt-1.5 max-w-xl text-brand-100">Tell us what you need and we will come back with a written recommendation and a realistic cost.</p>
            </div>
            <Button size="lg" className="bg-white text-brand-800 hover:bg-brand-50" asChild>
              <Link to="/contact">
                Ask a question <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
