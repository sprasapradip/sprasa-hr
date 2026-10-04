import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/form';
import { useDebounce } from '@/hooks';
import { cn } from '@/lib/utils';
import { useEmployeeOptions } from '@/services/lookups';
import type { EmployeeOption } from '@/types';

interface Props {
  value: string | null | undefined;
  onChange: (id: string | null, option?: EmployeeOption) => void;
  placeholder?: string;
  /** Pre-known label for the selected value (e.g. when editing). */
  selectedLabel?: string;
  id?: string;
  invalid?: boolean;
  excludeId?: string;
  clearable?: boolean;
  className?: string;
}

/** Searchable employee combobox backed by /employees/options. */
export function EmployeePicker({ value, onChange, placeholder = 'Select employee', selectedLabel, id, invalid, excludeId, clearable = true, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);
  const { data, isLoading } = useEmployeeOptions(debounced, open);
  const [picked, setPicked] = useState<EmployeeOption | null>(null);
  const label = value ? (picked?.id === value ? `${picked.name} (${picked.employeeCode})` : selectedLabel ?? 'Selected employee') : '';
  const options = (data ?? []).filter((o) => o.id !== excludeId);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            className="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm shadow-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 aria-[invalid=true]:border-rose-500"
          >
            <span className={cn('truncate', !value && 'text-subtle')}>{label || placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-subtle" aria-hidden />
          </button>
        </Popover.Trigger>
        {clearable && value && (
          <button type="button" className="absolute right-8 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-subtle hover:text-fg" onClick={() => onChange(null)} aria-label="Clear selection">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 rounded-xl border border-border bg-surface p-2 shadow-pop">
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or ID…" aria-label="Search employees" />
          <ul role="listbox" className="mt-2 max-h-64 overflow-y-auto">
            {isLoading && <li className="px-2 py-2 text-sm text-subtle">Searching…</li>}
            {!isLoading && options.length === 0 && <li className="px-2 py-2 text-sm text-subtle">No employees found</li>}
            {options.map((o) => (
              <li key={o.id} role="option" aria-selected={o.id === value}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  onClick={() => {
                    setPicked(o);
                    onChange(o.id, o);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Check className={cn('size-4 shrink-0 text-primary', o.id === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg">{o.name}</span>
                    <span className="block truncate text-xs text-subtle">
                      {o.employeeCode}
                      {o.designation ? ` · ${o.designation}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
