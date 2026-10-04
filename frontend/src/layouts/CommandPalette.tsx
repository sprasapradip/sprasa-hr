import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, CornerDownLeft, FileText, Plus, Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useEmployeeOptions } from '@/services/lookups';
import { visibleNav } from './nav';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  to: string;
  keywords?: string;
}

/** Opens the palette on Ctrl/⌘ + K, or "/" when the user isn't typing in a field. */
export function useCommandPaletteShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}

/** Global search: pages the user can access, quick actions and employees. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const debounced = useDebounce(query.trim(), 200);
  const canSearchEmployees = can('employees.view');
  const { data: employees, isFetching } = useEmployeeOptions(debounced, open && canSearchEmployees && debounced.length >= 2);

  const staticCommands = useMemo<Command[]>(() => {
    const pages = visibleNav(can, Boolean(user?.employee)).flatMap((g) =>
      g.items.map((i) => {
        const Icon = i.icon ?? g.icon ?? FileText;
        return { id: `page:${i.to}`, group: 'Pages', label: t(i.labelKey), hint: g.labelKey ? t(g.labelKey) : undefined, icon: <Icon />, to: i.to };
      }),
    );
    const actions: Command[] = [];
    if (can('employees.create')) actions.push({ id: 'act:new-employee', group: 'Quick actions', label: 'Add employee', icon: <Plus />, to: '/app/employees/new', keywords: 'create new hire' });
    if (can('attendance.manage')) actions.push({ id: 'act:bulk-attendance', group: 'Quick actions', label: 'Mark attendance', icon: <Plus />, to: '/app/attendance/bulk', keywords: 'bulk entry' });
    if (user?.employee) actions.push({ id: 'act:apply-leave', group: 'Quick actions', label: 'Apply for leave', icon: <Plus />, to: '/app/me/leave?apply=1', keywords: 'request time off' });
    if (can('payroll.process')) actions.push({ id: 'act:payroll', group: 'Quick actions', label: 'Run payroll', icon: <Plus />, to: '/app/payroll/runs', keywords: 'generate salary month' });
    actions.push({ id: 'act:account', group: 'Quick actions', label: 'Change password', icon: <ArrowRight />, to: '/app/profile?tab=security', keywords: 'security account' });
    return [...actions, ...pages];
  }, [can, user, t]);

  const results = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? staticCommands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(q)) : staticCommands;
    const people: Command[] =
      canSearchEmployees && debounced.length >= 2
        ? (employees ?? []).slice(0, 8).map((e) => ({
            id: `emp:${e.id}`,
            group: 'Employees',
            label: e.name,
            hint: [e.employeeCode, e.designation ?? e.department].filter(Boolean).join(' · '),
            icon: <UserRound />,
            to: `/app/employees/${e.id}`,
          }))
        : [];
    return [...people, ...matched];
  }, [query, debounced, staticCommands, employees, canSearchEmployees]);

  useEffect(() => setActive(0), [query, results.length]);
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Command) => {
    onOpenChange(false);
    navigate(c.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      run(results[active]);
    }
  };

  let lastGroup = '';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-slate-950/45 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 animate-fade-in flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop focus:outline-none"
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search pages, actions and employees. Use arrow keys to move and Enter to open.</DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-subtle" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={canSearchEmployees ? 'Search employees, pages and actions…' : 'Search pages and actions…'}
              className="h-13 w-full bg-transparent text-[15px] text-fg placeholder:text-subtle focus:outline-none"
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
              aria-label="Search"
            />
            {isFetching && <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />}
            <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-subtle sm:block">Esc</kbd>
          </div>
          <ul id="command-results" ref={listRef} role="listbox" className="scroll-thin flex-1 overflow-y-auto p-2">
            {results.length === 0 && <li className="px-3 py-10 text-center text-sm text-subtle">{debounced.length >= 2 && isFetching ? 'Searching…' : `No results for “${query}”`}</li>}
            {results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <li key={c.id} role="presentation">
                  {header && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-subtle first:pt-1">{header}</p>}
                  <div
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(c)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm', i === active ? 'bg-brand-50 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100' : 'text-fg')}
                  >
                    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface [&_svg]:size-3.5', i === active ? 'text-primary' : 'text-subtle')}>{c.icon}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                    {c.hint && <span className="hidden shrink-0 truncate text-xs text-subtle sm:block">{c.hint}</span>}
                    {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-subtle" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden items-center gap-4 border-t border-border bg-surface-2/60 px-4 py-2 text-[11px] text-subtle sm:flex">
            <span>
              <kbd className="rounded border border-border bg-surface px-1">↑</kbd> <kbd className="rounded border border-border bg-surface px-1">↓</kbd> to move
            </span>
            <span>
              <kbd className="rounded border border-border bg-surface px-1">Enter</kbd> to open
            </span>
            <span className="ml-auto">
              <kbd className="rounded border border-border bg-surface px-1">Ctrl</kbd> <kbd className="rounded border border-border bg-surface px-1">K</kbd> anywhere
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
