import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/display';
import { DropdownContent, DropdownLabel, DropdownMenu, DropdownTrigger } from '@/components/ui/overlay';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Can be hidden from the column menu. */
  optional?: boolean;
  /** Role in the mobile card layout. Columns without a role are listed as label/value rows. */
  mobile?: 'title' | 'subtitle' | 'badge' | 'hidden';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string, order: 'asc' | 'desc') => void;
  rowActions?: (row: T) => ReactNode;
  footer?: ReactNode;
  /** Label for screen readers. */
  caption: string;
  columnMenu?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, loading, empty, onRowClick, sortBy, sortOrder, onSort, rowActions, footer, caption, columnMenu }: Props<T>) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = columns.filter((c) => !hidden.has(c.key));
  const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  const header = (c: Column<T>) => {
    if (!c.sortable || !onSort) return c.header;
    const active = sortBy === c.key;
    const Icon = active ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <button type="button" className={cn('inline-flex cursor-pointer items-center gap-1 hover:text-fg', active && 'text-fg')} onClick={() => onSort(c.key, active && sortOrder === 'asc' ? 'desc' : 'asc')}>
        {c.header}
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{active ? `sorted ${sortOrder === 'asc' ? 'ascending' : 'descending'}` : 'sortable'}</span>
      </button>
    );
  };

  const title = columns.find((c) => c.mobile === 'title');
  const subtitle = columns.find((c) => c.mobile === 'subtitle');
  const badge = columns.find((c) => c.mobile === 'badge');
  const details = visible.filter((c) => !c.mobile);

  return (
    <div>
      {columnMenu && (
        <div className="hidden justify-end border-b border-border px-3 py-2 md:flex">
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="sm">
                <Columns3 /> Columns
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownLabel>Show columns</DropdownLabel>
              {columns
                .filter((c) => c.optional)
                .map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="accent-[var(--primary)]"
                      checked={!hidden.has(c.key)}
                      onChange={() =>
                        setHidden((h) => {
                          const n = new Set(h);
                          if (n.has(c.key)) n.delete(c.key);
                          else n.add(c.key);
                          return n;
                        })
                      }
                    />
                    {c.header}
                  </label>
                ))}
            </DropdownContent>
          </DropdownMenu>
        </div>
      )}

      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/70">
              {visible.map((c) => (
                <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-subtle', alignClass(c.align), c.className)}>
                  {header(c)}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="w-12 px-2">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {visible.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                  {rowActions && <td />}
                </tr>
              ))}
            {!loading &&
              rows?.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cn('transition-colors hover:bg-surface-2/60', onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {visible.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 align-middle text-fg', alignClass(c.align), c.align === 'right' && 'num', c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
          {footer && !loading && <tfoot className="border-t-2 border-border bg-surface-2/60 font-semibold">{footer}</tfoot>}
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="space-y-2 p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </li>
          ))}
        {!loading &&
          rows?.map((row) => (
            <li key={rowKey(row)} className={cn('p-4', onRowClick && 'cursor-pointer active:bg-surface-2')} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {title && <div className="font-medium text-fg">{title.cell(row)}</div>}
                  {subtitle && <div className="mt-0.5 text-xs text-subtle">{subtitle.cell(row)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {badge?.cell(row)}
                  {rowActions?.(row)}
                </div>
              </div>
              {details.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {details.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-subtle">{c.header}</dt>
                      <dd className={cn('truncate text-fg', c.align === 'right' && 'num')}>{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
      </ul>

      {!loading && rows && rows.length === 0 && empty}
    </div>
  );
}

export function Pagination({ page, totalPages, total, limit, onPage }: { page: number; totalPages: number; total: number; limit: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm" aria-label="Pagination">
      <p className="num text-subtle">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="num px-2 text-subtle">
          {page} / {totalPages}
        </span>
        <Button variant="secondary" size="icon-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
