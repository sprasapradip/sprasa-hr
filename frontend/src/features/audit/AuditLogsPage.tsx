import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { ExportMenu, FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { Badge, Card, EmptyState } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { Drawer } from '@/components/ui/overlay';
import { useListParams } from '@/hooks';
import { api } from '@/lib/api';
import { formatDateTime, titleCase } from '@/lib/utils';

interface AuditRow {
  id: string;
  action: string;
  module: string;
  recordId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-subtle">{label}</p>
      <pre className="max-h-72 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs text-fg">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function AuditLogsPage() {
  const list = useListParams({ module: '', action: '', from: '', to: '' });
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const { data: facets } = useQuery({ queryKey: ['audit-facets'], queryFn: () => api.get<{ modules: string[]; actions: string[] }>('/audit-logs/facets') });
  const q = { page: list.page, limit: list.limit, search: list.search, ...list.filters };
  const { data, isLoading } = useQuery({ queryKey: ['audit', q], queryFn: () => api.list<AuditRow>('/audit-logs', q), placeholderData: keepPreviousData });

  const columns: Column<AuditRow>[] = [
    { key: 'time', header: 'Time', mobile: 'subtitle', cell: (r) => <span className="num whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</span> },
    { key: 'user', header: 'User', cell: (r) => r.user?.name ?? <span className="text-subtle">System</span> },
    { key: 'action', header: 'Action', mobile: 'title', cell: (r) => <span className="font-medium text-fg">{titleCase(r.action)}</span> },
    { key: 'module', header: 'Module', mobile: 'badge', cell: (r) => <Badge>{r.module}</Badge> },
    { key: 'ip', header: 'IP address', optional: true, cell: (r) => <span className="num text-xs text-subtle">{r.ipAddress ?? '—'}</span> },
  ];

  return (
    <div>
      <PageHeader title="Audit logs" description="A read-only record of logins, changes and approvals. Entries cannot be edited or deleted." actions={<ExportMenu path="/audit-logs" query={q} />} />
      <Card>
        <Toolbar>
          <SearchInput value={list.search} onChange={(v) => list.update({ search: v })} placeholder="Action, user or IP…" />
          <FilterSelect label="Module" value={list.filters.module} onChange={(v) => list.update({ module: v })} options={(facets?.modules ?? []).map((m) => ({ value: m, label: m }))} />
          <FilterSelect label="Action" value={list.filters.action} onChange={(v) => list.update({ action: v })} options={(facets?.actions ?? []).map((a) => ({ value: a, label: titleCase(a) }))} />
          <Input type="date" value={list.filters.from} onChange={(e) => list.update({ from: e.target.value })} className="w-auto" aria-label="From" />
          <Input type="date" value={list.filters.to} onChange={(e) => list.update({ to: e.target.value })} className="w-auto" aria-label="To" />
        </Toolbar>
        <DataTable caption="Audit log" columns={columns} rows={data?.data} rowKey={(r) => r.id} loading={isLoading} onRowClick={setSelected} empty={<EmptyState icon={<ScrollText />} title="No matching entries" />} />
        {data && <Pagination {...data.pagination} onPage={(p) => list.update({ page: p }, false)} />}
      </Card>
      <Drawer open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)} title={selected ? titleCase(selected.action) : ''} description={selected ? `${selected.user?.name ?? 'System'} · ${formatDateTime(selected.createdAt)}` : undefined}>
        {selected && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-subtle">Module</dt>
                <dd className="text-fg">{selected.module}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Record</dt>
                <dd className="break-all font-mono text-xs text-fg">{selected.recordId ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">IP address</dt>
                <dd className="text-fg">{selected.ipAddress ?? '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-subtle">User agent</dt>
                <dd className="break-words text-xs text-muted">{selected.userAgent ?? '—'}</dd>
              </div>
            </dl>
            <JsonBlock label="Before" value={selected.oldValue} />
            <JsonBlock label="After" value={selected.newValue} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
