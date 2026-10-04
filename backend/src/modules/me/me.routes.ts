import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireEmployeeLink } from '../../middleware/auth';
import { IMAGE_TYPES, relativeUploadPath, uploadSingle } from '../../middleware/upload';
import { body, query } from '../../middleware/validate';
import { actorFromRequest, audit, diff } from '../../services/audit.service';
import type { AuthContext } from '../../types/express';
import { addDays, formatDateOnly, todayIn } from '../../utils/dates';
import { badRequest } from '../../utils/errors';
import { toNumber } from '../../utils/money';
import { paginationQuery } from '../../utils/pagination';
import { nullable, zPhone } from '../../utils/validation';
import * as attendance from '../attendance/attendance.service';
import { scansByDay } from '../attendance/punches.service';
import * as documents from '../documents/documents.service';
import * as employees from '../employees/employees.service';
import * as leave from '../leave/leave.service';
import { leaveAttachmentUpload } from '../leave/leave.routes';
import { applyLeaveSchema } from '../leave/leave.schemas';
import * as payslips from '../payroll/payslip.service';
import { periodLabel } from '../payroll/payroll.service';

/** Self-service always runs with SELF scope, whatever the caller's role. */
const self = (auth: AuthContext): AuthContext => ({ ...auth, dataScope: 'SELF' });

/** Fields an employee may change on their own record. Everything else goes through HR. */
const selfUpdateSchema = z.object({
  phone: nullable(zPhone),
  address: nullable(z.string().trim().max(250)),
  province: nullable(z.string().trim().max(60)),
  district: nullable(z.string().trim().max(60)),
  municipality: nullable(z.string().trim().max(100)),
  maritalStatus: nullable(z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'])),
  emergencyContactName: nullable(z.string().trim().max(120)),
  emergencyContactPhone: nullable(zPhone),
});

export const meRoutes = Router();
meRoutes.use(requireEmployeeLink);

meRoutes.get('/profile', async (req, res) => {
  res.json({ success: true, data: await employees.getById(self(req.auth!), req.auth!.employeeId!) });
});

meRoutes.put('/profile', async (req, res) => {
  const input = body(req, selfUpdateSchema);
  const id = req.auth!.employeeId!;
  const before = await prisma.employee.findUniqueOrThrow({ where: { id } });
  await prisma.employee.update({ where: { id }, data: input });
  const d = diff(before as unknown as Record<string, unknown>, input);
  if (d.changed) await audit(req, { action: 'EMPLOYEE_SELF_UPDATED', module: 'employees', recordId: id, oldValue: d.oldValue, newValue: d.newValue });
  res.json({ success: true, data: await employees.getById(self(req.auth!), id), message: 'Profile updated' });
});

meRoutes.post('/photo', uploadSingle('photo', { folder: 'photos', allowedTypes: IMAGE_TYPES, maxSize: 2 * 1024 * 1024 }), async (req, res) => {
  if (!req.file) throw badRequest('Choose an image to upload', 'FILE_REQUIRED');
  await employees.setPhoto(self(req.auth!), req.auth!.employeeId!, relativeUploadPath(req.file.path), actorFromRequest(req));
  res.json({ success: true, message: 'Photo updated' });
});

meRoutes.get('/dashboard', async (req, res) => {
  const auth = self(req.auth!);
  const id = auth.employeeId!;
  const today = todayIn();
  const [todayRecord, todayScans, month, balances, requests, latestPayslip, unread, holidays] = await Promise.all([
    prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: id, date: today } } }),
    scansByDay(id, today, today),
    attendance.monthFor(auth.organisationId, id, today.getUTCFullYear(), today.getUTCMonth() + 1),
    leave.balances(auth, { employeeId: id }),
    prisma.leaveRequest.findMany({ where: { employeeId: id }, include: { leaveType: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.payslip.findFirst({ where: { employeeId: id }, orderBy: [{ year: 'desc' }, { month: 'desc' }], include: { payrollItem: { select: { netSalary: true, grossSalary: true } } } }),
    prisma.notification.count({ where: { userId: auth.userId, readAt: null } }),
    prisma.holiday.findMany({ where: { organisationId: auth.organisationId, status: 'ACTIVE', date: { gte: today, lte: addDays(today, 60) } }, orderBy: { date: 'asc' }, take: 5 }),
  ]);
  res.json({
    success: true,
    data: {
      today: formatDateOnly(today),
      attendanceToday: todayRecord,
      scansToday: todayScans.get(formatDateOnly(today)) ?? [],
      monthTotals: month.totals,
      leaveBalances: balances,
      recentLeave: requests.map((r) => ({ id: r.id, leaveType: r.leaveType.name, startDate: formatDateOnly(r.startDate), endDate: formatDateOnly(r.endDate), totalDays: toNumber(r.totalDays), status: r.status })),
      latestPayslip: latestPayslip
        ? { id: latestPayslip.id, period: periodLabel(latestPayslip.year, latestPayslip.month), netSalary: toNumber(latestPayslip.payrollItem.netSalary), grossSalary: toNumber(latestPayslip.payrollItem.grossSalary) }
        : null,
      unreadNotifications: unread,
      upcomingHolidays: holidays.map((h) => ({ name: h.name, date: formatDateOnly(h.date), type: h.type })),
    },
  });
});

meRoutes.get('/attendance', async (req, res) => {
  const today = todayIn();
  const q = query(req, z.object({ year: z.coerce.number().int().min(2000).max(2100).default(today.getUTCFullYear()), month: z.coerce.number().int().min(1).max(12).default(today.getUTCMonth() + 1) }));
  res.json({ success: true, data: await attendance.monthFor(req.auth!.organisationId, req.auth!.employeeId!, q.year, q.month) });
});

meRoutes.post('/attendance/check-in', async (req, res) => {
  res.json({ success: true, data: await attendance.selfCheck(self(req.auth!), 'in', actorFromRequest(req)), message: 'Checked in' });
});

meRoutes.post('/attendance/check-out', async (req, res) => {
  res.json({ success: true, data: await attendance.selfCheck(self(req.auth!), 'out', actorFromRequest(req)), message: 'Checked out' });
});

meRoutes.get('/leave/balances', async (req, res) => {
  const { year } = query(req, z.object({ year: z.coerce.number().int().optional() }));
  res.json({ success: true, data: await leave.balances(self(req.auth!), { year, employeeId: req.auth!.employeeId! }) });
});

meRoutes.get('/leave/requests', async (req, res) => {
  const q = query(req, paginationQuery.extend({ status: z.enum(['PENDING', 'SUPERVISOR_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED']).optional() }));
  res.json({ success: true, ...(await leave.listRequests(self(req.auth!), { ...q, employeeId: req.auth!.employeeId! })) });
});

meRoutes.post('/leave/requests', leaveAttachmentUpload, async (req, res) => {
  const input = body(req, applyLeaveSchema.omit({ employeeId: true }));
  res.status(201).json({ success: true, data: await leave.apply(self(req.auth!), input, req.file, actorFromRequest(req)) });
});

meRoutes.get('/payslips', async (req, res) => {
  const q = query(req, paginationQuery.extend({ year: z.coerce.number().int().optional() }));
  // Strip HR permission so the list is always the caller's own payslips.
  const auth = { ...self(req.auth!), permissions: new Set<string>() };
  res.json({ success: true, ...(await payslips.list(auth, { ...q, employeeId: req.auth!.employeeId! })) });
});

meRoutes.get('/documents', async (req, res) => {
  const auth = self(req.auth!);
  res.json({ success: true, ...(await documents.list(auth, { page: 1, limit: 200, sortOrder: 'desc', employeeId: auth.employeeId! })) });
});

