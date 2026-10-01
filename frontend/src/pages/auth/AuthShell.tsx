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
      <aside className="relative hidden overflow-hidden bg-brand-800 lg:block" aria-hidden>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
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
