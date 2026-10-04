import type { HTMLAttributes, ReactNode } from 'react';
import { cn, initials } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-card', className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[14.5px] font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-subtle">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

const tones = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900',
  teal: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/60 dark:text-brand-300 dark:ring-brand-800',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900',
  red: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-900',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900',
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'green',
  PROBATION: 'blue',
  ON_LEAVE: 'amber',
  SUSPENDED: 'red',
  RESIGNED: 'neutral',
  TERMINATED: 'red',
  RETIRED: 'neutral',
  INACTIVE: 'neutral',
  INVITED: 'blue',
  DISABLED: 'neutral',
  PRESENT: 'green',
  LATE: 'amber',
  ABSENT: 'red',
  HALF_DAY: 'amber',
  LEAVE: 'violet',
  HOLIDAY: 'blue',
  WEEKEND: 'neutral',
  WORK_FROM_HOME: 'teal',
  PENDING: 'amber',
  SUPERVISOR_APPROVED: 'blue',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
  PROCESSING: 'blue',
  REVIEWED: 'blue',
  PAID: 'teal',
  SUCCESS: 'green',
  FAILED: 'red',
  RUNNING: 'blue',
  EXPIRED: 'red',
  EXPIRING: 'amber',
  VALID: 'green',
};

const STATUS_LABELS: Record<string, string> = {
  SUPERVISOR_APPROVED: 'Awaiting HR',
  WORK_FROM_HOME: 'WFH',
  ON_LEAVE: 'On leave',
  HALF_DAY: 'Half day',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label = STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {label}
    </Badge>
  );
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Review state of a self check-in. Renders nothing for records that need no review. */
export function ApprovalBadge({ status, className }: { status: ApprovalStatus | null | undefined; className?: string }) {
  if (!status) return null;
  const meta = { PENDING: ['amber', 'Awaiting approval'], APPROVED: ['green', 'Approved'], REJECTED: ['red', 'Rejected'] } as const;
  const [tone, label] = meta[status];
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-sm', xl: 'size-20 text-xl' };
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200', sizes[size], className)}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <span aria-hidden>{initials(name)}</span>}
    </span>
  );
}

const STAT_ACCENT: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  green: 'bg-emerald-500',
  teal: 'bg-brand-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  blue: 'bg-sky-500',
  violet: 'bg-violet-500',
};

export function Stat({ label, value, hint, icon, tone = 'teal', loading }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone; loading?: boolean }) {
  return (
    <Card className="group relative overflow-hidden p-4 transition-shadow hover:shadow-card-hover sm:p-5">
      <span className={cn('absolute inset-x-0 top-0 h-0.5 opacity-70', STAT_ACCENT[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && <span className={cn('rounded-lg p-2 ring-1 ring-inset [&_svg]:size-4', tones[tone])}>{icon}</span>}
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="num mt-1 text-[1.75rem] font-semibold leading-tight tracking-tight text-fg">{value}</p>}
      {hint && <div className="mt-1.5 text-xs text-subtle">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 rounded-2xl bg-surface-2 p-3.5 text-subtle ring-1 ring-inset ring-border [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'amber', title, children, icon, className }: { tone?: Tone; title?: string; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div role="note" className={cn('flex gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', tones[tone], className)}>
      {icon}
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>
      </div>
    </div>
  );
}

export function DescriptionList({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-subtle">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-fg">{i.value === null || i.value === undefined || i.value === '' ? <span className="text-subtle">—</span> : i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
