import { useQuery } from '@tanstack/react-query';
import { Calculator, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Money, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Skeleton, StatusBadge } from '@/components/ui/display';
import { Checkbox, Field, FormGrid, Input, Select } from '@/components/ui/form';
import { ConfirmDialog, Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { formatAmount, formatDate, titleCase } from '@/lib/utils';
import type { TaxRule } from '@/types';

const WARNING = 'Payroll and tax calculations should be configured according to the organisation’s current applicable Nepal rules and verified by the organisation’s accountant/tax professional.';

const blank = { fiscalYear: '2083/84', ruleName: '', category: 'INDIVIDUAL', threshold: '', rate: '', deduction: '0', waivedForSsf: false, effectiveFrom: '2026-07-17', effectiveTo: '', status: 'ACTIVE' };

function TaxPreview() {
  const [income, setIncome] = useState('900000');
  const [category, setCategory] = useState('INDIVIDUAL');
  const [ssf, setSsf] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['tax-preview', income, category, ssf],
    queryFn: () => api.post<{ annualTax: number; monthlyTax: number; slabsUsed: number; breakdown: { ruleName: string; taxableAmount: number; rate: number; tax: number; waived: boolean }[] }>('/tax-rules/preview', { annualIncome: Number(income) || 0, category, ssfContributor: ssf }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  return (
    <Card>
      <CardHeader title="Try the rules" description="See the tax the current slabs produce for an annual taxable income." />
      <CardBody className="space-y-4">
        <FormGrid cols={3}>
          <Field label="Annual taxable income (NPR)">{(p) => <Input {...p} inputMode="numeric" className="num" value={income} onChange={(e) => setIncome(e.target.value.replace(/[^\d.]/g, ''))} />}</Field>
          <Field label="Category">
            {(p) => (
              <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="INDIVIDUAL">Individual</option>
                <option value="COUPLE">Couple</option>
              </Select>
            )}
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label="SSF contributor" checked={ssf} onChange={(e) => setSsf(e.target.checked)} />
          </div>
        </FormGrid>
        {data && (
          <div className={isFetching ? 'opacity-60' : ''}>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-subtle">Annual tax</p>
                <Money value={data.annualTax} currency="NPR" className="text-lg font-semibold text-fg" />
              </div>
              <div>
                <p className="text-xs text-subtle">Per month</p>
                <Money value={data.monthlyTax} currency="NPR" className="text-lg font-semibold text-fg" />
              </div>
            </div>
            {data.slabsUsed === 0 && <Alert tone="red" className="mt-3">No active slabs apply today for this category. Payroll will deduct no tax.</Alert>}
            <ul className="mt-3 space-y-1 text-sm">
              {data.breakdown.map((b) => (
                <li key={b.ruleName} className="flex justify-between gap-3 text-muted">
                  <span>
                    {b.ruleName}: {formatAmount(b.taxableAmount)} × {b.rate}%
                  </span>
                  <span className="num text-fg">{b.waived ? 'waived' : formatAmount(b.tax)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function TaxConfigPage() {
  const { data, isLoading } = useQuery({ queryKey: ['tax-rules'], queryFn: () => api.get<TaxRule[]>('/tax-rules') });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRule | null>(null);
  const [deleting, setDeleting] = useState<TaxRule | null>(null);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open)
      setF(
        editing
          ? { ...editing, threshold: String(editing.threshold), rate: String(editing.rate), deduction: String(editing.deduction), effectiveFrom: editing.effectiveFrom.slice(0, 10), effectiveTo: editing.effectiveTo?.slice(0, 10) ?? '' }
          : { ...blank, fiscalYear: data?.[0]?.fiscalYear ?? blank.fiscalYear },
      );
    setErr(null);
  }, [open, editing, data]);

  const groups = useMemo(() => {
    const map = new Map<string, TaxRule[]>();
    for (const r of data ?? []) {
      const key = `${r.fiscalYear}|${r.category}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  const body = () => ({ ...f, threshold: Number(f.threshold), rate: Number(f.rate), deduction: Number(f.deduction) || 0, effectiveTo: f.effectiveTo || null });
  const save = useApiMutation(() => (editing ? api.put(`/tax-rules/${editing.id}`, body()) : api.post('/tax-rules', body())), { success: 'Tax rule saved', invalidate: [['tax-rules'], ['tax-preview']], onSuccess: () => setOpen(false) });
  const remove = useApiMutation((id: string) => api.del(`/tax-rules/${id}`), { success: 'Tax rule deleted', invalidate: [['tax-rules'], ['tax-preview']], onSuccess: () => setDeleting(null) });

  return (
    <div className="space-y-5">
      <PageHeader title="Tax configuration" description="Progressive slabs used to work out monthly TDS. Each slab applies from its threshold up to the next slab." actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Add slab</Button>} />
      <Alert tone="amber" icon={<ShieldAlert />} title="Check these rules before running official payroll">
        {WARNING}
      </Alert>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : !groups.length ? (
            <Card>
              <EmptyState icon={<Calculator />} title="No tax rules" description="Without slabs, payroll deducts no income tax." />
            </Card>
          ) : (
            groups.map(([key, rules]) => {
              const [fy, category] = key.split('|');
              return (
                <Card key={key}>
                  <CardHeader
                    title={
                      <span className="flex items-center gap-2">
                        FY {fy} · {titleCase(category)}
                      </span>
                    }
                    description={`Effective ${formatDate(rules[0].effectiveFrom)}${rules[0].effectiveTo ? ` to ${formatDate(rules[0].effectiveTo)}` : ' onwards'}`}
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-2/60 text-xs uppercase tracking-wide text-subtle">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold">Slab</th>
                          <th className="px-4 py-2 text-right font-semibold">From (annual)</th>
                          <th className="px-4 py-2 text-right font-semibold">Rate</th>
                          <th className="px-4 py-2 text-left font-semibold">Notes</th>
                          <th className="w-20 px-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rules.map((r) => (
                          <tr key={r.id}>
                            <td className="px-4 py-2 text-fg">{r.ruleName}</td>
                            <td className="num px-4 py-2 text-right">{formatAmount(r.threshold)}</td>
                            <td className="num px-4 py-2 text-right font-medium">{r.rate}%</td>
                            <td className="px-4 py-2">
                              <span className="flex flex-wrap gap-1">
                                {r.waivedForSsf && <Badge tone="teal">Waived for SSF</Badge>}
                                {r.deduction > 0 && <Badge>Rebate {formatAmount(r.deduction)}</Badge>}
                                {r.status !== 'ACTIVE' && <StatusBadge status={r.status} />}
                              </span>
                            </td>
                            <td className="px-2 text-right">
                              <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(r); setOpen(true); }} aria-label={`Edit ${r.ruleName}`}>
                                <Pencil />
                              </Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(r)} aria-label={`Delete ${r.ruleName}`}>
                                <Trash2 />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })
          )}
        </div>
        <TaxPreview />
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit tax slab' : 'Add tax slab'}
        description="When the rates change in a new budget, add new slabs with a new effective date rather than editing old ones. Past payroll keeps using the rules of its time."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              onClick={() => {
                if (f.ruleName.trim().length < 2) return setErr('Enter a name for the slab');
                if (f.threshold === '' || Number(f.threshold) < 0) return setErr('Enter the annual income where the slab starts');
                if (f.rate === '' || Number(f.rate) < 0 || Number(f.rate) > 100) return setErr('Enter a rate between 0 and 100');
                save.mutate();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <Alert tone="red">{err}</Alert>}
          <FormGrid cols={3}>
            <Field label="Fiscal year">{(p) => <Input {...p} value={f.fiscalYear} onChange={(e) => setF({ ...f, fiscalYear: e.target.value })} placeholder="2083/84" />}</Field>
            <Field label="Category">
              {(p) => (
                <Select {...p} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="COUPLE">Couple</option>
                  <option value="ALL">All employees</option>
                </Select>
              )}
            </Field>
            <Field label="Status">
              {(p) => (
                <Select {...p} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              )}
            </Field>
          </FormGrid>
          <Field label="Name">{(p) => <Input {...p} value={f.ruleName} onChange={(e) => setF({ ...f, ruleName: e.target.value })} placeholder="Individual slab 2 (10%)" />}</Field>
          <FormGrid cols={3}>
            <Field label="Starts at annual income" hint="0 for the first slab">{(p) => <Input {...p} inputMode="numeric" className="num" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} />}</Field>
            <Field label="Rate %">{(p) => <Input {...p} inputMode="decimal" className="num" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />}</Field>
            <Field label="Rebate (NPR / year)" hint="Subtracted from this slab’s tax">{(p) => <Input {...p} inputMode="decimal" className="num" value={f.deduction} onChange={(e) => setF({ ...f, deduction: e.target.value })} />}</Field>
            <Field label="Effective from">{(p) => <Input {...p} type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />}</Field>
            <Field label="Effective to" hint="Blank = until replaced">{(p) => <Input {...p} type="date" value={f.effectiveTo} onChange={(e) => setF({ ...f, effectiveTo: e.target.value })} />}</Field>
          </FormGrid>
          <Checkbox label="Waive this slab for employees contributing to SSF" checked={f.waivedForSsf} onChange={(e) => setF({ ...f, waivedForSsf: e.target.checked })} />
        </div>
      </Dialog>
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="Delete tax slab?" description={`Delete ${deleting?.ruleName}? Payroll already generated is not affected.`} confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}
