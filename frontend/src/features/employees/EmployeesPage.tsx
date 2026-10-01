import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Eye, MoreHorizontal, Pencil, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Code, ErrorState, ExportMenu, FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Avatar, Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { ConfirmDialog, DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlay';
import { useListParams, useObjectUrl } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDate, titleCase } from '@/lib/utils';
import { departmentOptions, useDepartments, useDesignations } from '@/services/lookups';
import type { EmployeeListItem } from '@/types';

const STATUSES = ['ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED'];
const TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'];

function EmployeeAvatar({ e }: { e: EmployeeListItem }) {
  const src = useObjectUrl(e.hasPhoto ? `/employees/${e.id}/photo` : null);
  return <Avatar name={e.fullName} src={src} size="sm" />;
}

export default function EmployeesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const list = useListParams({ departmentId: '', designationId: '', status: '', employmentType: '', scope: 'current' });
  const { data: departments } = useDepartments();
  const { data: designations } = useDesignations();
  const [deleting, setDeleting] = useState<EmployeeListItem | null>(null);

  const query = {
    page: list.page,
    limit: list.limit,
    search: list.search,
    sortBy: list.sortBy || undefined,
    sortOrder: list.sortOrder,
    ...list.filters,
  };
  const { data, isLoading, isFetching, error, refetch } = useQuery({ queryKey: ['employees', query], queryFn: () => api.list<EmployeeListItem>('/employees', query), placeholderData: keepPreviousData });

  const remove = useApiMutation((id: string) => api.del(`/employees/${id}`), {
    success: 'Employee deleted',
    invalidate: [['employees'], ['dashboard']],
    onSuccess: () => setDeleting(null),
  });

  const columns: Column<EmployeeListItem>[] = [
    {
      key: 'firstName',
      header: 'Employee',
      sortable: true,
      mobile: 'title',
      cell: (e) => (
        <span className="flex items-center gap-3">
          <EmployeeAvatar e={e} />
          <span className="min-w-0">
            <Link to={`/app/employees/${e.id}`} className="block truncate font-medium text-fg hover:text-primary" onClick={(ev) => ev.stopPropagation()}>
              {e.fullName}
            </Link>
            <span className="hidden truncate text-xs text-subtle md:block">{e.email ?? '—'}</span>
          </span>
        </span>
      ),
    },
    { key: 'employeeCode', header: 'ID', sortable: true, mobile: 'subtitle', cell: (e) => <Code>{e.employeeCode}</Code> },
    { key: 'department', header: 'Department', optional: true, cell: (e) => e.department?.name ?? '—' },
    { key: 'designation', header: 'Designation', optional: true, cell: (e) => e.designation?.name ?? '—' },
    { key: 'phone', header: 'Phone', optional: true, cell: (e) => <span className="num">{e.phone ?? '—'}</span> },
    { key: 'joinDate', header: 'Joined', sortable: true, optional: true, cell: (e) => <span className="num">{formatDate(e.joinDate)}</span> },
    { key: 'employmentType', header: 'Type', optional: true, cell: (e) => titleCase(e.employmentType) },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        description={data ? `${data.pagination.total} ${list.filters.scope === 'exited' ? 'former' : ''} employees` : undefined}
        actions={
          <>
            {can('employees.import') && (
              <Button variant="secondary" asChild>
                <Link to="/app/employees/import">
                  <Upload /> Import
                </Link>
              </Button>
            )}
            <ExportMenu path="/employees" query={query} />
            {can('employees.create') && (
              <Button asChild>
                <Link to="/app/employees/new">
                  <UserPlus /> Add employee
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Card>
        <Toolbar>
          <SearchInput value={list.search} onChange={(v) => list.update({ search: v })} placeholder="Name, ID, email, phone…" />
          <FilterSelect label="Department" value={list.filters.departmentId} onChange={(v) => list.update({ departmentId: v })} options={departmentOptions(departments)} />
          <FilterSelect label="Designation" value={list.filters.designationId} onChange={(v) => list.update({ designationId: v })} options={(designations ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          <FilterSelect label="Status" value={list.filters.status} onChange={(v) => list.update({ status: v })} options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
          <FilterSelect label="Type" value={list.filters.employmentType} onChange={(v) => list.update({ employmentType: v })} options={TYPES.map((s) => ({ value: s, label: titleCase(s) }))} />
          <div className="flex rounded-md border border-border p-0.5 text-sm sm:ml-auto" role="group" aria-label="Show">
            {(
              [
                ['current', 'Current'],
                ['exited', 'Former'],
                ['all', 'All'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => list.update({ scope: v })}
                aria-pressed={list.filters.scope === v}
                className={`cursor-pointer rounded px-3 py-1 ${list.filters.scope === v ? 'bg-surface-2 font-medium text-fg' : 'text-subtle hover:text-fg'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </Toolbar>

        {error ? (
          <ErrorState error={error} retry={() => refetch()} />
        ) : (
          <div className={isFetching && !isLoading ? 'opacity-70 transition-opacity' : ''}>
            <DataTable
              caption="Employees"
              columns={columns}
              rows={data?.data}
              rowKey={(e) => e.id}
              loading={isLoading}
              columnMenu
              onRowClick={(e) => navigate(`/app/employees/${e.id}`)}
              sortBy={list.sortBy}
              sortOrder={list.sortOrder}
              onSort={(sortBy, sortOrder) => list.update({ sortBy, sortOrder })}
              rowActions={(e) => (
                <DropdownMenu>
                  <DropdownTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.fullName}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem onSelect={() => navigate(`/app/employees/${e.id}`)}>
                      <Eye /> View profile
                    </DropdownItem>
                    {can('employees.update') && (
                      <DropdownItem onSelect={() => navigate(`/app/employees/${e.id}/edit`)}>
                        <Pencil /> Edit
                      </DropdownItem>
                    )}
                    {can('employees.delete') && (
                      <>
                        <DropdownSeparator />
                        <DropdownItem danger onSelect={() => setDeleting(e)}>
                          <Trash2 /> Delete
                        </DropdownItem>
                      </>
                    )}
                  </DropdownContent>
                </DropdownMenu>
              )}
              empty={
                list.search || Object.values(list.filters).some((v) => v && v !== 'current') ? (
                  <EmptyState icon={<Users />} title="No employees match these filters" description="Try a different search or clear the filters." />
                ) : (
                  <EmptyState
                    icon={<Users />}
                    title="No employees found."
                    description="Add your first employee to start managing your workforce."
                    action={
                      can('employees.create') && (
                        <Button asChild>
                          <Link to="/app/employees/new">
                            <UserPlus /> Add employee
                          </Link>
                        </Button>
                      )
                    }
                  />
                )
              }
            />
            {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} limit={data.pagination.limit} onPage={(p) => list.update({ page: p }, false)} />}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete employee?"
        description={
          <>
            Are you sure you want to delete <strong className="text-fg">{deleting?.fullName}</strong>? Their login is disabled and they disappear from lists. Payroll history and audit records are kept.
          </>
        }
        confirmLabel="Delete employee"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
