import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common';
import { DataTable, Pagination } from '@/components/common/DataTable';
import { Card, EmptyState } from '@/components/ui/display';
import { api } from '@/lib/api';
import { payslipColumns, PayslipDownload, type PayslipRow } from '../payroll/PayslipsPage';

export default function MyPayslipsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['payslips', 'me', page], queryFn: () => api.list<PayslipRow>('/me/payslips', { page, limit: 24 }), placeholderData: keepPreviousData });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My payslips" description="Your payslip appears here once HR approves the month’s payroll." />
      <Card>
        <DataTable
          caption="My payslips"
          columns={payslipColumns(false)}
          rows={data?.data}
          rowKey={(p) => p.id}
          loading={isLoading}
          onRowClick={(p) => navigate(`/app/payslips/${p.id}`)}
          rowActions={(p) => <PayslipDownload p={p} />}
          empty={<EmptyState icon={<Receipt />} title="No payslips yet" />}
        />
        {data && <Pagination {...data.pagination} onPage={setPage} />}
      </Card>
    </div>
  );
}
