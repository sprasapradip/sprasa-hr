import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/display';
import { AppLayout } from '@/layouts/AppLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { useAuth } from '@/lib/auth';

const page = (loader: () => Promise<{ default: React.ComponentType }>) => {
  const C = lazy(loader);
  return (
    <Suspense fallback={<PageSkeleton />}>
      <C />
    </Suspense>
  );
};

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <img src="/favicon.svg" alt="Loading Sprasa HR" className="size-10 animate-pulse" />
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

/** Frontend guard only hides screens; the API enforces every permission. */
function RequirePermission({ any, children }: { any: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...any)) return <Navigate to="/app/forbidden" replace />;
  return <>{children}</>;
}

function RequireEmployee({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user?.employee) return <Navigate to="/app/forbidden" replace />;
  return <>{children}</>;
}

/** Landing inside the app: admins see the HR dashboard, everyone else their own. */
function AppHome() {
  const { can, user } = useAuth();
  if (can('employees.view', 'payroll.view', 'reports.view', 'reports.payroll', 'attendance.view')) return page(() => import('@/features/dashboard/DashboardPage'));
  if (user?.employee) return <Navigate to="/app/me" replace />;
  return page(() => import('@/features/account/AccountPage'));
}

function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/app" replace />;
  return <Outlet />;
}

const guard = (any: string[], el: ReactNode) => <RequirePermission any={any}>{el}</RequirePermission>;
const self = (el: ReactNode) => <RequireEmployee>{el}</RequireEmployee>;

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: page(() => import('@/pages/public/HomePage')) },
      { path: '/features', element: page(() => import('@/pages/public/FeaturesPage')) },
      { path: '/how-it-works', element: page(() => import('@/pages/public/HowItWorksPage')) },
      { path: '/security', element: page(() => import('@/pages/public/SecurityPage')) },
      { path: '/faq', element: page(() => import('@/pages/public/FaqPage')) },
      { path: '/consultancy', element: page(() => import('@/pages/public/ConsultancyPage')) },
      { path: '/contact', element: page(() => import('@/pages/public/ContactPage')) },
    ],
  },
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: page(() => import('@/pages/auth/LoginPage')) },
      { path: '/forgot-password', element: page(() => import('@/pages/auth/ForgotPasswordPage')) },
    ],
  },
  { path: '/reset-password', element: page(() => import('@/pages/auth/ResetPasswordPage')) },
  { path: '/verify-email', element: page(() => import('@/pages/auth/VerifyEmailPage')) },
  {
    path: '/app',
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <AppHome /> },
          { path: 'profile', element: page(() => import('@/features/account/AccountPage')) },
          { path: 'notifications', element: page(() => import('@/features/notifications/NotificationsPage')) },
          { path: 'forbidden', element: page(() => import('@/pages/ForbiddenPage')) },

          // Self-service
          { path: 'me', element: self(page(() => import('@/features/me/MyDashboardPage'))) },
          { path: 'me/attendance', element: self(page(() => import('@/features/me/MyAttendancePage'))) },
          { path: 'me/leave', element: self(page(() => import('@/features/me/MyLeavePage'))) },
          { path: 'me/payslips', element: self(page(() => import('@/features/me/MyPayslipsPage'))) },
          { path: 'me/documents', element: self(page(() => import('@/features/me/MyDocumentsPage'))) },
          { path: 'me/profile', element: self(page(() => import('@/features/me/MyProfilePage'))) },

          // People
          { path: 'employees', element: guard(['employees.view'], page(() => import('@/features/employees/EmployeesPage'))) },
          { path: 'employees/new', element: guard(['employees.create'], page(() => import('@/features/employees/EmployeeFormPage'))) },
          { path: 'employees/import', element: guard(['employees.import'], page(() => import('@/features/employees/EmployeeImportPage'))) },
          { path: 'employees/:id', element: guard(['employees.view'], page(() => import('@/features/employees/EmployeeProfilePage'))) },
          { path: 'employees/:id/edit', element: guard(['employees.update'], page(() => import('@/features/employees/EmployeeFormPage'))) },
          { path: 'departments', element: guard(['departments.manage', 'employees.view'], page(() => import('@/features/organisation/DepartmentsPage'))) },
          { path: 'designations', element: guard(['departments.manage', 'employees.view'], page(() => import('@/features/organisation/DesignationsPage'))) },
          { path: 'org-chart', element: guard(['employees.view'], page(() => import('@/features/organisation/OrgChartPage'))) },

          // Attendance
          { path: 'attendance', element: guard(['attendance.view'], page(() => import('@/features/attendance/AttendancePage'))) },
          { path: 'attendance/approvals', element: guard(['attendance.approve'], page(() => import('@/features/attendance/CheckInApprovalsPage'))) },
          { path: 'attendance/bulk', element: guard(['attendance.manage'], page(() => import('@/features/attendance/BulkAttendancePage'))) },
          { path: 'attendance/shifts', element: guard(['shifts.manage', 'attendance.view'], page(() => import('@/features/attendance/ShiftsPage'))) },
          { path: 'attendance/holidays', element: guard(['shifts.manage', 'attendance.view'], page(() => import('@/features/attendance/HolidaysPage'))) },

          // Leave
          { path: 'leave/requests', element: guard(['leave.view'], page(() => import('@/features/leave/LeaveRequestsPage'))) },
          { path: 'leave/types', element: guard(['leave.manage'], page(() => import('@/features/leave/LeaveTypesPage'))) },
          { path: 'leave/balances', element: guard(['leave.view'], page(() => import('@/features/leave/LeaveBalancesPage'))) },
          { path: 'leave/calendar', element: guard(['leave.view'], page(() => import('@/features/leave/LeaveCalendarPage'))) },

          // Payroll
          { path: 'payroll/structures', element: guard(['salary.view', 'salary.manage'], page(() => import('@/features/payroll/SalaryStructuresPage'))) },
          { path: 'payroll/runs', element: guard(['payroll.view'], page(() => import('@/features/payroll/PayrollRunsPage'))) },
          { path: 'payroll/runs/:id', element: guard(['payroll.view'], page(() => import('@/features/payroll/PayrollRunPage'))) },
          { path: 'payroll/register', element: guard(['payroll.view'], page(() => import('@/features/payroll/PayrollRegisterPage'))) },
          { path: 'payroll/payslips', element: guard(['payslips.view'], page(() => import('@/features/payroll/PayslipsPage'))) },
          { path: 'payslips/:id', element: page(() => import('@/features/payroll/PayslipPage')) },
          { path: 'payroll/tax', element: guard(['tax.manage'], page(() => import('@/features/payroll/TaxConfigPage'))) },

          // Other
          { path: 'reports', element: guard(['reports.view', 'reports.payroll'], page(() => import('@/features/reports/ReportsPage'))) },
          { path: 'reports/:category/:key', element: guard(['reports.view', 'reports.payroll'], page(() => import('@/features/reports/ReportViewPage'))) },
          { path: 'documents', element: guard(['documents.view'], page(() => import('@/features/documents/DocumentsPage'))) },
          { path: 'users', element: guard(['users.view', 'users.manage', 'roles.manage'], page(() => import('@/features/users/UsersPage'))) },
          { path: 'audit', element: guard(['audit.view'], page(() => import('@/features/audit/AuditLogsPage'))) },
          { path: 'settings', element: guard(['settings.view', 'settings.manage'], page(() => import('@/features/settings/SettingsPage'))) },
          { path: '*', element: page(() => import('@/pages/NotFoundPage')) },
        ],
      },
    ],
  },
  { path: '*', element: page(() => import('@/pages/NotFoundPage')) },
]);
