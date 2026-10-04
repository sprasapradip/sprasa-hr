import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const control =
  'block w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg shadow-xs placeholder:text-subtle transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500/30';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, 'h-9', props.type === 'date' || props.type === 'time' ? 'pr-2' : '', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, 'min-h-20 py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/** Native select: accessible, keyboard- and mobile-friendly. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      control,
      'h-9 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8',
      "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({ className, required, children, ...props }: LabelPrimitive.LabelProps & { required?: boolean }) {
  return (
    <LabelPrimitive.Root className={cn('mb-1.5 block text-[13px] font-medium text-fg', className)} {...props}>
      {children}
      {required && (
        <span className="ml-0.5 text-rose-600" aria-hidden>
          *
        </span>
      )}
    </LabelPrimitive.Root>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }) => ReactNode;
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-start gap-2 text-sm text-fg', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--primary)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function FormGrid({ children, cols = 2, className }: { children: ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  return <div className={cn('grid gap-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3', className)}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-subtle">{description}</p>}
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}
