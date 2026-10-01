import {
  BarChart3,
  Bell,
  Clock,
  FolderOpen,
  LayoutDashboard,
  type LucideIcon,
  Plane,
  ScrollText,
  Settings,
  ShieldCheck,
  User,
  Users,
  Wallet,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon?: LucideIcon;
  /** Visible when the user has any of these permissions. Empty = everyone. */
  permissions?: string[];
  /** Only for users linked to an employee record. */
  employeeOnly?: boolean;
  end?: boolean;
}

export interface NavGroup {
  labelKey?: string;
  icon?: LucideIcon;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { items: [{ to: '/app', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true, permissions: ['employees.view', 'payroll.view', 'reports.view', 'reports.payroll', 'attendance.view'] }] },
  {
    labelKey: 'nav.mySpace',
    icon: User,
    items: [
      { to: '/app/me', labelKey: 'nav.myDashboard', employeeOnly: true, end: true },
      { to: '/app/me/attendance', labelKey: 'nav.myAttendance', employeeOnly: true },
      { to: '/app/me/leave', labelKey: 'nav.myLeave', employeeOnly: true },
      { to: '/app/me/payslips', labelKey: 'nav.myPayslips', employeeOnly: true },
      { to: '/app/me/documents', labelKey: 'nav.myDocuments', employeeOnly: true },
      { to: '/app/me/profile', labelKey: 'nav.myProfile', employeeOnly: true },
    ],
  },
  {
    labelKey: 'nav.people',
    icon: Users,
    items: [
      { to: '/app/employees', labelKey: 'nav.employees', permissions: ['employees.view'] },
      { to: '/app/departments', labelKey: 'nav.departments', permissions: ['departments.manage', 'employees.view'] },
      { to: '/app/designations', labelKey: 'nav.designations', permissions: ['departments.manage', 'employees.view'] },
      { to: '/app/org-chart', labelKey: 'nav.orgChart', permissions: ['employees.view'] },
    ],
  },
  {
    labelKey: 'nav.attendance',
    icon: Clock,
    items: [
      { to: '/app/attendance', labelKey: 'nav.attendanceRecords', permissions: ['attendance.view'], end: true },
      { to: '/app/attendance/shifts', labelKey: 'nav.shifts', permissions: ['shifts.manage', 'attendance.view'] },
      { to: '/app/attendance/holidays', labelKey: 'nav.holidays', permissions: ['shifts.manage', 'attendance.view'] },
    ],
  },
  {
    labelKey: 'nav.leave',
    icon: Plane,
    items: [
      { to: '/app/leave/requests', labelKey: 'nav.leaveRequests', permissions: ['leave.view'] },
      { to: '/app/leave/types', labelKey: 'nav.leaveTypes', permissions: ['leave.manage'] },
      { to: '/app/leave/balances', labelKey: 'nav.leaveBalances', permissions: ['leave.view'] },
      { to: '/app/leave/calendar', labelKey: 'nav.leaveCalendar', permissions: ['leave.view'] },
    ],
  },
  {
    labelKey: 'nav.payroll',
    icon: Wallet,
    items: [
      { to: '/app/payroll/structures', labelKey: 'nav.salaryStructures', permissions: ['salary.view', 'salary.manage'] },
      { to: '/app/payroll/runs', labelKey: 'nav.payrollRuns', permissions: ['payroll.view'] },
      { to: '/app/payroll/payslips', labelKey: 'nav.payslips', permissions: ['payslips.view'] },
      { to: '/app/payroll/register', labelKey: 'nav.payrollRegister', permissions: ['payroll.view'] },
      { to: '/app/payroll/tax', labelKey: 'nav.taxConfig', permissions: ['tax.manage'] },
    ],
  },
  {
    items: [
      { to: '/app/reports', labelKey: 'nav.reports', icon: BarChart3, permissions: ['reports.view', 'reports.payroll'] },
      { to: '/app/documents', labelKey: 'nav.documents', icon: FolderOpen, permissions: ['documents.view'] },
      { to: '/app/notifications', labelKey: 'nav.notifications', icon: Bell },
      { to: '/app/users', labelKey: 'nav.usersRoles', icon: ShieldCheck, permissions: ['users.view', 'users.manage', 'roles.manage'] },
      { to: '/app/audit', labelKey: 'nav.auditLogs', icon: ScrollText, permissions: ['audit.view'] },
      { to: '/app/settings', labelKey: 'nav.settings', icon: Settings, permissions: ['settings.view', 'settings.manage'] },
    ],
  },
];

export function visibleNav(can: (...p: string[]) => boolean, hasEmployee: boolean): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.permissions || i.permissions.length === 0 || can(...i.permissions)) && (!i.employeeOnly || hasEmployee)),
  })).filter((g) => g.items.length > 0);
}

