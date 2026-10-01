import { Skeleton } from '@/components/ui/display';
import type { LeaveBalance } from '@/types';

export function LeaveBalanceCards({ balances, loading }: { balances?: LeaveBalance[]; loading?: boolean }) {
  if (loading) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  const shown = (balances ?? []).filter((b) => b.leaveType.limitToBalance || b.used > 0 || b.pending > 0);
  if (!shown.length) return <p className="text-sm text-subtle">No leave balances for this year yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {shown.map((b) => {
        const total = b.entitled + b.carriedForward + b.adjusted;
        const pct = total > 0 ? Math.min(100, ((b.used + b.pending) / total) * 100) : 0;
        return (
          <div key={b.id} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[13px] font-medium text-muted">{b.leaveType.name}</p>
            {b.leaveType.limitToBalance ? (
              <>
                <p className="mt-1">
                  <span className="num text-2xl font-semibold text-fg">{b.remaining}</span>
                  <span className="num text-sm text-subtle"> / {total} days left</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.leaveType.name} used`}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : (
              <p className="num mt-1 text-2xl font-semibold text-fg">{b.used}<span className="text-sm font-normal text-subtle"> days taken</span></p>
            )}
            <p className="num mt-2 text-xs text-subtle">
              Used {b.used}
              {b.pending > 0 && ` · Pending ${b.pending}`}
              {b.carriedForward > 0 && ` · Carried ${b.carriedForward}`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
