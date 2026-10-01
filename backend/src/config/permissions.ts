import type { DataScope } from '@prisma/client';

/**
 * Permission catalogue. Keys are checked on the server for every protected route;
 * the frontend only uses them to hide controls.
 */
export const PERMISSIONS = {
  // Platform
  'organisations.manage': { module: 'organisations', description: 'Create and manage organisations' },
  'settings.view': { module: 'settings', description: 'View organisation settings' },
  'settings.manage': { module: 'settings', description: 'Change organisation settings' },
  'users.view': { module: 'users', description: 'View users' },
  'users.manage': { module: 'users', description: 'Create, update and disable users' },
  'roles.manage': { module: 'users', description: 'Manage roles and permissions' },
  'audit.view': { module: 'audit', description: 'View audit logs' },
  'backups.manage': { module: 'settings', description: 'View and run backups' },

  // People
  'employees.view': { module: 'employees', description: 'View employee records' },
  'employees.create': { module: 'employees', description: 'Create employees' },
  'employees.update': { module: 'employees', description: 'Update employees' },
  'employees.delete': { module: 'employees', description: 'Delete (archive) employees' },
  'employees.view_sensitive': {
    module: 'employees',
    description: 'View citizenship, PAN, bank and personal contact details',
  },
  'employees.import': { module: 'employees', description: 'Import employees from CSV/Excel' },
  'departments.manage': { module: 'employees', description: 'Manage departments and designations' },
  'documents.view': { module: 'documents', description: 'View and download employee documents' },
  'documents.manage': { module: 'documents', description: 'Upload and delete employee documents' },

  // Attendance
  'attendance.view': { module: 'attendance', description: 'View attendance' },
  'attendance.manage': { module: 'attendance', description: 'Record and edit attendance' },
  'shifts.manage': { module: 'attendance', description: 'Manage shifts and holidays' },

  // Leave
  'leave.view': { module: 'leave', description: 'View leave requests and balances' },
  'leave.approve': { module: 'leave', description: 'Approve or reject leave (supervisor stage)' },
  'leave.manage': { module: 'leave', description: 'Final HR approval, leave types and balances' },

  // Payroll
  'salary.view': { module: 'payroll', description: 'View employee salaries' },
  'salary.manage': { module: 'payroll', description: 'Manage salary components and structures' },
  'payroll.view': { module: 'payroll', description: 'View payroll runs and register' },
  'payroll.process': { module: 'payroll', description: 'Generate and review payroll' },
  'payroll.approve': { module: 'payroll', description: 'Approve, pay and cancel payroll' },
  'payslips.view': { module: 'payroll', description: 'View all payslips' },
  'tax.manage': { module: 'payroll', description: 'Manage tax rules' },

  // Reports
  'reports.view': { module: 'reports', description: 'View HR reports' },
  'reports.payroll': { module: 'reports', description: 'View payroll reports' },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  dataScope: DataScope;
  permissions: PermissionKey[];
}

const except = (...excluded: PermissionKey[]) => ALL_PERMISSIONS.filter((p) => !excluded.includes(p));

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full system access, including organisations, roles and audit logs.',
    dataScope: 'ORGANISATION',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'hr_admin',
    name: 'HR Admin',
    description: 'Runs HR and payroll. Cannot manage organisations or roles.',
    dataScope: 'ORGANISATION',
    permissions: except('organisations.manage', 'roles.manage', 'backups.manage'),
  },
  {
    key: 'hr_officer',
    name: 'HR Officer',
    description: 'Maintains employee records, attendance, leave and documents. Read-only payroll.',
    dataScope: 'ORGANISATION',
    permissions: [
      'settings.view',
      'employees.view',
      'employees.create',
      'employees.update',
      'employees.view_sensitive',
      'employees.import',
      'documents.view',
      'documents.manage',
      'attendance.view',
      'attendance.manage',
      'shifts.manage',
      'leave.view',
      'leave.approve',
      'leave.manage',
      'payroll.view',
      'reports.view',
    ],
  },
  {
    key: 'manager',
    name: 'Manager / Supervisor',
    description: 'Sees their own team, approves team leave and views team reports.',
    dataScope: 'TEAM',
    permissions: ['employees.view', 'attendance.view', 'leave.view', 'leave.approve', 'reports.view'],
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Processes payroll, generates payslips and payroll reports.',
    dataScope: 'ORGANISATION',
    permissions: [
      'employees.view',
      'salary.view',
      'salary.manage',
      'payroll.view',
      'payroll.process',
      'payroll.approve',
      'payslips.view',
      'tax.manage',
      'reports.payroll',
      'attendance.view',
      'leave.view',
    ],
  },
  {
    key: 'employee',
    name: 'Employee',
    description: 'Self-service: own profile, attendance, leave, payslips and documents.',
    dataScope: 'SELF',
    permissions: [],
  },
];
