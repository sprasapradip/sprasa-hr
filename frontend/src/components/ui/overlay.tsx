import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { X } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

const overlay = 'fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] animate-fade-in';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/** Centered modal dialog. */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: DialogProps) {
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface shadow-pop focus:outline-none', widths[size])}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-fg">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-subtle">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Side drawer for longer forms and record details. */
export function Drawer({ open, onOpenChange, title, description, children, footer, size = 'md' }: DialogProps) {
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content className={cn('fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-pop focus:outline-none', widths[size])}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-fg">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-subtle">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', tone = 'danger', loading, onConfirm, children }: ConfirmProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={overlay} />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-pop focus:outline-none">
          <AlertDialogPrimitive.Title className="text-base font-semibold text-fg">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description asChild>
            <div className="mt-2 text-sm text-muted">{description}</div>
          </AlertDialogPrimitive.Description>
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                Cancel
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

// ── Dropdown menu ──────────────────────────────────────────

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export const DropdownContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>>(({ className, sideOffset = 6, align = 'end', ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content ref={ref} sideOffset={sideOffset} align={align} className={cn('z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-sm shadow-pop', className)} {...props} />
  </DropdownPrimitive.Portal>
));
DropdownContent.displayName = 'DropdownContent';

export const DropdownItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { danger?: boolean }>(({ className, danger, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-fg outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-subtle',
      danger && 'text-rose-600 dark:text-rose-400 [&_svg]:text-rose-500',
      className,
    )}
    {...props}
  />
));
DropdownItem.displayName = 'DropdownItem';

export const DropdownSeparator = () => <DropdownPrimitive.Separator className="my-1 h-px bg-border" />;
export const DropdownLabel = ({ children }: { children: ReactNode }) => <DropdownPrimitive.Label className="px-2.5 py-1.5 text-xs font-medium text-subtle">{children}</DropdownPrimitive.Label>;

// ── Tabs ───────────────────────────────────────────────────

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('-mb-px flex gap-1 overflow-x-auto border-b border-border', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'shrink-0 cursor-pointer border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-subtle transition-colors hover:text-fg data-[state=active]:border-primary data-[state=active]:text-fg',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = ({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => <TabsPrimitive.Content className={cn('pt-5 focus:outline-none', className)} {...props} />;
