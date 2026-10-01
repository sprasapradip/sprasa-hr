import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common';
import { DocumentList, type DocumentRow } from '@/components/common/DocumentList';
import { Card } from '@/components/ui/display';
import { api } from '@/lib/api';

export default function MyDocumentsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['documents', 'me'], queryFn: () => api.list<DocumentRow>('/me/documents') });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My documents" description="Contracts, certificates and letters HR has on file for you. To add or replace one, send it to HR." />
      <Card>
        <DocumentList docs={data?.data} loading={isLoading} />
      </Card>
    </div>
  );
}
