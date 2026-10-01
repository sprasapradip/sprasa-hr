import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { api, ApiError } from '@/lib/api';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().max(30).optional(),
  organisationName: z.string().trim().max(150).optional(),
  employeeCount: z.string().optional(),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(3000),
  website: z.string().max(0).optional(),
});
type Values = z.infer<typeof schema>;

export function EnquiryForm({ type }: { type: 'CONSULTATION' | 'CONTACT' }) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError: setFieldError } = useForm<Values>({ resolver: zodResolver(schema) });
  const e = formState.errors;

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api.post('/public/enquiries', { ...values, type, employeeCount: values.employeeCount || undefined });
      setDone(res.message ?? 'Thank you. We will be in touch.');
    } catch (err) {
      if (err instanceof ApiError) {
        Object.entries(err.fieldErrors).forEach(([k, m]) => setFieldError(k as keyof Values, { message: m }));
        setError(err.message);
      } else setError('Something went wrong. Please call us instead.');
    }
  });

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
        <p className="mt-3 font-semibold text-fg">Message received</p>
        <p className="mt-1 text-sm text-muted">{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
      {error && <Alert tone="red">{error}</Alert>}
      <FormGrid>
        <Field label="Your name" required error={e.name?.message}>
          {(p) => <Input {...p} {...register('name')} autoComplete="name" placeholder="Sita Sharma" />}
        </Field>
        <Field label="Email" required error={e.email?.message}>
          {(p) => <Input {...p} {...register('email')} type="email" autoComplete="email" placeholder="you@company.com.np" />}
        </Field>
        <Field label="Phone" error={e.phone?.message}>
          {(p) => <Input {...p} {...register('phone')} type="tel" autoComplete="tel" placeholder="98XXXXXXXX" />}
        </Field>
        <Field label="Organisation" error={e.organisationName?.message}>
          {(p) => <Input {...p} {...register('organisationName')} autoComplete="organization" placeholder="Company or school name" />}
        </Field>
        {type === 'CONSULTATION' && (
          <Field label="Number of employees" className="sm:col-span-2">
            {(p) => (
              <Select {...p} {...register('employeeCount')}>
                <option value="">Choose a range</option>
                {['1-10', '11-50', '51-200', '201-500', '500+'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </FormGrid>
      <Field label={type === 'CONSULTATION' ? 'What do you need?' : 'Your question'} required error={e.message?.message}>
        {(p) => (
          <Textarea
            {...p}
            {...register('message')}
            rows={5}
            placeholder={type === 'CONSULTATION' ? 'For example: 40 staff across two branches, we run payroll in Excel and want leave approvals online.' : 'Ask us anything about Sprasa HR.'}
          />
        )}
      </Field>
      {/* Honeypot for bots; hidden from people and screen readers. */}
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden {...register('website')} />
      <Button type="submit" size="lg" loading={formState.isSubmitting} className="w-full sm:w-auto">
        {type === 'CONSULTATION' ? 'Send request' : 'Send question'}
      </Button>
    </form>
  );
}
