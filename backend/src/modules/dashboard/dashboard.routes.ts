import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { employeeScope } from '../../services/access.service';
import type { AuthContext } from '../../types/express';
import { addDays, formatDateOnly, todayIn } from '../../utils/dates';
import { toNumber } from '../../utils/money';
import { summary as attendanceSummary } from '../attendance/attendance.service';
import { EXIT_STATUSES } from '../employees/employees.schemas';
import { fullName } from '../employees/employees.service';
import { periodLabel } from '../payroll/payroll.service';

/**
 * Admin dashboard. Every widget respects the caller's data scope, and payroll figures
 * are only included for users who may see payroll.
 */
async function adminDashboard(auth: AuthContext) {
  const today = todayIn();
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const scope = employeeScope(auth);
  const current = { AND: [scope, { status: { notIn: [...EXIT_STATUSES] } }] };
  const canPayroll = auth.permissions.has('payroll.view') || auth.permissions.has('reports.payroll');

  const [total, active, departments, byDept, pendingLeave, recentEmployees, recentAttendance, attendance, leaveByType, attendanceTrend] = await Promise.all([
    prisma.employee.count({ where: current }),
    prisma.employee.count({ where: { AND: [scope, { status: { in: ['ACTIVE', 'PROBATION'] } }] } }),
    prisma.department.count({ where: { organisationId: auth.organisationId, deletedAt: null, status: 'ACTIVE' } }),
    prisma.employee.groupBy({ by: ['departmentId'], where: current, _count: true }),
    prisma.leaveRequest.count({ where: { organisationId: auth.organisationId, status: { in: ['PENDING', 'SUPERVISOR_APPROVED'] }, employee: scope } }),
    prisma.employee.findMany({
      where: current,
      orderBy: { joinDate: 'desc' },
      take: 5,
      select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true, joinDate: true, photoPath: true, department: { select: { name: true } }, designation: { select: { name: true } } },
    }),
    prisma.attendance.findMany({
      where: { organisationId: auth.organisationId, date: today, employee: scope, checkIn: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: { employee: { select: { id: true, firstName: true, middleName: true, lastName: true, employeeCode: true } } },
    }),
    attendanceSummary(auth),
    prisma.leaveRequest.groupBy({ by: ['leaveTypeId'], where: { organisationId: auth.organisationId, status: 'APPROVED', startDate: { gte: yearStart }, employee: scope }, _sum: { totalDays: true } }),
    prisma.attendance.groupBy({ by: ['date', 'status'], where: { organisationId: auth.organisationId, date: { gte: addDays(today, -13), lte: today }, employee: scope }, _count: true }),
  ]);

  const [deptNames, leaveTypes] = await Promise.all([
    prisma.department.findMany({ where: { id: { in: byDept.map((d) => d.departmentId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    prisma.leaveType.findMany({ where: { organisationId: auth.organisationId }, select: { id: true, name: true } }),
  ]);

  let payroll: { current: unknown; trend: { period: string; gross: number; net: number }[] } | null = null;
  if (canPayroll) {
    const runs = await prisma.payroll.findMany({ where: { organisationId: auth.organisationId, status: { not: 'CANCELLED' } }, orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 12 });
    const latest = runs[0];
    payroll = {
      current: latest ? { id: latest.id, period: periodLabel(latest.year, latest.month), status: latest.status, totalNet: toNumber(latest.totalNet), totalGross: toNumber(latest.totalGross), employeeCount: latest.employeeCount } : null,
      trend: runs.reverse().map((r) => ({ period: periodLabel(r.year, r.month).slice(0, 3) + ' ' + String(r.year).slice(2), gross: toNumber(r.totalGross), net: toNumber(r.totalNet) })),
    };
  }

  // Last 14 days attendance trend
  const trend: { date: string; present: number; absent: number; leave: number; late: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = formatDateOnly(d);
    const rows = attendanceTrend.filter((a) => formatDateOnly(a.date) === key);
    const c = (s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((sum, r) => sum + r._count, 0);
    trend.push({ date: key, present: c(['PRESENT', 'WORK_FROM_HOME', 'HALF_DAY']), late: c(['LATE']), absent: c(['ABSENT']), leave: c(['LEAVE']) });
  }

  return {
    cards: {
      totalEmployees: total,
      activeEmployees: active,
      onLeaveToday: attendance.onLeave,
      presentToday: attendance.present,
      absentToday: attendance.absent,
      lateToday: attendance.late,
      notMarkedToday: attendance.notMarked,
      departments,
      pendingLeaveRequests: pendingLeave,
      currentPayroll: payroll?.current ?? null,
    },
    charts: {
      employeesByDepartment: byDept
        .map((d) => ({ department: deptNames.find((n) => n.id === d.departmentId)?.name ?? 'Unassigned', count: d._count }))
        .sort((a, b) => b.count - a.count),
      attendanceToday: [
        { status: 'Present', value: attendance.present - attendance.late },
        { status: 'Late', value: attendance.late },
        { status: 'On leave', value: attendance.onLeave },
        { status: 'Absent', value: attendance.absent },
        { status: 'Not marked', value: attendance.notMarked },
      ],
      attendanceTrend: trend,
      payrollTrend: payroll?.trend ?? null,
      leaveByType: leaveByType.map((l) => ({ leaveType: leaveTypes.find((t) => t.id === l.leaveTypeId)?.name ?? 'Other', days: toNumber(l._sum.totalDays) })),
    },
    recentEmployees: recentEmployees.map(({ photoPath, ...e }) => ({ ...e, fullName: fullName(e), hasPhoto: Boolean(photoPath) })),
    recentAttendance: recentAttendance.map((a) => ({ id: a.id, employeeId: a.employeeId, employeeName: fullName(a.employee), checkIn: a.checkIn, checkOut: a.checkOut, status: a.status })),
    today: formatDateOnly(today),
  };
}

export const dashboardRoutes = Router();

dashboardRoutes.get('/', async (req, res) => {
  res.json({ success: true, data: await adminDashboard(req.auth!) });
});
