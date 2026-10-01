import { AlertTriangle, CheckCircle2, Download, FileUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/overlay';
import { api, ApiError, download } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { cn } from '@/lib/utils';

interface RowResult {
  row: number;
  data: Record<string, string>;
  errors: string[];
}
interface Preview {
  results: RowResult[];
  valid: number;
  invalid: number;
}

const steps = ['Download template', 'Upload file', 'Check rows', 'Import'];

export default function EmployeeImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const step = result !== null ? 3 : preview ? 2 : file ? 1 : 0;

  const check = useApiMutation(
    () => {
      const f = new FormData();
      f.append('file', file!);
      return api.upload<Preview>('/employees/import/preview', f);
    },
    { onSuccess: (r) => setPreview(r.data) },
  );

  const commit = useApiMutation(() => api.post<{ imported: number }>('/employees/import/commit', { rows: preview!.results.map((r) => r.data) }), {
    invalidate: [['employees'], ['dashboard']],
    onSuccess: (r) => {
      setConfirm(false);
      setResult(r.data.imported);
      toast.success(`${r.data.imported} employees imported`);
    },
  });
  const commitError = commit.error instanceof ApiError && commit.error.code === 'IMPORT_INVALID' ? commit.error.message : null;

  const rows = preview?.results.filter((r) => !onlyErrors || r.errors.length) ?? [];
  const shownCols = ['employeeCode', 'firstName', 'lastName', 'joinDate', 'department', 'designation', 'basicSalary'];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Import employees" description="Bring your existing staff list in from Excel or CSV." breadcrumb={<Link to="/app/employees" className="hover:text-fg">Employees</Link>} />

      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Import steps">
        {steps.map((s, i) => (
          <li key={s} className={cn('rounded-md border px-3 py-2 text-sm', i <= step ? 'border-primary bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'border-border text-subtle')} aria-current={i === step ? 'step' : undefined}>
            <span className="num mr-1.5 font-semibold">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {result !== null ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
          <p className="mt-3 text-lg font-semibold text-fg">{result} employees imported</p>
          <p className="mt-1 text-sm text-subtle">Each one has a joining record, leave balances for this year and the default shift. Add salaries from their profile, or include Basic Salary in the file next time.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link to="/app/employees">View employees</Link>
            </Button>
            <Button variant="secondary" onClick={() => { setFile(null); setPreview(null); setResult(null); }}>
              Import another file
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader title="1. Get the template" description="Fill one row per employee. Departments can be written by code (FIN) or name. Dates use YYYY-MM-DD." />
            <CardBody className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => download('/employees/import/template', { format: 'xlsx' })}>
                <Download /> Excel template
              </Button>
              <Button variant="secondary" onClick={() => download('/employees/import/template', { format: 'csv' })}>
                <Download /> CSV template
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="2. Upload your file" description=".xlsx or .csv, up to 2,000 rows and 5 MB." />
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                type="file"
                accept=".xlsx,.csv"
                aria-label="Import file"
                className="h-auto py-1.5 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm file:text-fg sm:max-w-md"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
              <Button disabled={!file} loading={check.isPending} onClick={() => check.mutate()}>
                <FileUp /> Check file
              </Button>
            </CardBody>
          </Card>

          {preview && (
            <Card>
              <CardHeader
                title="3. Review"
                description={`${preview.results.length} rows found`}
                actions={
                  <div className="flex items-center gap-2">
                    <Badge tone="green">{preview.valid} ready</Badge>
                    {preview.invalid > 0 && <Badge tone="red">{preview.invalid} with errors</Badge>}
                  </div>
                }
              />
              <CardBody className="space-y-4">
                {preview.invalid > 0 ? (
                  <Alert tone="red" icon={<AlertTriangle />} title="Fix the errors and upload again">
                    Nothing is imported while any row has an error, so you never end up with half a list. Correct the rows marked below in your file, then check it again.
                  </Alert>
                ) : (
                  <Alert tone="green" icon={<CheckCircle2 />}>
                    Every row passed. Import them all in one step.
                  </Alert>
                )}
                {commitError && <Alert tone="red">{commitError}</Alert>}
                {preview.invalid > 0 && (
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="accent-[var(--primary)]" /> Show only rows with errors
                  </label>
                )}
                <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-2">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-subtle">Row</th>
                        {shownCols.map((c) => (
                          <th key={c} className="px-3 py-2 text-left text-xs font-semibold text-subtle">
                            {c}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-left text-xs font-semibold text-subtle">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <tr key={r.row} className={r.errors.length ? 'bg-rose-50/60 dark:bg-rose-950/20' : ''}>
                          <td className="num px-3 py-2 text-subtle">{r.row}</td>
                          {shownCols.map((c) => (
                            <td key={c} className="px-3 py-2 text-fg">
                              {r.data[c] || <span className="text-subtle">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {r.errors.length ? (
                              <ul className="space-y-0.5 text-xs text-rose-700 dark:text-rose-300">
                                {r.errors.map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                              </ul>
                            ) : (
                              <Badge tone="green">OK</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <Button disabled={preview.invalid > 0 || preview.valid === 0} onClick={() => setConfirm(true)}>
                    Import {preview.valid} employees
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="primary"
        title={`Import ${preview?.valid ?? 0} employees?`}
        description="They will be created with a joining record, this year’s leave balances and the default shift. If anything fails, nothing is saved."
        confirmLabel="Import"
        loading={commit.isPending}
        onConfirm={() => commit.mutate()}
      />
    </div>
  );
}
