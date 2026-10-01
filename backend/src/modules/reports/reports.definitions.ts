import type { Prisma } from '@prisma/client';
import type { PermissionKey } from '../../config/permissions';
import { prisma } from '../../lib/prisma';
import { employeeScope } from '../../services/access.service';
import type { ExportColumn } from '../../services/export.service';
import type { AuthContext } from '../../types/express';
import { addDays, formatDateOnly, monthRange, parseDateOnly, todayIn } from '../../utils/dates';
import { round2, toNumber } from '../../utils/money';
import { EXIT_STATUSES } from '../employees/employees.schemas';
import { fullName } from '../employees/employees.service';
import { periodLabel } from '../payroll/payroll.service';
import { balances as leaveBalances } from '../leave/leave.service';

export interface ReportFilters {
  from: Date;
  to: Date;
  departmentId?: string;
  employeeId?: string;
  year: number;
  month: number;
  leaveTypeId?: string;
}

export interface ReportResult {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  /** Headline figures shown above the table. */
  summary?: { label: string; value: string | number }[];
  /** Optional chart series: [{ label, value }]. */
  chart?: { label: string; value: number }[];
}

export interface ReportDefinition {
  key: string;
  category: 'employees' | 'attendance' | 'leave' | 'payroll';
  title: string;
  description: string;
  permission: PermissionKey;
  /** Which filters the UI should show. */
  filters: ('dateRange' | 'date' | 'period' | 'year' | 'department' | 'employee' | 'leaveType')[];
  run(auth: AuthContext, f: ReportFilters): Promise<ReportResult>;
}

const empFilter = (auth: AuthContext, f: ReportFilters): Prisma.EmployeeWhereInput => ({
  AND: [employeeScope(auth), f.departmentId ? { departmentId: f.departmentId } : {}, f.employeeId ? { id: f.employeeId } : {}],
});

const empCols: ExportColumn[] = [
  { key: 'employeeCode', header: 'Employee ID' },
  { key: 'name', header: 'Employee', width: 2 },
  { key: 'department', header: 'Department', width: 1.5 },
];

const pct = (n: number) => `${round2(n)}%`;

async function payrollForPeriod(orgId: string, year: number, month: number) {
  return prisma.payroll.findFirst({ where: { organisationId: orgId, year, month, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } });
}

export const REPORTS: ReportDefinition[] = [
  // ── Employees ─────────────────────────────────────────────
  {
    key: 'employee-list',
    category: 'employees',
    title: 'Employee list',
    description: 'Current employees with department, designation and status.',
    permission: 'reports.view',
    filters: ['department'],
    async run(auth, f) {
      const rows = await prisma.employee.findMany({
        where: { AND: [empFilter(auth, f), { status: { notIn: [...EXIT_STATUSES] } }] },
        include: { department: true, designation: true, manager: true },
        orderBy: { employeeCode: 'asc' },
      });
      return {
        columns: [...empCols, { key: 'designation', header: 'Designation', width: 1.5 }, { key: 'manager', header: 'Manager', width: 1.5 }, { key: 'joinDate', header: 'Joined', format: 'date' }, { key: 'type', header: 'Type' }, { key: 'status', header: 'Status' }],
        rows: rows.map((e) => ({
          employeeCode: e.employeeCode,
          name: fullName(e),
          department: e.department?.name,
          designation: e.designation?.name,
          manager: e.manager ? fullName(e.manager) : '',
          joinDate: formatDateOnly(e.joinDate),
          type: e.employmentType,
          status: e.status,
        })),
        summary: [{ label: 'Employees', value: rows.length }],
      };
    },
  },
  {
    key: 'department-headcount',
    category: 'employees',
    title: 'Department headcount',
    description: 'Active headcount per department, by gender and employment type.',
    permission: 'reports.view',
    filters: [],
    async run(auth) {
      const emps = await prisma.employee.findMany({
        where: { AND: [employeeScope(auth), { status: { notIn: [...EXIT_STATUSES] } }] },
        select: { gender: true, employmentType: true, department: { select: { name: true } } },
      });
      const map = new Map<string, { department: string; total: number; male: number; female: number; other: number; fullTime: number; contract: number; other_types: number }>();
      for (const e of emps) {
        const name = e.department?.name ?? 'Unassigned';
        const r = map.get(name) ?? { department: name, total: 0, male: 0, female: 0, other: 0, fullTime: 0, contract: 0, other_types: 0 };
        r.total++;
        if (e.gender === 'MALE') r.male++;
        else if (e.gender === 'FEMALE') r.female++;
        else r.other++;
        if (e.employmentType === 'FULL_TIME') r.fullTime++;
        else if (e.employmentType === 'CONTRACT') r.contract++;
        else r.other_types++;
        map.set(name, r);
      }
      const rows = [...map.values()].sort((a, b) => b.total - a.total);
      const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
      return {
        columns: [
          { key: 'department', header: 'Department', width: 2 },
          { key: 'total', header: 'Headcount', format: 'number' },
          { key: 'male', header: 'Male', format: 'number' },
          { key: 'female', header: 'Female', format: 'number' },
          { key: 'other', header: 'Other/Not set', format: 'number' },
          { key: 'fullTime', header: 'Full time', format: 'number' },
          { key: 'contract', header: 'Contract', format: 'number' },
          { key: 'other_types', header: 'Other types', format: 'number' },
        ],
        rows,
        totals: { department: 'Total', total: sum('total'), male: sum('male'), female: sum('female'), other: sum('other'), fullTime: sum('fullTime'), contract: sum('contract'), other_types: sum('other_types') },
        chart: rows.map((r) => ({ label: r.department, value: r.total })),
      };
    },
  },
  {
    key: 'designation',
    category: 'employees',
    title: 'Designation report',
    description: 'Headcount per designation.',
    permission: 'reports.view',
    filters: ['department'],
    async run(auth, f) {
      const grouped = await prisma.employee.groupBy({
        by: ['designationId'],
        where: { AND: [empFilter(auth, f), { status: { notIn: [...EXIT_STATUSES] } }] },
        _count: true,
      });
      const designations = await prisma.designation.findMany({ where: { organisationId: auth.organisationId }, include: { department: true } });
      const rows = grouped
        .map((g) => {
          const d = designations.find((x) => x.id === g.designationId);
          return { designation: d?.name ?? 'Unassigned', department: d?.department?.name ?? '', level: d?.level ?? '', count: g._count };
        })
        .sort((a, b) => b.count - a.count);
      return {
        columns: [{ key: 'designation', header: 'Designation', width: 2 }, { key: 'department', header: 'Department', width: 1.5 }, { key: 'level', header: 'Level', format: 'number' }, { key: 'count', header: 'Employees', format: 'number' }],
        rows,
        totals: { designation: 'Total', count: rows.reduce((s, r) => s + r.count, 0) },
      };
    },
  },
  {
    key: 'new-joiners',
    category: 'employees',
    title: 'New joiners',
    description: 'Employees who joined within the date range.',
    permission: 'reports.view',
    filters: ['dateRange', 'department'],
    async run(auth, f) {
      const rows = await prisma.employee.findMany({
        where: { AND: [empFilter(auth, f), { joinDate: { gte: f.from, lte: f.to } }] },
        include: { department: true, designation: true },
        orderBy: { joinDate: 'desc' },
      });
      return {
        columns: [...empCols, { key: 'designation', header: 'Designation', width: 1.5 }, { key: 'joinDate', header: 'Joined', format: 'date' }, { key: 'type', header: 'Type' }, { key: 'status', header: 'Status' }],
        rows: rows.map((e) => ({ employeeCode: e.employeeCode, name: fullName(e), department: e.department?.name, designation: e.designation?.name, joinDate: formatDateOnly(e.joinDate), type: e.employmentType, status: e.status })),
        summary: [{ label: 'New joiners', value: rows.length }],
      };
    },
  },
  {
    key: 'resigned',
    category: 'employees',
    title: 'Resigned & exited employees',
    description: 'Employees who resigned, were terminated or retired within the date range.',
    permission: 'reports.view',
    filters: ['dateRange', 'department'],
    async run(auth, f) {
      const scope = { AND: [employeeScope(auth), f.departmentId ? { departmentId: f.departmentId } : {}] };
      const rows = await prisma.employee.findMany({
        where: { AND: [scope, { status: { in: [...EXIT_STATUSES] }, exitDate: { gte: f.from, lte: f.to } }] },
        include: { department: true, designation: true },
        orderBy: { exitDate: 'desc' },
      });
      return {
        columns: [...empCols, { key: 'designation', header: 'Designation', width: 1.5 }, { key: 'joinDate', header: 'Joined', format: 'date' }, { key: 'exitDate', header: 'Exited', format: 'date' }, { key: 'status', header: 'Reason' }, { key: 'tenure', header: 'Tenure (months)', format: 'number' }],
        rows: rows.map((e) => ({
          employeeCode: e.employeeCode,
          name: fullName(e),
          department: e.department?.name,
          designation: e.designation?.name,
          joinDate: formatDateOnly(e.joinDate),
          exitDate: e.exitDate ? formatDateOnly(e.exitDate) : '',
          status: e.status,
          tenure: e.exitDate ? Math.round((e.exitDate.getTime() - e.joinDate.getTime()) / (30.44 * 86_400_000)) : '',
        })),
        summary: [{ label: 'Exits', value: rows.length }],
      };
    },
  },
  {
    key: 'turnover',
    category: 'employees',
    title: 'Employee turnover',
    description: 'Monthly joiners, leavers and turnover rate.',
    permission: 'reports.view',
    filters: ['dateRange', 'department'],
    async run(auth, f) {
      const emps = await prisma.employee.findMany({
        where: { AND: [employeeScope(auth), f.departmentId ? { departmentId: f.departmentId } : {}] },
        select: { joinDate: true, exitDate: true, status: true },
      });
      const rows: Record<string, unknown>[] = [];
      let cursor = new Date(Date.UTC(f.from.getUTCFullYear(), f.from.getUTCMonth(), 1));
      let totalLeavers = 0;
      let headcountSum = 0;
      while (cursor <= f.to && rows.length < 36) {
        const { start, end } = monthRange(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
        const activeOn = (d: Date) => emps.filter((e) => e.joinDate <= d && (!e.exitDate || e.exitDate >= d)).length;
        const opening = activeOn(start);
        const closing = activeOn(end);
        const joiners = emps.filter((e) => e.joinDate >= start && e.joinDate <= end).length;
        const leavers = emps.filter((e) => e.exitDate && e.exitDate >= start && e.exitDate <= end).length;
        const avg = (opening + closing) / 2;
        totalLeavers += leavers;
        headcountSum += avg;
        rows.push({ month: periodLabel(start.getUTCFullYear(), start.getUTCMonth() + 1), opening, joiners, leavers, closing, turnover: avg ? pct((leavers / avg) * 100) : '0%' });
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      }
      const avgHeadcount = rows.length ? headcountSum / rows.length : 0;
      return {
        columns: [
          { key: 'month', header: 'Month', width: 1.5 },
          { key: 'opening', header: 'Opening', format: 'number' },
          { key: 'joiners', header: 'Joiners', format: 'number' },
          { key: 'leavers', header: 'Leavers', format: 'number' },
          { key: 'closing', header: 'Closing', format: 'number' },
          { key: 'turnover', header: 'Turnover' },
        ],
        rows,
        summary: [
          { label: 'Leavers in period', value: totalLeavers },
          { label: 'Turnover for period', value: avgHeadcount ? pct((totalLeavers / avgHeadcount) * 100) : '0%' },
        ],
        chart: rows.map((r) => ({ label: String(r.month), value: Number(r.leavers) })),
      };
    },
  },

  // ── Attendance ────────────────────────────────────────────
  {
    key: 'daily-attendance',
    category: 'attendance',
    title: 'Daily attendance',
    description: 'Every attendance record for one day.',
    permission: 'reports.view',
    filters: ['date', 'department', 'employee'],
    async run(auth, f) {
      const rows = await prisma.attendance.findMany({
        where: { organisationId: auth.organisationId, date: f.from, employee: empFilter(auth, f) },
        include: { employee: { include: { department: true } } },
        orderBy: { employee: { firstName: 'asc' } },
      });
      const count = (s: string[]) => rows.filter((r) => s.includes(r.status)).length;
      return {
        columns: [...empCols, { key: 'status', header: 'Status' }, { key: 'checkIn', header: 'In' }, { key: 'checkOut', header: 'Out' }, { key: 'lateMinutes', header: 'Late (min)', format: 'number' }, { key: 'overtimeMinutes', header: 'OT (min)', format: 'number' }, { key: 'remarks', header: 'Remarks', width: 2 }],
        rows: rows.map((r) => ({ employeeCode: r.employee.employeeCode, name: fullName(r.employee), department: r.employee.department?.name, status: r.status, checkIn: r.checkIn, checkOut: r.checkOut, lateMinutes: r.lateMinutes, overtimeMinutes: r.overtimeMinutes, remarks: r.remarks })),
        summary: [
          { label: 'Present', value: count(['PRESENT', 'LATE', 'WORK_FROM_HOME', 'HALF_DAY']) },
          { label: 'Late', value: count(['LATE']) },
          { label: 'Absent', value: count(['ABSENT']) },
          { label: 'On leave', value: count(['LEAVE']) },
        ],
      };
    },
  },
  {
    key: 'monthly-attendance',
    category: 'attendance',
    title: 'Monthly attendance summary',
    description: 'Per-employee totals for the date range.',
    permission: 'reports.view',
    filters: ['dateRange', 'department', 'employee'],
    async run(auth, f) {
      const [emps, records] = await Promise.all([
        prisma.employee.findMany({ where: { AND: [empFilter(auth, f), { joinDate: { lte: f.to } }, { OR: [{ exitDate: null }, { exitDate: { gte: f.from } }] }] }, include: { department: true }, orderBy: { employeeCode: 'asc' } }),
        prisma.attendance.findMany({ where: { organisationId: auth.organisationId, date: { gte: f.from, lte: f.to }, employee: empFilter(auth, f) } }),
      ]);
      const rows = emps.map((e) => {
        const r = records.filter((a) => a.employeeId === e.id);
        const c = (s: string) => r.filter((a) => a.status === s).length;
        return {
          employeeCode: e.employeeCode,
          name: fullName(e),
          department: e.department?.name,
          present: c('PRESENT') + c('LATE'),
          wfh: c('WORK_FROM_HOME'),
          halfDay: c('HALF_DAY'),
          late: c('LATE'),
          absent: c('ABSENT'),
          leave: c('LEAVE'),
          lateMinutes: r.reduce((s, a) => s + a.lateMinutes, 0),
          overtimeHours: round2(r.reduce((s, a) => s + a.overtimeMinutes, 0) / 60),
        };
      });
      return {
        columns: [
          ...empCols,
          { key: 'present', header: 'Present', format: 'number' },
          { key: 'wfh', header: 'WFH', format: 'number' },
          { key: 'halfDay', header: 'Half day', format: 'number' },
          { key: 'late', header: 'Late', format: 'number' },
          { key: 'absent', header: 'Absent', format: 'number' },
          { key: 'leave', header: 'Leave', format: 'number' },
          { key: 'lateMinutes', header: 'Late (min)', format: 'number' },
          { key: 'overtimeHours', header: 'OT (hrs)', format: 'number' },
        ],
        rows,
      };
    },
  },
  {
    key: 'late',
    category: 'attendance',
    title: 'Late arrivals',
    description: 'Every late check-in in the date range.',
    permission: 'reports.view',
    filters: ['dateRange', 'department', 'employee'],
    async run(auth, f) {
      const rows = await prisma.attendance.findMany({
        where: { organisationId: auth.organisationId, status: 'LATE', date: { gte: f.from, lte: f.to }, employee: empFilter(auth, f) },
        include: { employee: { include: { department: true } }, shift: true },
        orderBy: [{ date: 'desc' }, { lateMinutes: 'desc' }],
      });
      return {
        columns: [{ key: 'date', header: 'Date', format: 'date' }, ...empCols, { key: 'shiftStart', header: 'Shift start' }, { key: 'checkIn', header: 'Checked in' }, { key: 'lateMinutes', header: 'Late (min)', format: 'number' }],
        rows: rows.map((r) => ({ date: formatDateOnly(r.date), employeeCode: r.employee.employeeCode, name: fullName(r.employee), department: r.employee.department?.name, shiftStart: r.shift?.startTime, checkIn: r.checkIn, lateMinutes: r.lateMinutes })),
        summary: [
          { label: 'Late arrivals', value: rows.length },
          { label: 'Average minutes late', value: rows.length ? Math.round(rows.reduce((s, r) => s + r.lateMinutes, 0) / rows.length) : 0 },
        ],
      };
    },
  },
  {
    key: 'absence',
    category: 'attendance',
    title: 'Absence report',
    description: 'Days marked absent in the date range.',
    permission: 'reports.view',
    filters: ['dateRange', 'department', 'employee'],
    async run(auth, f) {
      const rows = await prisma.attendance.findMany({
        where: { organisationId: auth.organisationId, status: 'ABSENT', date: { gte: f.from, lte: f.to }, employee: empFilter(auth, f) },
        include: { employee: { include: { department: true } } },
        orderBy: { date: 'desc' },
      });
      return {
        columns: [{ key: 'date', header: 'Date', format: 'date' }, ...empCols, { key: 'remarks', header: 'Remarks', width: 2 }],
        rows: rows.map((r) => ({ date: formatDateOnly(r.date), employeeCode: r.employee.employeeCode, name: fullName(r.employee), department: r.employee.department?.name, remarks: r.remarks })),
        summary: [{ label: 'Absent days', value: rows.length }],
      };
    },
  },
  {
    key: 'overtime',
    category: 'attendance',
    title: 'Overtime report',
    description: 'Overtime hours per employee in the date range.',
    permission: 'reports.view',
    filters: ['dateRange', 'department', 'employee'],
    async run(auth, f) {
      const grouped = await prisma.attendance.groupBy({
        by: ['employeeId'],
        where: { organisationId: auth.organisationId, date: { gte: f.from, lte: f.to }, overtimeMinutes: { gt: 0 }, employee: empFilter(auth, f) },
        _sum: { overtimeMinutes: true },
        _count: true,
      });
      const emps = await prisma.employee.findMany({ where: { id: { in: grouped.map((g) => g.employeeId) } }, include: { department: true } });
      const rows = grouped
        .map((g) => {
          const e = emps.find((x) => x.id === g.employeeId)!;
          return { employeeCode: e.employeeCode, name: fullName(e), department: e.department?.name, days: g._count, hours: round2((g._sum.overtimeMinutes ?? 0) / 60) };
        })
        .sort((a, b) => b.hours - a.hours);
      return {
        columns: [...empCols, { key: 'days', header: 'Days with OT', format: 'number' }, { key: 'hours', header: 'OT hours', format: 'number' }],
        rows,
        totals: { name: 'Total', days: rows.reduce((s, r) => s + r.days, 0), hours: round2(rows.reduce((s, r) => s + r.hours, 0)) },
      };
    },
  },

  // ── Leave ─────────────────────────────────────────────────
  {
    key: 'leave-balance',
    category: 'leave',
    title: 'Leave balances',
    description: 'Entitlement, usage and remaining days per employee and leave type.',
    permission: 'reports.view',
    filters: ['year', 'department', 'employee', 'leaveType'],
    async run(auth, f) {
      const rows = await leaveBalances(auth, { year: f.year, departmentId: f.departmentId, employeeId: f.employeeId, leaveTypeId: f.leaveTypeId });
      return {
        columns: [
          { key: 'employeeCode', header: 'Employee ID' },
          { key: 'name', header: 'Employee', width: 2 },
          { key: 'department', header: 'Department', width: 1.5 },
          { key: 'leaveType', header: 'Leave type', width: 1.5 },
          { key: 'entitled', header: 'Entitled', format: 'number' },
          { key: 'carriedForward', header: 'Carried fwd', format: 'number' },
          { key: 'adjusted', header: 'Adjusted', format: 'number' },
          { key: 'used', header: 'Used', format: 'number' },
          { key: 'pending', header: 'Pending', format: 'number' },
          { key: 'remaining', header: 'Remaining', format: 'number' },
        ],
        rows: rows.map((b) => ({ employeeCode: b.employee.employeeCode, name: b.employee.fullName, department: b.employee.department?.name, leaveType: b.leaveType.name, entitled: b.entitled, carriedForward: b.carriedForward, adjusted: b.adjusted, used: b.used, pending: b.pending, remaining: b.remaining })),
      };
    },
  },
  {
    key: 'leave-usage',
    category: 'leave',
    title: 'Leave usage',
    description: 'Approved leave days per employee and type within the date range.',
    permission: 'reports.view',
    filters: ['dateRange', 'department', 'employee', 'leaveType'],
    async run(auth, f) {
      const reqs = await prisma.leaveRequest.findMany({
        where: { organisationId: auth.organisationId, status: 'APPROVED', startDate: { lte: f.to }, endDate: { gte: f.from }, employee: empFilter(auth, f), ...(f.leaveTypeId ? { leaveTypeId: f.leaveTypeId } : {}) },
        include: { employee: { include: { department: true } }, leaveType: true },
      });
      const map = new Map<string, Record<string, unknown> & { days: number; requests: number }>();
      for (const r of reqs) {
        const key = `${r.employeeId}|${r.leaveTypeId}`;
        const row = map.get(key) ?? { employeeCode: r.employee.employeeCode, name: fullName(r.employee), department: r.employee.department?.name, leaveType: r.leaveType.name, requests: 0, days: 0 };
        row.requests++;
        row.days = round2(row.days + toNumber(r.totalDays));
        map.set(key, row);
      }
      const rows = [...map.values()].sort((a, b) => b.days - a.days);
      const byType = new Map<string, number>();
      rows.forEach((r) => byType.set(String(r.leaveType), (byType.get(String(r.leaveType)) ?? 0) + r.days));
      return {
        columns: [...empCols, { key: 'leaveType', header: 'Leave type', width: 1.5 }, { key: 'requests', header: 'Requests', format: 'number' }, { key: 'days', header: 'Days', format: 'number' }],
        rows,
        totals: { name: 'Total', requests: rows.reduce((s, r) => s + r.requests, 0), days: round2(rows.reduce((s, r) => s + r.days, 0)) },
        chart: [...byType.entries()].map(([label, value]) => ({ label, value })),
      };
    },
  },
  {
    key: 'leave-by-department',
    category: 'leave',
    title: 'Leave by department',
    description: 'Approved leave days per department and leave type.',
    permission: 'reports.view',
    filters: ['dateRange', 'leaveType'],
    async run(auth, f) {
      const reqs = await prisma.leaveRequest.findMany({
        where: { organisationId: auth.organisationId, status: 'APPROVED', startDate: { lte: f.to }, endDate: { gte: f.from }, employee: employeeScope(auth), ...(f.leaveTypeId ? { leaveTypeId: f.leaveTypeId } : {}) },
        include: { employee: { include: { department: true } }, leaveType: true },
      });
      const types = [...new Set(reqs.map((r) => r.leaveType.name))].sort();
      const map = new Map<string, Record<string, number | string>>();
      for (const r of reqs) {
        const dept = r.employee.department?.name ?? 'Unassigned';
        const row = map.get(dept) ?? { department: dept, total: 0 };
        row[r.leaveType.name] = round2(Number(row[r.leaveType.name] ?? 0) + toNumber(r.totalDays));
        row.total = round2(Number(row.total) + toNumber(r.totalDays));
        map.set(dept, row);
      }
      const rows = [...map.values()];
      return {
        columns: [{ key: 'department', header: 'Department', width: 2 }, ...types.map((t) => ({ key: t, header: t, format: 'number' as const })), { key: 'total', header: 'Total days', format: 'number' }],
        rows,
        chart: rows.map((r) => ({ label: String(r.department), value: Number(r.total) })),
      };
    },
  },
  {
    key: 'leave-history',
    category: 'leave',
    title: 'Leave history',
    description: 'All leave requests in the date range with their outcome.',
    permission: 'reports.view',
    filters: ['dateRange', 'department', 'employee', 'leaveType'],
    async run(auth, f) {
      const rows = await prisma.leaveRequest.findMany({
        where: { organisationId: auth.organisationId, startDate: { lte: f.to }, endDate: { gte: f.from }, employee: empFilter(auth, f), ...(f.leaveTypeId ? { leaveTypeId: f.leaveTypeId } : {}) },
        include: { employee: { include: { department: true } }, leaveType: true },
        orderBy: { startDate: 'desc' },
      });
      return {
        columns: [...empCols, { key: 'leaveType', header: 'Type', width: 1.3 }, { key: 'from', header: 'From', format: 'date' }, { key: 'to', header: 'To', format: 'date' }, { key: 'days', header: 'Days', format: 'number' }, { key: 'status', header: 'Status' }, { key: 'reason', header: 'Reason', width: 2 }],
        rows: rows.map((r) => ({ employeeCode: r.employee.employeeCode, name: fullName(r.employee), department: r.employee.department?.name, leaveType: r.leaveType.name, from: formatDateOnly(r.startDate), to: formatDateOnly(r.endDate), days: toNumber(r.totalDays), status: r.status, reason: r.reason })),
      };
    },
  },

  // ── Payroll ───────────────────────────────────────────────
  {
    key: 'monthly-payroll',
    category: 'payroll',
    title: 'Monthly payroll',
    description: 'Payroll totals for each month of the year.',
    permission: 'reports.payroll',
    filters: ['year'],
    async run(auth, f) {
      const runs = await prisma.payroll.findMany({ where: { organisationId: auth.organisationId, year: f.year, status: { not: 'CANCELLED' } }, orderBy: { month: 'asc' } });
      const rows = runs.map((p) => ({ period: periodLabel(p.year, p.month), status: p.status, employees: p.employeeCount, gross: toNumber(p.totalGross), tax: toNumber(p.totalTax), deductions: toNumber(p.totalDeductions), net: toNumber(p.totalNet) }));
      const sum = (k: 'gross' | 'tax' | 'deductions' | 'net') => round2(rows.reduce((s, r) => s + r[k], 0));
      return {
        columns: [{ key: 'period', header: 'Period', width: 1.5 }, { key: 'status', header: 'Status' }, { key: 'employees', header: 'Employees', format: 'number' }, { key: 'gross', header: 'Gross', format: 'money' }, { key: 'tax', header: 'Tax', format: 'money' }, { key: 'deductions', header: 'Deductions', format: 'money' }, { key: 'net', header: 'Net', format: 'money' }],
        rows,
        totals: { period: 'Total', gross: sum('gross'), tax: sum('tax'), deductions: sum('deductions'), net: sum('net') },
        chart: rows.map((r) => ({ label: r.period, value: r.net })),
      };
    },
  },
  {
    key: 'payroll-register',
    category: 'payroll',
    title: 'Payroll register',
    description: 'Every employee in the month’s payroll with earnings and deductions.',
    permission: 'reports.payroll',
    filters: ['period', 'department'],
    async run(auth, f) {
      const run = await payrollForPeriod(auth.organisationId, f.year, f.month);
      if (!run) return { columns: [], rows: [], summary: [{ label: 'Payroll', value: `No payroll for ${periodLabel(f.year, f.month)}` }] };
      const items = await prisma.payrollItem.findMany({
        where: { payrollId: run.id, ...(f.departmentId || f.employeeId || auth.dataScope !== 'ORGANISATION' ? { employee: empFilter(auth, f) } : {}) },
        include: { components: true },
        orderBy: { employeeCode: 'asc' },
      });
      const rows = items.map((i) => ({
        employeeCode: i.employeeCode,
        name: i.employeeName,
        department: i.departmentName,
        basic: toNumber(i.basicSalary),
        allowances: toNumber(i.totalAllowances),
        gross: toNumber(i.grossSalary),
        tax: toNumber(i.taxAmount),
        pfSsf: toNumber(i.retirementContribution),
        other: toNumber(i.otherDeductions),
        net: toNumber(i.netSalary),
        status: run.status,
      }));
      const sum = (k: keyof (typeof rows)[number]) => round2(rows.reduce((s, r) => s + Number(r[k]), 0));
      return {
        columns: [...empCols, { key: 'basic', header: 'Basic', format: 'money' }, { key: 'allowances', header: 'Allowances', format: 'money' }, { key: 'gross', header: 'Gross', format: 'money' }, { key: 'tax', header: 'Tax', format: 'money' }, { key: 'pfSsf', header: 'PF/SSF', format: 'money' }, { key: 'other', header: 'Other ded.', format: 'money' }, { key: 'net', header: 'Net', format: 'money' }, { key: 'status', header: 'Status' }],
        rows,
        totals: { name: 'Total', basic: sum('basic'), allowances: sum('allowances'), gross: sum('gross'), tax: sum('tax'), pfSsf: sum('pfSsf'), other: sum('other'), net: sum('net') },
      };
    },
  },
  {
    key: 'department-payroll',
    category: 'payroll',
    title: 'Department payroll',
    description: 'Payroll cost per department for the month.',
    permission: 'reports.payroll',
    filters: ['period'],
    async run(auth, f) {
      const run = await payrollForPeriod(auth.organisationId, f.year, f.month);
      if (!run) return { columns: [], rows: [], summary: [{ label: 'Payroll', value: `No payroll for ${periodLabel(f.year, f.month)}` }] };
      const grouped = await prisma.payrollItem.groupBy({ by: ['departmentName'], where: { payrollId: run.id }, _sum: { grossSalary: true, taxAmount: true, totalDeductions: true, netSalary: true }, _count: true });
      const rows = grouped.map((g) => ({ department: g.departmentName ?? 'Unassigned', employees: g._count, gross: toNumber(g._sum.grossSalary), tax: toNumber(g._sum.taxAmount), deductions: toNumber(g._sum.totalDeductions), net: toNumber(g._sum.netSalary) })).sort((a, b) => b.gross - a.gross);
      const sum = (k: 'gross' | 'tax' | 'deductions' | 'net' | 'employees') => round2(rows.reduce((s, r) => s + r[k], 0));
      return {
        columns: [{ key: 'department', header: 'Department', width: 2 }, { key: 'employees', header: 'Employees', format: 'number' }, { key: 'gross', header: 'Gross', format: 'money' }, { key: 'tax', header: 'Tax', format: 'money' }, { key: 'deductions', header: 'Deductions', format: 'money' }, { key: 'net', header: 'Net', format: 'money' }],
        rows,
        totals: { department: 'Total', employees: sum('employees'), gross: sum('gross'), tax: sum('tax'), deductions: sum('deductions'), net: sum('net') },
        chart: rows.map((r) => ({ label: r.department, value: r.gross })),
      };
    },
  },
  {
    key: 'salary-summary',
    category: 'payroll',
    title: 'Salary summary',
    description: 'Current basic salary and salary structure for each employee.',
    permission: 'reports.payroll',
    filters: ['department', 'employee'],
    async run(auth, f) {
      const today = todayIn();
      const emps = await prisma.employee.findMany({
        where: { AND: [empFilter(auth, f), { status: { notIn: [...EXIT_STATUSES] } }] },
        include: {
          department: true,
          designation: true,
          salaries: { where: { effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, orderBy: { effectiveFrom: 'desc' }, take: 1, include: { structure: true, lines: { include: { component: true } } } },
        },
        orderBy: { employeeCode: 'asc' },
      });
      const rows = emps.map((e) => {
        const s = e.salaries[0];
        const basic = s ? toNumber(s.basicSalary) : 0;
        const fixedAllowances = s ? s.lines.filter((l) => l.component.type === 'EARNING').reduce((sum, l) => sum + (l.calculationType === 'FIXED' ? toNumber(l.value) : (basic * toNumber(l.value)) / 100), 0) : 0;
        return { employeeCode: e.employeeCode, name: fullName(e), department: e.department?.name, designation: e.designation?.name, structure: s?.structure?.name ?? '', effectiveFrom: s ? formatDateOnly(s.effectiveFrom) : '', basic, allowances: round2(fixedAllowances), monthlyGross: round2(basic + fixedAllowances) };
      });
      const sum = (k: 'basic' | 'allowances' | 'monthlyGross') => round2(rows.reduce((s, r) => s + r[k], 0));
      return {
        columns: [...empCols, { key: 'designation', header: 'Designation', width: 1.5 }, { key: 'structure', header: 'Structure', width: 1.5 }, { key: 'effectiveFrom', header: 'Effective', format: 'date' }, { key: 'basic', header: 'Basic', format: 'money' }, { key: 'allowances', header: 'Allowances', format: 'money' }, { key: 'monthlyGross', header: 'Monthly gross', format: 'money' }],
        rows,
        totals: { name: 'Total', basic: sum('basic'), allowances: sum('allowances'), monthlyGross: sum('monthlyGross') },
      };
    },
  },
  {
    key: 'deduction-summary',
    category: 'payroll',
    title: 'Deduction summary',
    description: 'Total of each deduction component for the month.',
    permission: 'reports.payroll',
    filters: ['period'],
    async run(auth, f) {
      const run = await payrollForPeriod(auth.organisationId, f.year, f.month);
      if (!run) return { columns: [], rows: [], summary: [{ label: 'Payroll', value: `No payroll for ${periodLabel(f.year, f.month)}` }] };
      const grouped = await prisma.payrollComponent.groupBy({ by: ['code', 'name', 'category'], where: { type: 'DEDUCTION', payrollItem: { payrollId: run.id } }, _sum: { amount: true }, _count: true });
      const rows = grouped.map((g) => ({ component: g.name, code: g.code, category: g.category, employees: g._count, amount: toNumber(g._sum.amount) })).sort((a, b) => b.amount - a.amount);
      return {
        columns: [{ key: 'component', header: 'Deduction', width: 2 }, { key: 'code', header: 'Code' }, { key: 'category', header: 'Category', width: 1.5 }, { key: 'employees', header: 'Employees', format: 'number' }, { key: 'amount', header: 'Amount', format: 'money' }],
        rows,
        totals: { component: 'Total', amount: round2(rows.reduce((s, r) => s + r.amount, 0)) },
        chart: rows.map((r) => ({ label: r.component, value: r.amount })),
      };
    },
  },
  {
    key: 'tax-summary',
    category: 'payroll',
    title: 'Tax summary',
    description: 'Tax deducted per employee across approved or paid payroll in the date range.',
    permission: 'reports.payroll',
    filters: ['dateRange', 'department', 'employee'],
    async run(auth, f) {
      const items = await prisma.payrollItem.findMany({
        where: {
          payroll: { organisationId: auth.organisationId, status: { in: ['APPROVED', 'PAID'] }, periodStart: { lte: f.to }, periodEnd: { gte: f.from } },
          ...(f.departmentId || f.employeeId || auth.dataScope !== 'ORGANISATION' ? { employee: empFilter(auth, f) } : {}),
        },
        include: { employee: { select: { panNumber: true } } },
      });
      const map = new Map<string, { employeeCode: string; name: string; department: string | null; pan: string | null; months: number; taxable: number; tax: number }>();
      for (const i of items) {
        const r = map.get(i.employeeId) ?? { employeeCode: i.employeeCode, name: i.employeeName, department: i.departmentName, pan: i.employee.panNumber, months: 0, taxable: 0, tax: 0 };
        r.months++;
        r.taxable = round2(r.taxable + toNumber(i.taxableIncome));
        r.tax = round2(r.tax + toNumber(i.taxAmount));
        map.set(i.employeeId, r);
      }
      const rows = [...map.values()].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
      return {
        columns: [...empCols, { key: 'pan', header: 'PAN' }, { key: 'months', header: 'Months', format: 'number' }, { key: 'taxable', header: 'Taxable income', format: 'money' }, { key: 'tax', header: 'Tax deducted', format: 'money' }],
        rows,
        totals: { name: 'Total', taxable: round2(rows.reduce((s, r) => s + r.taxable, 0)), tax: round2(rows.reduce((s, r) => s + r.tax, 0)) },
        summary: [{ label: 'Note', value: 'Based on configured tax rules; verify with your tax professional.' }],
      };
    },
  },
];

/** Default filter values: the current month. */
export function resolveFilters(raw: { from?: string; to?: string; date?: string; year?: number; month?: number; departmentId?: string; employeeId?: string; leaveTypeId?: string }): ReportFilters {
  const today = todayIn();
  const year = raw.year ?? today.getUTCFullYear();
  const month = raw.month ?? today.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month);
  const from = raw.date ? parseDateOnly(raw.date) : raw.from ? parseDateOnly(raw.from) : start;
  let to = raw.date ? parseDateOnly(raw.date) : raw.to ? parseDateOnly(raw.to) : end;
  if (to < from) to = from;
  // Keep report ranges bounded (3 years) to protect the database.
  if (to.getTime() - from.getTime() > 3 * 366 * 86_400_000) to = addDays(from, 3 * 366);
  return { from, to, year, month, departmentId: raw.departmentId, employeeId: raw.employeeId, leaveTypeId: raw.leaveTypeId };
}
