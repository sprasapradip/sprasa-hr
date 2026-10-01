import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Network } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, PageHeader, SearchInput } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Avatar, Card, EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface OrgNode {
  id: string;
  name: string;
  employeeCode: string;
  designation: string | null;
  department: string | null;
  children: OrgNode[];
}

function count(n: OrgNode): number {
  return n.children.reduce((s, c) => s + 1 + count(c), 0);
}

function matches(n: OrgNode, q: string): boolean {
  const t = q.toLowerCase();
  return n.name.toLowerCase().includes(t) || n.employeeCode.toLowerCase().includes(t) || (n.designation ?? '').toLowerCase().includes(t) || n.children.some((c) => matches(c, q));
}

function Node({ node, depth, expanded, toggle, query }: { node: OrgNode; depth: number; expanded: Set<string>; toggle: (id: string) => void; query: string }) {
  if (query && !matches(node, query)) return null;
  const open = query ? true : expanded.has(node.id);
  const total = count(node);
  const hit = query && node.name.toLowerCase().includes(query.toLowerCase());
  return (
    <li>
      <div className={cn('flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-surface-2', hit && 'bg-amber-50 dark:bg-amber-950/30')} style={{ paddingLeft: depth * 20 + 4 }}>
        {node.children.length ? (
          <button type="button" onClick={() => toggle(node.id)} className="cursor-pointer rounded p-0.5 text-subtle hover:text-fg" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${node.name}`}>
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <Avatar name={node.name} size="sm" />
        <Link to={`/app/employees/${node.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg hover:text-primary">{node.name}</span>
          <span className="block truncate text-xs text-subtle">
            {node.designation ?? 'No designation'}
            {node.department && ` · ${node.department}`}
          </span>
        </Link>
        {total > 0 && <span className="num shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{total}</span>}
      </div>
      {open && node.children.length > 0 && (
        <ul className="border-l border-border" style={{ marginLeft: depth * 20 + 14 }}>
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={0} expanded={expanded} toggle={toggle} query={query} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrgChartPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['org-chart'], queryFn: () => api.get<OrgNode[]>('/employees/org-chart') });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const all = (nodes: OrgNode[]): string[] => nodes.flatMap((n) => [n.id, ...all(n.children)]);
  // Start with the top level open.
  useEffect(() => {
    if (data) setExpanded(new Set(data.map((n) => n.id)));
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Organisation chart"
        description="Reporting lines, based on each employee’s manager."
        actions={
          <>
            <Button variant="secondary" onClick={() => setExpanded(new Set(all(data ?? [])))}>
              Expand all
            </Button>
            <Button variant="secondary" onClick={() => setExpanded(new Set())}>
              Collapse
            </Button>
          </>
        }
      />
      <Card>
        <div className="border-b border-border p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Find a person or role…" />
        </div>
        <div className="p-3">
          {error ? (
            <ErrorState error={error} />
          ) : isLoading ? (
            <Skeleton className="h-64" />
          ) : !data?.length ? (
            <EmptyState icon={<Network />} title="No reporting lines yet" description="Set a manager on each employee to build the chart." />
          ) : (
            <ul>
              {data.map((n) => (
                <Node key={n.id} node={n} depth={0} expanded={expanded} toggle={toggle} query={query} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
