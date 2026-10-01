import { useQuery } from '@tanstack/react-query';
import { Check, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Code, FilterSelect, PageHeader, Toolbar } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Alert, Card, EmptyState, Skeleton } from '@/components/ui/display';
import { Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { formatDate, todayISO } from '@/lib/utils';
import { departmentOptions, useDepartments } from '@/services/lookups';
import { statusLabel } from './AttendanceDialog';

interface RosterRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string | null;
  record: { checkIn: string | null; checkOut: string | null; status: string; remarks: string | null } | null;
}
interface Entry {
  checkIn: string;
  checkOut: string;
  status: string;
  remarks: string;
  touched: boolean;
}

const STATUS_CHOICES = ['', 'ABSENT', 'LEAVE', 'WORK_FROM_HOME', 'HALF_DAY', 'HOLIDAY'];

/** Mark attendance for a whole team on one day. Only rows you change are saved. */
export default function BulkAttendancePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const date = params.get('date') ?? todayISO();
  const [departmentId, setDepartmentId] = useState('');
  const { data: departments } = useDepartments();
  const { data: roster, isLoading } = useQuery({ queryKey: ['roster', date, departmentId], queryFn: () => api.get<RosterRow[]>('/attendance/roster', { date, departmentId }) });
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [defaults, setDefaults] = useState({ checkIn: '09:00', checkOut: '17:00' });

  useEffect(() => {
    if (!roster) return;
    setEntries(
      Object.fromEntries(
        roster.map((r) => [
          r.employeeId,
          {
            checkIn: r.record?.checkIn ?? '',
            checkOut: r.record?.checkOut ?? '',
            status: r.record && !['PRESENT', 'LATE'].includes(r.record.status) ? r.record.status : '',
            remarks: r.record?.remarks ?? '',
            touched: false,
          },
        ]),
      ),
    );
  }, [roster]);

  const update = (id: string, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...patch, touched: true } }));
  const changed = useMemo(() => Object.entries(entries).filter(([, e]) => e.touched), [entries]);
  const unmarked = roster?.filter((r) => !r.record && !entries[r.employeeId]?.touched) ?? [];

  const markUnmarkedPresent = () =>
    setEntries((e) => {
      const next = { ...e };
      for (const r of unmarked) next[r.employeeId] = { ...next[r.employeeId], checkIn: defaults.checkIn, checkOut: defaults.checkOut, status: '', touched: true };
      return next;
    });

  const save = useApiMutation(
    () =>
      api.post<{ saved: number }>('/attendance/bulk', {
        date,
        entries: changed.map(([employeeId, e]) => ({ employeeId, checkIn: e.checkIn || null, checkOut: e.checkOut || null, status: e.status || undefined, remarks: e.remarks || null })),
      }),
    { success: (r) => `Saved attendance for ${r.data.saved} employees`, invalidate: [['attendance'], ['attendance-summary'], ['roster'], ['dashboard']], onSuccess: () => navigate(`/app/attendance?date=${date}`) },
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Bulk attendance" description={`Mark the team for ${formatDate(date, 'long')}. Rows you don’t touch are left as they are.`} breadcrumb={<Link to="/app/attendance" className="hover:text-fg">Attendance</Link>} />
      <Card>
        <Toolbar>
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setParams({ date: e.target.value })} className="w-auto" aria-label="Date" />
          <FilterSelect label="Department" value={departmentId} onChange={setDepartmentId} options={departmentOptions(departments)} />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Input type="time" value={defaults.checkIn} onChange={(e) => setDefaults((d) => ({ ...d, checkIn: e.target.value }))} className="w-28" aria-label="Default check in" />
            <span className="text-subtle">–</span>
            <Input type="time" value={defaults.checkOut} onChange={(e) => setDefaults((d) => ({ ...d, checkOut: e.target.value }))} className="w-28" aria-label="Default check out" />
            <Button variant="secondary" onClick={markUnmarkedPresent} disabled={!unmarked.length}>
              <Check /> Mark {unmarked.length} unmarked present
            </Button>
          </div>
        </Toolbar>
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !roster?.length ? (
          <EmptyState title="No employees to mark" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2/60">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-subtle">
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-2 py-2.5">In</th>
                  <th className="px-2 py-2.5">Out</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roster.map((r) => {
                  const e = entries[r.employeeId];
                  if (!e) return null;
                  return (
                    <tr key={r.employeeId} className={e.touched ? 'bg-brand-50/50 dark:bg-brand-900/20' : ''}>
                      <td className="px-4 py-2">
                        <span className="block font-medium text-fg">{r.name}</span>
                        <span className="text-xs text-subtle">
                          <Code>{r.employeeCode}</Code>
                          {r.department && ` · ${r.department}`}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <Input type="time" value={e.checkIn} onChange={(ev) => update(r.employeeId, { checkIn: ev.target.value })} className="w-28" aria-label={`${r.name} check in`} />
                      </td>
                      <td className="px-2 py-2">
                        <Input type="time" value={e.checkOut} onChange={(ev) => update(r.employeeId, { checkOut: ev.target.value })} className="w-28" aria-label={`${r.name} check out`} />
                      </td>
                      <td className="px-2 py-2">
                        <Select value={e.status} onChange={(ev) => update(r.employeeId, { status: ev.target.value })} className="w-40" aria-label={`${r.name} status`}>
                          {STATUS_CHOICES.map((s) => (
                            <option key={s} value={s}>
                              {s ? statusLabel(s) : 'From times'}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Input value={e.remarks} onChange={(ev) => update(r.employeeId, { remarks: ev.target.value })} aria-label={`${r.name} remarks`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="sticky bottom-16 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 md:bottom-0">
          {changed.length ? <p className="text-sm text-muted">{changed.length} row(s) changed</p> : <Alert tone="neutral" className="py-1.5">Change a row or use “Mark unmarked present”.</Alert>}
          <Button disabled={!changed.length} loading={save.isPending} onClick={() => save.mutate()}>
            <Save /> Save attendance
          </Button>
        </div>
      </Card>
    </div>
  );
}
