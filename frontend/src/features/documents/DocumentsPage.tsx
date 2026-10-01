import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { Pagination } from '@/components/common/DataTable';
import { DocumentList, type DocumentRow } from '@/components/common/DocumentList';
import { UploadDocumentDialog } from '@/components/common/UploadDocumentDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/display';
import { useListParams } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { titleCase } from '@/lib/utils';

const TYPES = ['CITIZENSHIP', 'PASSPORT', 'CONTRACT', 'APPOINTMENT_LETTER', 'EDUCATION_CERTIFICATE', 'EXPERIENCE_LETTER', 'TAX_DOCUMENT', 'OTHER'];

export default function DocumentsPage() {
  const { can } = useAuth();
  const list = useListParams({ documentType: '', expiring: '' });
  const [open, setOpen] = useState(false);
  const q = { page: list.page, limit: list.limit, search: list.search, documentType: list.filters.documentType, expiringWithin: list.filters.expiring ? 30 : undefined };
  const { data, isLoading } = useQuery({ queryKey: ['documents', q], queryFn: () => api.list<DocumentRow>('/documents', q), placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Employee files are private: every download checks the viewer’s permissions."
        actions={
          can('documents.manage') && (
            <Button onClick={() => setOpen(true)}>
              <Upload /> Upload document
            </Button>
          )
        }
      />
      <Card>
        <Toolbar>
          <SearchInput value={list.search} onChange={(v) => list.update({ search: v })} placeholder="Title or employee…" />
          <FilterSelect label="Type" value={list.filters.documentType} onChange={(v) => list.update({ documentType: v })} options={TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="accent-[var(--primary)]" checked={Boolean(list.filters.expiring)} onChange={(e) => list.update({ expiring: e.target.checked ? '1' : '' })} />
            Expired or expiring in 30 days
          </label>
        </Toolbar>
        <DocumentList docs={data?.data} loading={isLoading} canDelete={can('documents.manage')} showEmployee />
        {data && <Pagination {...data.pagination} onPage={(p) => list.update({ page: p }, false)} />}
      </Card>
      {can('documents.manage') && <UploadDocumentDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}
