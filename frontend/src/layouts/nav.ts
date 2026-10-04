import {
  Banknote,
  BarChart3,
  Briefcase,
  Building2,
  ClipboardCheck,
  CalendarCheck,
  CalendarRange,
  FileText,
  Gauge,
  Layers,
  ListChecks,
  Network,
  PartyPopper,
  Percent,
  Receipt,
  Scale,
  TableProperties,
  Tags,
  Timer,
  UserRound,
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
  /** Live counter shown next to the label (see useNavBadges). */
  badge?: 'checkinApprovals';
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
      { to: '/app/me', labelKey: 'nav.myDashboard', icon: Gauge, employeeOnly: true, end: true },
      { to: '/app/me/attendance', labelKey: 'nav.myAttendance', icon: CalendarCheck, employeeOnly: true },
      { to: '/app/me/leave', labelKey: 'nav.myLeave', icon: Plane, employeeOnly: true },
      { to: '/app/me/payslips', labelKey: 'nav.myPayslips', icon: Receipt, employeeOnly: true },
      { to: '/app/me/documents', labelKey: 'nav.myDocuments', icon: FileText, employeeOnly: true },
      { to: '/app/me/profile', labelKey: 'nav.myProfile', icon: UserRound, employeeOnly: true },
    ],
  },
  {
    labelKey: 'nav.people',
    icon: Users,
    items: [
      { to: '/app/employees', labelKey: 'nav.employees', icon: Users, permissions: ['employees.view'] },
      { to: '/app/departments', labelKey: 'nav.departments', icon: Building2, permissions: ['departments.manage', 'employees.view'] },
      { to: '/app/designations', labelKey: 'nav.designations', icon: Briefcase, permissions: ['departments.manage', 'employees.view'] },
      { to: '/app/org-chart', labelKey: 'nav.orgChart', icon: Network, permissions: ['employees.view'] },
    ],
  },
  {
    labelKey: 'nav.attendance',
    icon: Clock,
    items: [
      { to: '/app/attendance', labelKey: 'nav.attendanceRecords', icon: Clock, permissions: ['attendance.view'], end: true },
      { to: '/app/attendance/approvals', labelKey: 'nav.checkinApprovals', icon: ClipboardCheck, permissions: ['attendance.approve'], badge: 'checkinApprovals' },
      { to: '/app/attendance/shifts', labelKey: 'nav.shifts', icon: Timer, permissions: ['shifts.manage', 'attendance.view'] },
      { to: '/app/attendance/holidays', labelKey: 'nav.holidays', icon: PartyPopper, permissions: ['shifts.manage', 'attendance.view'] },
    ],
  },
  {
    labelKey: 'nav.leave',
    icon: Plane,
    items: [
      { to: '/app/leave/requests', labelKey: 'nav.leaveRequests', icon: ListChecks, permissions: ['leave.view'] },
      { to: '/app/leave/types', labelKey: 'nav.leaveTypes', icon: Tags, permissions: ['leave.manage'] },
      { to: '/app/leave/balances', labelKey: 'nav.leaveBalances', icon: Scale, permissions: ['leave.view'] },
      { to: '/app/leave/calendar', labelKey: 'nav.leaveCalendar', icon: CalendarRange, permissions: ['leave.view'] },
    ],
  },
  {
    labelKey: 'nav.payroll',
    icon: Wallet,
    items: [
      { to: '/app/payroll/structures', labelKey: 'nav.salaryStructures', icon: Layers, permissions: ['salary.view', 'salary.manage'] },
      { to: '/app/payroll/runs', labelKey: 'nav.payrollRuns', icon: Banknote, permissions: ['payroll.view'] },
      { to: '/app/payroll/payslips', labelKey: 'nav.payslips', icon: Receipt, permissions: ['payslips.view'] },
      { to: '/app/payroll/register', labelKey: 'nav.payrollRegister', icon: TableProperties, permissions: ['payroll.view'] },
      { to: '/app/payroll/tax', labelKey: 'nav.taxConfig', icon: Percent, permissions: ['tax.manage'] },
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

