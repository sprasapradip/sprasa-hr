import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/ui/display';

// A stable object, like the real AuthProvider's memoised value (a new one per call would loop effects).
const { login, authValue } = vi.hoisted(() => {
  const login = vi.fn();
  return { login, authValue: { login, user: { employee: { id: 'emp-1' }, permissions: [] }, can: (...p: string[]) => p.includes('payroll.process') } };
});
vi.mock('@/lib/auth', () => ({ useAuth: () => authValue }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn().mockResolvedValue([]), list: vi.fn(), post: vi.fn(), put: vi.fn(), upload: vi.fn(), del: vi.fn() },
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

interface Row {
  id: string;
  name: string;
  amount: number;
  status: string;
}
const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', mobile: 'title', sortable: true, cell: (r) => r.name },
  { key: 'amount', header: 'Amount', align: 'right', cell: (r) => r.amount },
  { key: 'status', header: 'Status', mobile: 'badge', cell: (r) => <StatusBadge status={r.status} /> },
];

describe('DataTable', () => {
  it('renders rows in a table and as mobile cards', () => {
    wrap(<DataTable caption="Test" columns={columns} rows={[{ id: '1', name: 'Sita', amount: 100, status: 'APPROVED' }]} rowKey={(r) => r.id} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Sita')).toBeInTheDocument();
    expect(within(table).getByText('Approved')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Test' })).toBeInTheDocument();
  });

  it('shows the empty state and reports sort clicks', async () => {
    const onSort = vi.fn();
    wrap(<DataTable caption="Test" columns={columns} rows={[]} rowKey={(r) => r.id} empty={<p>Nothing here</p>} onSort={onSort} sortBy="name" sortOrder="asc" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(onSort).toHaveBeenCalledWith('name', 'desc');
  });

  it('paginates', async () => {
    const onPage = vi.fn();
    wrap(<Pagination page={1} totalPages={3} total={60} limit={25} onPage={onPage} />);
    expect(screen.getByText('1–25 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});

describe('Login form', () => {
  it('validates before calling the API, then submits', async () => {
    const { default: LoginPage } = await import('@/pages/auth/LoginPage');
    wrap(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email or username')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();

    login.mockRejectedValueOnce(Object.assign(new Error('Email/username or password is incorrect'), { status: 401 }));
    await userEvent.type(screen.getByLabelText('Email or username'), 'hradmin');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(login).toHaveBeenCalledWith('hradmin', 'secret');
  });
});

describe('Leave application', () => {
  it('requires a leave type and a reason', async () => {
    const { ApplyLeaveDialog } = await import('@/features/leave/ApplyLeaveDialog');
    wrap(<ApplyLeaveDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    // Error messages are role="alert"; the select's placeholder option has the same wording.
    expect(await screen.findByText('Choose a leave type', { selector: '[role="alert"]' })).toBeInTheDocument();
    expect(screen.getByText('Give a short reason', { selector: '[role="alert"]' })).toBeInTheDocument();
  });
});

describe('Payroll review', () => {
  it('offers review and recalculate for a draft to someone who can process payroll, but not approve', async () => {
    const { api } = await import('@/lib/api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      year: 2026,
      month: 8,
      period: 'August 2026',
      status: 'DRAFT',
      workingDays: 26,
      employeeCount: 2,
      totalGross: 100000,
      totalDeductions: 5000,
      totalTax: 2500,
      totalNet: 95000,
      notes: null,
      createdAt: '2026-09-01T00:00:00Z',
      approvedAt: null,
      paidAt: null,
      locked: false,
      byDepartment: [],
    });
    (api.list as ReturnType<typeof vi.fn>).mockResolvedValue({ payroll: {}, data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 }, totals: {} });
    const { default: PayrollRunPage } = await import('@/features/payroll/PayrollRunPage');
    wrap(<PayrollRunPage />);
    expect(await screen.findByRole('button', { name: /mark reviewed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recalculate/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
  });
});
