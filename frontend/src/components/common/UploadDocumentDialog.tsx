import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { titleCase } from '@/lib/utils';
import { EmployeePicker } from './EmployeePicker';

const TYPES = ['CITIZENSHIP', 'PASSPORT', 'CONTRACT', 'APPOINTMENT_LETTER', 'EDUCATION_CERTIFICATE', 'EXPERIENCE_LETTER', 'TAX_DOCUMENT', 'OTHER'];

export function UploadDocumentDialog({ open, onOpenChange, employeeId }: { open: boolean; onOpenChange: (o: boolean) => void; employeeId?: string }) {
  const [emp, setEmp] = useState<string | null>(employeeId ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('CONTRACT');
  const [title, setTitle] = useState('');
  const [expiry, setExpiry] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const upload = useApiMutation(
    () => {
      const form = new FormData();
      form.append('employeeId', emp!);
      form.append('documentType', type);
      form.append('title', title);
      if (expiry) form.append('expiryDate', expiry);
      form.append('file', file!);
      return api.upload('/documents', form);
    },
    {
      success: 'Document uploaded',
      invalidate: [['documents'], ['employee-documents']],
      onSuccess: () => {
        onOpenChange(false);
        setFile(null);
        setTitle('');
        setExpiry('');
      },
    },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if (!emp) e.employee = 'Choose an employee';
    if (!file) e.file = 'Choose a file';
    else if (file.size > 5 * 1024 * 1024) e.file = 'Files must be 5 MB or smaller';
    if (title.trim().length < 2) e.title = 'Give the document a title';
    setErrors(e);
    if (!Object.keys(e).length) upload.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload document"
      description="PDF, JPG, PNG, WEBP or Word, up to 5 MB. Files are private to authorised staff."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={upload.isPending}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!employeeId && (
          <Field label="Employee" required error={errors.employee}>
            {(p) => <EmployeePicker id={p.id} value={emp} onChange={setEmp} invalid={Boolean(errors.employee)} />}
          </Field>
        )}
        <FormGrid>
          <Field label="Type" required>
            {(p) => (
              <Select {...p} value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Expiry date" hint="Leave blank if it doesn’t expire">
            {(p) => <Input {...p} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />}
          </Field>
        </FormGrid>
        <Field label="Title" required error={errors.title}>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Employment contract 2026" />}
        </Field>
        <Field label="File" required error={errors.file}>
          {(p) => (
            <Input
              {...p}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              className="h-auto py-1.5 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm file:text-fg"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
