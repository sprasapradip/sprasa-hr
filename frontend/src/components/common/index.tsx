import { Download, FileSpreadsheet, FileText, Search, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/overlay';
import { useDebounce } from '@/hooks';
import { download } from '@/lib/api';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, actions, breadcrumb }: { title: string; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <Helmet>
        <title>{`${title} · Sprasa HR`}</title>
      </Helmet>
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-xs text-subtle">{breadcrumb}</div>}
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-subtle">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Search box that reports its value after the user stops typing. */
export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value);
  const debounced = useDebounce(text, 350);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="pl-8 pr-8" aria-label={placeholder} />
      {text && (
        <button type="button" onClick={() => setText('')} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-subtle hover:text-fg" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={cn('w-full sm:w-auto sm:min-w-40', className)}>
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:flex-wrap sm:items-center', className)}>{children}</div>;
}

/** CSV / Excel / PDF export of the current view. */
export function ExportMenu({ path, query, formats = ['csv', 'xlsx', 'pdf'], label = 'Export' }: { path: string; query?: Record<string, string | number | undefined>; formats?: ('csv' | 'xlsx' | 'pdf')[]; label?: string }) {
  const [busy, setBusy] = useState(false);
  const run = async (format: string) => {
    setBusy(true);
    try {
      await download(path, { ...query, format, page: undefined, limit: undefined });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const icons = { csv: <FileText />, xlsx: <FileSpreadsheet />, pdf: <FileText /> };
  const names = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <Button variant="secondary" loading={busy}>
          {!busy && <Download />} {label}
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        {formats.map((f) => (
          <DropdownItem key={f} onSelect={() => run(f)}>
            {icons[f]} {names[f]}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

export function Money({ value, currency, className }: { value: number | null | undefined; currency?: string; className?: string }) {
  if (value === null || value === undefined) return <span className="text-subtle">—</span>;
  return (
    <span className={cn('num whitespace-nowrap', className)}>
      {currency && <span className="mr-1 text-xs text-subtle">{currency}</span>}
      {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}
    </span>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <span className="num font-mono text-[12.5px] text-muted">{children}</span>;
}

export function Section({ title, description, actions, children, className }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="text-xs text-subtle">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-fg">This couldn’t be loaded</p>
      <p className="text-sm text-subtle">{(error as Error)?.message ?? 'Unknown error'}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
