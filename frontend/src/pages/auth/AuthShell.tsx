import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Helmet>
        <title>{`${title} · Sprasa HR`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Sprasa HR home">
          <img src="/favicon.svg" alt="" className="size-8" />
          <span className="font-semibold text-fg">Sprasa HR</span>
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-subtle">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-subtle">{footer}</div>}
        </div>
        <p className="text-xs text-subtle">© {new Date().getFullYear()} Sprasa Technical Solution</p>
      </div>
      <aside className="relative m-3 hidden overflow-hidden rounded-3xl bg-brand-800 lg:block" aria-hidden>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 60% at 85% 10%, rgb(45 212 191 / 0.28), transparent 70%)' }} />
        {/* Product glimpse */}
        <div className="absolute right-12 top-16 w-72 rotate-[-2deg] rounded-2xl border border-white/15 bg-white/10 p-4 text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-brand-100">
            <span>Attendance today</span>
            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 font-medium text-emerald-200">Live</span>
          </div>
          <p className="num mt-2 text-3xl font-semibold">92%</p>
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-white/15">
            <span className="h-full w-[78%] bg-emerald-300" />
            <span className="h-full w-[14%] bg-amber-300" />
          </div>
          <div className="mt-4 space-y-2 text-xs">
            {[
              ['Present', '36'],
              ['Late', '6'],
              ['On leave', '3'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between text-brand-100">
                <span>{l}</span>
                <span className="num font-medium text-white">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute right-40 top-72 w-60 rotate-[3deg] rounded-2xl border border-white/15 bg-white/10 p-4 text-white shadow-2xl backdrop-blur-md">
          <p className="text-xs text-brand-100">Payroll · Ashwin 2083</p>
          <p className="num mt-1.5 text-xl font-semibold">Approved</p>
          <p className="mt-1 text-xs text-brand-100">Payslips sent to 45 employees</p>
        </div>
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="max-w-md text-2xl font-semibold leading-snug">Attendance in the morning, leave approvals by lunch, payslips at month end.</p>
          <p className="mt-3 max-w-md text-brand-100">Simple HR management for Nepali organisations.</p>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/20 pt-6 text-sm">
            {[
              ['NPR', 'Currency'],
              ['Asia/Kathmandu', 'Timezone'],
              ['SSF · PF · CIT', 'Contributions'],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-brand-200">{l}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
