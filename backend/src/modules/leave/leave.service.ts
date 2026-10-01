import fs from 'node:fs';
import type { LeaveRequest, LeaveType, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { env } from '../../config/env';
import { templates } from '../../emails/templates';
import { prisma, type Tx } from '../../lib/prisma';
import { relativeUploadPath, resolveUploadPath } from '../../middleware/upload';
import { employeeScope, isSupervisorOf } from '../../services/access.service';
import { writeAudit, type AuditActor } from '../../services/audit.service';
import { loadWorkCalendar } from '../../services/calendar.service';
import { dayKind } from '../../services/engines/calendar.engine';
import { countLeaveDays, remainingBalance } from '../../services/engines/leave.engine';
import { ensureLeaveBalances } from '../../services/leave-balance.service';
import { notify, userIdForEmployee, usersWithPermission } from '../../services/notification.service';
import { getLeaveSettings } from '../../services/settings.service';
import type { AuthContext } from '../../types/express';
import { addDays, eachDay, formatDateOnly, parseDateOnly, todayIn } from '../../utils/dates';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../utils/errors';
import { dec, toNumber } from '../../utils/money';
import { paginated, paging } from '../../utils/pagination';
import { fullName } from '../employees/employees.service';
import type { applyLeaveSchema, listLeaveQuery, updateLeaveSchema } from './leave.schemas';

const ACTIVE_STATUSES = ['PENDING', 'SUPERVISOR_APPROVED', 'APPROVED'] as const;

const include = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      managerId: true,
      supervisorId: true,
      department: { select: { id: true, name: true, headId: true } },
    },
  },
  leaveType: { select: { id: true, name: true, code: true, paid: true, requiresHrApproval: true } },
} satisfies Prisma.LeaveRequestInclude;

type RequestWithRelations = Prisma.LeaveRequestGetPayload<{ include: typeof include }>;

function shape(r: RequestWithRelations, auth?: AuthContext) {
  const { attachmentPath, ...rest } = r;
  return {
    ...rest,
    totalDays: toNumber(r.totalDays),
    employeeName: fullName(r.employee),
    hasAttachment: Boolean(attachmentPath),
    canAct: auth ? canActOn(auth, r) : undefined,
  };
}

const dateRange = (r: { startDate: Date; endDate: Date }) =>
  r.startDate.getTime() === r.endDate.getTime() ? formatDateOnly(r.startDate) : `${formatDateOnly(r.startDate)} to ${formatDateOnly(r.endDate)}`;

function isSupervisorSync(auth: AuthContext, r: RequestWithRelations) {
  const me = auth.employeeId;
  return Boolean(me) && (r.employee.managerId === me || r.employee.supervisorId === me || r.employee.department?.headId === me);
}

/** Whether the caller can approve/reject the request at its current stage (for UI hints). */
function canActOn(auth: AuthContext, r: RequestWithRelations) {
  if (auth.employeeId === r.employeeId) return false;
  if (r.status === 'PENDING') return auth.permissions.has('leave.manage') || (auth.permissions.has('leave.approve') && isSupervisorSync(auth, r));
  if (r.status === 'SUPERVISOR_APPROVED') return auth.permissions.has('leave.manage');
  return false;
}

// ── Leave types ──────────────────────────────────────────────

export async function listTypes(orgId: string, onlyActive = false) {
  const rows = await prisma.leaveType.findMany({ where: { organisationId: orgId, ...(onlyActive ? { status: 'ACTIVE' } : {}) }, orderBy: { name: 'asc' } });
  return rows.map((t) => ({ ...t, annualDays: toNumber(t.annualDays), maxCarryForward: toNumber(t.maxCarryForward) }));
}

// ── Requests: queries ────────────────────────────────────────

function listWhere(auth: AuthContext, q: z.infer<typeof listLeaveQuery>): Prisma.LeaveRequestWhereInput {
  const and: Prisma.LeaveRequestWhereInput[] = [
    { organisationId: auth.organisationId, employee: employeeScope(auth) },
    q.status ? { status: q.status } : {},
    q.employeeId ? { employeeId: q.employeeId } : {},
    q.leaveTypeId ? { leaveTypeId: q.leaveTypeId } : {},
    q.departmentId ? { employee: { departmentId: q.departmentId } } : {},
    q.from ? { endDate: { gte: parseDateOnly(q.from) } } : {},
    q.to ? { startDate: { lte: parseDateOnly(q.to) } } : {},
    q.search
      ? { employee: { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { employeeCode: { contains: q.search, mode: 'insensitive' } }] } }
      : {},
  ];
  if (q.awaitingMe === '1') {
    const me = auth.employeeId ?? '__none__';
    const supervised: Prisma.LeaveRequestWhereInput = {
      status: 'PENDING',
      employee: { OR: [{ managerId: me }, { supervisorId: me }, { department: { headId: me } }] },
    };
    const options: Prisma.LeaveRequestWhereInput[] = [];
    if (auth.permissions.has('leave.manage')) options.push({ status: { in: ['PENDING', 'SUPERVISOR_APPROVED'] } });
    if (auth.permissions.has('leave.approve')) options.push(supervised);
    and.push({ OR: options.length ? options : [{ id: '__none__' }] }, { employeeId: { not: me } });
  }
  return { AND: and };
}

export async function listRequests(auth: AuthContext, q: z.infer<typeof listLeaveQuery>) {
  const where = listWhere(auth, q);
  const [rows, total] = await Promise.all([
    prisma.leaveRequest.findMany({ where, include, orderBy: [{ createdAt: 'desc' }], ...paging(q) }),
    prisma.leaveRequest.count({ where }),
  ]);
  return paginated(rows.map((r) => shape(r, auth)), total, q);
}

async function findRequest(auth: AuthContext, id: string) {
  const r = await prisma.leaveRequest.findFirst({
    where: { id, organisationId: auth.organisationId, OR: [{ employee: employeeScope(auth) }, { employeeId: auth.employeeId ?? '__none__' }] },
    include,
  });
  if (!r) throw notFound('Leave request');
  return r;
}

export async function getRequest(auth: AuthContext, id: string) {
  return shape(await findRequest(auth, id), auth);
}

export async function attachmentFile(auth: AuthContext, id: string) {
  const r = await prisma.leaveRequest.findFirst({ where: { id, organisationId: auth.organisationId }, include });
  if (!r?.attachmentPath) throw notFound('Attachment');
  const own = auth.employeeId === r.employeeId;
  if (!own) {
    const inScope = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id: r.employeeId }] }, select: { id: true } });
    if (!inScope || !auth.permissions.has('leave.view')) throw notFound('Attachment');
  }
  return { path: resolveUploadPath(r.attachmentPath), name: r.attachmentName ?? 'attachment' };
}

// ── Requests: apply / update ─────────────────────────────────

interface Validated {
  leaveType: LeaveType;
  start: Date;
  end: Date;
  days: number;
  year: number;
}

async function validateRequest(
  auth: AuthContext,
  employeeId: string,
  input: { leaveTypeId: string; startDate: string; endDate: string; halfDay: boolean },
  opts: { excludeRequestId?: string; hasAttachment: boolean },
): Promise<Validated> {
  const leaveType = await prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, organisationId: auth.organisationId, status: 'ACTIVE' } });
  if (!leaveType) throw notFound('Leave type');

  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (end < start) throw badRequest('End date must be on or after the start date', 'INVALID_DATES');
  if (start.getUTCFullYear() !== end.getUTCFullYear()) throw badRequest('Split leave that crosses into a new year into two requests', 'CROSSES_YEAR');
  if (input.halfDay && start.getTime() !== end.getTime()) throw badRequest('A half-day request must be for a single day', 'INVALID_HALF_DAY');
  if (input.halfDay && !leaveType.allowHalfDay) throw badRequest(`${leaveType.name} cannot be taken as a half day`, 'HALF_DAY_NOT_ALLOWED');

  const settings = await getLeaveSettings(auth.organisationId);
  const earliest = addDays(todayIn(), -settings.maxBackdateDays);
  if (start < earliest && !auth.permissions.has('leave.manage')) {
    throw badRequest(`Leave can be requested at most ${settings.maxBackdateDays} days in the past`, 'TOO_FAR_IN_PAST');
  }

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  if (start < employee.joinDate) throw badRequest('Leave cannot start before the join date', 'BEFORE_JOIN_DATE');

  if (leaveType.requiresDocument && !opts.hasAttachment) {
    throw badRequest(`${leaveType.name} needs a supporting document`, 'DOCUMENT_REQUIRED');
  }

  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: [...ACTIVE_STATUSES] },
      startDate: { lte: end },
      endDate: { gte: start },
      ...(opts.excludeRequestId ? { id: { not: opts.excludeRequestId } } : {}),
    },
  });
  if (overlapping) throw conflict(`This overlaps another leave request (${dateRange(overlapping)})`, 'LEAVE_OVERLAP');

  const cal = await loadWorkCalendar(auth.organisationId, start, end);
  const days = countLeaveDays(start, end, cal, { halfDay: input.halfDay, countWeekends: settings.countWeekends, countHolidays: settings.countHolidays });
  if (days <= 0) throw badRequest('The selected dates are all weekends or holidays', 'NO_WORKING_DAYS');

  return { leaveType, start, end, days, year: start.getUTCFullYear() };
}

async function assertBalance(tx: Tx, auth: AuthContext, employeeId: string, v: Validated, alreadyReserved = 0) {
  await ensureLeaveBalances(tx, auth.organisationId, employeeId, v.year);
  const balance = await tx.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: v.leaveType.id, year: v.year } } });
  if (!v.leaveType.limitToBalance) return balance;
  const settings = await getLeaveSettings(auth.organisationId, tx);
  if (settings.allowNegativeBalance) return balance;
  const remaining =
    remainingBalance({
      entitled: toNumber(balance.entitled),
      carriedForward: toNumber(balance.carriedForward),
      adjusted: toNumber(balance.adjusted),
      used: toNumber(balance.used),
      pending: toNumber(balance.pending),
    }) + alreadyReserved;
  if (v.days > remaining) {
    throw unprocessable(`Not enough ${v.leaveType.name} balance: ${remaining} day(s) available, ${v.days} requested`, 'INSUFFICIENT_BALANCE');
  }
  return balance;
}

async function approversFor(auth: AuthContext, employeeId: string, needHr: boolean) {
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { managerId: true, supervisorId: true, department: { select: { headId: true } } } });
  const supervisorEmployee = emp.managerId ?? emp.supervisorId ?? emp.department?.headId ?? null;
  const supervisorUser = supervisorEmployee && supervisorEmployee !== employeeId ? await userIdForEmployee(supervisorEmployee) : null;
  if (supervisorUser && !needHr) return [supervisorUser];
  const hr = await usersWithPermission(auth.organisationId, ['leave.manage']);
  return supervisorUser ? [supervisorUser] : hr;
}

export async function apply(auth: AuthContext, input: z.infer<typeof applyLeaveSchema>, file: Express.Multer.File | undefined, actor: AuditActor) {
  const employeeId = input.employeeId ?? auth.employeeId;
  try {
    if (!employeeId) throw forbidden('Your user account is not linked to an employee record', 'NO_EMPLOYEE_LINK');
    if (employeeId !== auth.employeeId) {
      // Applying on someone else's behalf is an HR action.
      if (!auth.permissions.has('leave.manage')) throw forbidden('You can only apply for your own leave');
      const inScope = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id: employeeId }] }, select: { id: true } });
      if (!inScope) throw notFound('Employee');
    }

    const v = await validateRequest(auth, employeeId, input, { hasAttachment: Boolean(file) });
    const request = await prisma.$transaction(async (tx) => {
      const balance = await assertBalance(tx, auth, employeeId, v);
      const created = await tx.leaveRequest.create({
        data: {
          organisationId: auth.organisationId,
          employeeId,
          leaveTypeId: v.leaveType.id,
          startDate: v.start,
          endDate: v.end,
          halfDay: input.halfDay,
          totalDays: dec(v.days),
          reason: input.reason,
          attachmentPath: file ? relativeUploadPath(file.path) : null,
          attachmentName: file ? file.originalname.slice(0, 150) : null,
        },
        include,
      });
      await tx.leaveBalance.update({ where: { id: balance.id }, data: { pending: { increment: dec(v.days) } } });
      await writeAudit(actor, { action: 'LEAVE_REQUESTED', module: 'leave', recordId: created.id, newValue: { employeeId, type: v.leaveType.code, from: input.startDate, to: input.endDate, days: v.days } }, tx);
      return created;
    });

    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: auth.organisationId }, select: { name: true } });
    const approvers = await approversFor(auth, employeeId, false);
    await notify(approvers, {
      organisationId: auth.organisationId,
      type: 'LEAVE_SUBMITTED',
      title: `Leave request from ${fullName(request.employee)}`,
      message: `${v.days} day(s) of ${v.leaveType.name}, ${dateRange(request)}`,
      link: `/app/leave/requests?id=${request.id}`,
      email: (r) =>
        templates.leaveSubmitted({
          orgName: org.name,
          approverName: r.name,
          employeeName: fullName(request.employee),
          leaveType: v.leaveType.name,
          dates: dateRange(request),
          days: String(v.days),
          url: `${env.FRONTEND_URL}/app/leave/requests?id=${request.id}`,
        }),
    });
    return shape(request, auth);
  } catch (err) {
    if (file) fs.rm(file.path, { force: true }, () => undefined);
    throw err;
  }
}

export async function update(auth: AuthContext, id: string, input: z.infer<typeof updateLeaveSchema>, actor: AuditActor) {
  const r = await findRequest(auth, id);
  if (r.status !== 'PENDING') throw badRequest('Only pending requests can be changed', 'NOT_EDITABLE');
  if (r.employeeId !== auth.employeeId && !auth.permissions.has('leave.manage')) throw forbidden();

  const merged = {
    leaveTypeId: r.leaveTypeId,
    startDate: input.startDate ?? formatDateOnly(r.startDate),
    endDate: input.endDate ?? formatDateOnly(r.endDate),
    halfDay: input.halfDay ?? r.halfDay,
  };
  const v = await validateRequest(auth, r.employeeId, merged, { excludeRequestId: id, hasAttachment: Boolean(r.attachmentPath) });
  const oldDays = toNumber(r.totalDays);
  const oldYear = r.startDate.getUTCFullYear();

  const updated = await prisma.$transaction(async (tx) => {
    // Release the old reservation, then reserve again for the new dates.
    await tx.leaveBalance.update({
      where: { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: oldYear } },
      data: { pending: { decrement: dec(oldDays) } },
    });
    const balance = await assertBalance(tx, auth, r.employeeId, v);
    await tx.leaveBalance.update({ where: { id: balance.id }, data: { pending: { increment: dec(v.days) } } });
    const row = await tx.leaveRequest.update({
      where: { id },
      data: { startDate: v.start, endDate: v.end, halfDay: merged.halfDay, totalDays: dec(v.days), reason: input.reason ?? r.reason },
      include,
    });
    await writeAudit(actor, { action: 'LEAVE_UPDATED', module: 'leave', recordId: id, oldValue: { from: r.startDate, to: r.endDate, days: oldDays }, newValue: { from: merged.startDate, to: merged.endDate, days: v.days } }, tx);
    return row;
  });
  return shape(updated, auth);
}

// ── Decisions ────────────────────────────────────────────────

async function markAttendanceAsLeave(tx: Tx, r: LeaveRequest, leaveTypeName: string, actorUserId: string) {
  const cal = await loadWorkCalendar(r.organisationId, r.startDate, r.endDate, tx);
  for (const d of eachDay(r.startDate, r.endDate)) {
    if (dayKind(d, cal) !== 'WORKING') continue;
    const existing = await tx.attendance.findUnique({ where: { employeeId_date: { employeeId: r.employeeId, date: d } } });
    // Never overwrite a day the employee actually worked.
    if (existing && existing.checkIn) continue;
    const data = { status: 'LEAVE' as const, remarks: `${leaveTypeName}${r.halfDay ? ' (half day)' : ''}`, source: 'ADMIN' as const, createdById: actorUserId, workMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
    await tx.attendance.upsert({
      where: { employeeId_date: { employeeId: r.employeeId, date: d } },
      create: { organisationId: r.organisationId, employeeId: r.employeeId, date: d, ...data },
      update: data,
    });
  }
}

async function clearLeaveAttendance(tx: Tx, r: LeaveRequest) {
  await tx.attendance.deleteMany({ where: { employeeId: r.employeeId, date: { gte: r.startDate, lte: r.endDate }, status: 'LEAVE', checkIn: null } });
}

async function notifyEmployee(r: RequestWithRelations, orgId: string, approved: boolean, reason?: string) {
  const userId = await userIdForEmployee(r.employeeId);
  if (!userId) return;
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
  const url = `${env.FRONTEND_URL}/app/me/leave`;
  await notify([userId], {
    organisationId: orgId,
    type: approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    title: approved ? 'Leave approved' : 'Leave not approved',
    message: `${r.leaveType.name}, ${dateRange(r)}${reason ? `. Reason: ${reason}` : ''}`,
    link: '/app/me/leave',
    email: (rcp) =>
      approved
        ? templates.leaveApproved({ orgName: org.name, name: rcp.name, leaveType: r.leaveType.name, dates: dateRange(r), url })
        : templates.leaveRejected({ orgName: org.name, name: rcp.name, leaveType: r.leaveType.name, dates: dateRange(r), reason: reason ?? '', url }),
  });
}

export async function approve(auth: AuthContext, id: string, remarks: string | undefined, actor: AuditActor) {
  const r = await findRequest(auth, id);
  if (r.employeeId === auth.employeeId) throw forbidden('You cannot approve your own leave', 'SELF_APPROVAL');
  const isHr = auth.permissions.has('leave.manage');
  const isSupervisor = auth.permissions.has('leave.approve') && (await isSupervisorOf(auth.employeeId, r.employeeId));

  let finalApproval: boolean;
  if (r.status === 'PENDING') {
    if (!isHr && !isSupervisor) throw forbidden('Only the employee’s supervisor or HR can approve this request');
    // A supervisor's approval is final unless the leave type also needs HR sign-off.
    finalApproval = isHr || !r.leaveType.requiresHrApproval;
  } else if (r.status === 'SUPERVISOR_APPROVED') {
    if (!isHr) throw forbidden('This request is waiting for HR approval');
    finalApproval = true;
  } else {
    throw badRequest(`This request is already ${r.status.toLowerCase().replace('_', ' ')}`, 'INVALID_STATUS');
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction so two approvers cannot both succeed.
    const fresh = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });
    if (fresh.status !== r.status) throw conflict('This request was just updated by someone else. Refresh and try again.', 'STALE_REQUEST');

    if (!finalApproval) {
      const row = await tx.leaveRequest.update({ where: { id }, data: { status: 'SUPERVISOR_APPROVED', supervisorActionById: auth.userId, supervisorActionAt: now }, include });
      await writeAudit(actor, { action: 'LEAVE_SUPERVISOR_APPROVED', module: 'leave', recordId: id, newValue: { remarks } }, tx);
      return row;
    }

    const days = toNumber(r.totalDays);
    const year = r.startDate.getUTCFullYear();
    await tx.leaveBalance.update({
      where: { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year } },
      data: { pending: { decrement: dec(days) }, used: { increment: dec(days) } },
    });
    const row = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: auth.userId,
        approvedAt: now,
        ...(r.status === 'PENDING' && isSupervisor && !isHr ? { supervisorActionById: auth.userId, supervisorActionAt: now } : {}),
      },
      include,
    });
    await markAttendanceAsLeave(tx, row, r.leaveType.name, auth.userId);
    await writeAudit(actor, { action: 'LEAVE_APPROVED', module: 'leave', recordId: id, oldValue: { status: r.status }, newValue: { status: 'APPROVED', days, remarks } }, tx);
    return row;
  });

  if (finalApproval) await notifyEmployee(updated, auth.organisationId, true);
  else {
    const hr = await usersWithPermission(auth.organisationId, ['leave.manage']);
    await notify(hr, {
      organisationId: auth.organisationId,
      type: 'LEAVE_SUBMITTED',
      title: `Leave awaiting HR approval: ${fullName(updated.employee)}`,
      message: `${updated.leaveType.name}, ${dateRange(updated)} (approved by supervisor)`,
      link: `/app/leave/requests?id=${id}`,
    });
  }
  return shape(updated, auth);
}

export async function reject(auth: AuthContext, id: string, reason: string, actor: AuditActor) {
  const r = await findRequest(auth, id);
  if (r.employeeId === auth.employeeId) throw forbidden('You cannot decide on your own leave', 'SELF_APPROVAL');
  const isHr = auth.permissions.has('leave.manage');
  const isSupervisor = auth.permissions.has('leave.approve') && (await isSupervisorOf(auth.employeeId, r.employeeId));
  if (r.status === 'PENDING' && !isHr && !isSupervisor) throw forbidden();
  if (r.status === 'SUPERVISOR_APPROVED' && !isHr) throw forbidden('This request is waiting for HR');
  if (!['PENDING', 'SUPERVISOR_APPROVED'].includes(r.status)) throw badRequest('Only pending requests can be rejected', 'INVALID_STATUS');

  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });
    if (fresh.status !== r.status) throw conflict('This request was just updated by someone else. Refresh and try again.', 'STALE_REQUEST');
    await tx.leaveBalance.update({
      where: { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: r.startDate.getUTCFullYear() } },
      data: { pending: { decrement: r.totalDays } },
    });
    const row = await tx.leaveRequest.update({ where: { id }, data: { status: 'REJECTED', rejectedById: auth.userId, rejectedAt: new Date(), rejectionReason: reason }, include });
    await writeAudit(actor, { action: 'LEAVE_REJECTED', module: 'leave', recordId: id, oldValue: { status: r.status }, newValue: { status: 'REJECTED', reason } }, tx);
    return row;
  });
  await notifyEmployee(updated, auth.organisationId, false, reason);
  return shape(updated, auth);
}

export async function cancel(auth: AuthContext, id: string, actor: AuditActor) {
  const r = await findRequest(auth, id);
  const own = r.employeeId === auth.employeeId;
  const isHr = auth.permissions.has('leave.manage');
  if (!own && !isHr) throw forbidden();
  if (r.status === 'APPROVED' && !isHr && r.startDate <= todayIn()) {
    throw badRequest('Leave that has already started can only be cancelled by HR', 'ALREADY_STARTED');
  }
  if (!['PENDING', 'SUPERVISOR_APPROVED', 'APPROVED'].includes(r.status)) throw badRequest('This request cannot be cancelled', 'INVALID_STATUS');

  const updated = await prisma.$transaction(async (tx) => {
    const key = { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: r.startDate.getUTCFullYear() } };
    if (r.status === 'APPROVED') {
      await tx.leaveBalance.update({ where: key, data: { used: { decrement: r.totalDays } } });
      await clearLeaveAttendance(tx, r);
    } else {
      await tx.leaveBalance.update({ where: key, data: { pending: { decrement: r.totalDays } } });
    }
    const row = await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() }, include });
    await writeAudit(actor, { action: 'LEAVE_CANCELLED', module: 'leave', recordId: id, oldValue: { status: r.status } }, tx);
    return row;
  });
  return shape(updated, auth);
}

// ── Balances ─────────────────────────────────────────────────

export async function balances(auth: AuthContext, q: { year?: number; employeeId?: string; leaveTypeId?: string; departmentId?: string; search?: string }) {
  const year = q.year ?? todayIn().getUTCFullYear();
  const rows = await prisma.leaveBalance.findMany({
    where: {
      year,
      ...(q.leaveTypeId ? { leaveTypeId: q.leaveTypeId } : {}),
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
      employee: {
        AND: [
          employeeScope(auth),
          q.departmentId ? { departmentId: q.departmentId } : {},
          q.search ? { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { employeeCode: { contains: q.search, mode: 'insensitive' } }] } : {},
        ],
      },
    },
    include: {
      leaveType: { select: { id: true, name: true, code: true, limitToBalance: true, paid: true } },
      employee: { select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true, department: { select: { name: true } } } },
    },
    orderBy: [{ employee: { firstName: 'asc' } }, { leaveType: { name: 'asc' } }],
    take: 5000,
  });
  return rows.map((b) => {
    const figures = { entitled: toNumber(b.entitled), carriedForward: toNumber(b.carriedForward), adjusted: toNumber(b.adjusted), used: toNumber(b.used), pending: toNumber(b.pending) };
    return { id: b.id, year: b.year, leaveType: b.leaveType, employee: { ...b.employee, fullName: fullName(b.employee) }, ...figures, remaining: remainingBalance(figures) };
  });
}

export async function adjustBalance(auth: AuthContext, id: string, delta: number, reason: string, actor: AuditActor) {
  const b = await prisma.leaveBalance.findFirst({ where: { id, employee: employeeScope(auth) } });
  if (!b) throw notFound('Leave balance');
  const row = await prisma.leaveBalance.update({ where: { id }, data: { adjusted: { increment: dec(delta) } } });
  await writeAudit(actor, { action: 'LEAVE_BALANCE_ADJUSTED', module: 'leave', recordId: b.employeeId, oldValue: { adjusted: toNumber(b.adjusted) }, newValue: { adjusted: toNumber(row.adjusted), delta, reason } });
  return row;
}

// ── Calendar & dashboard ─────────────────────────────────────

export async function calendar(auth: AuthContext, fromStr: string, toStr: string, departmentId?: string) {
  const from = parseDateOnly(fromStr);
  const to = parseDateOnly(toStr);
  if (to < from || to.getTime() - from.getTime() > 120 * 86_400_000) throw badRequest('Choose a range of up to 120 days', 'INVALID_RANGE');
  const [requests, holidays] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        organisationId: auth.organisationId,
        status: { in: [...ACTIVE_STATUSES] },
        startDate: { lte: to },
        endDate: { gte: from },
        employee: { AND: [employeeScope(auth), departmentId ? { departmentId } : {}] },
      },
      include,
      orderBy: { startDate: 'asc' },
    }),
    prisma.holiday.findMany({ where: { organisationId: auth.organisationId, status: 'ACTIVE', date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }),
  ]);
  return {
    requests: requests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: fullName(r.employee),
      department: r.employee.department?.name ?? null,
      leaveType: r.leaveType.name,
      leaveTypeCode: r.leaveType.code,
      startDate: formatDateOnly(r.startDate),
      endDate: formatDateOnly(r.endDate),
      halfDay: r.halfDay,
      totalDays: toNumber(r.totalDays),
      status: r.status,
    })),
    holidays: holidays.map((h) => ({ id: h.id, name: h.name, date: formatDateOnly(h.date), type: h.type })),
  };
}

export async function dashboard(auth: AuthContext) {
  const today = todayIn();
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const base = { organisationId: auth.organisationId, employee: employeeScope(auth) };
  const [byStatus, onLeave, upcoming, byType] = await Promise.all([
    prisma.leaveRequest.groupBy({ by: ['status'], where: { ...base, createdAt: { gte: yearStart } }, _count: true }),
    prisma.leaveRequest.findMany({ where: { ...base, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, include, orderBy: { endDate: 'asc' } }),
    prisma.leaveRequest.findMany({ where: { ...base, status: { in: ['APPROVED', 'SUPERVISOR_APPROVED', 'PENDING'] }, startDate: { gt: today, lte: addDays(today, 30) } }, include, orderBy: { startDate: 'asc' }, take: 20 }),
    prisma.leaveRequest.groupBy({ by: ['leaveTypeId'], where: { ...base, status: 'APPROVED', startDate: { gte: yearStart } }, _sum: { totalDays: true } }),
  ]);
  const types = await prisma.leaveType.findMany({ where: { organisationId: auth.organisationId }, select: { id: true, name: true, code: true } });
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  return {
    pending: count('PENDING') + count('SUPERVISOR_APPROVED'),
    approved: count('APPROVED'),
    rejected: count('REJECTED'),
    cancelled: count('CANCELLED'),
    onLeaveToday: onLeave.map((r) => shape(r)),
    upcoming: upcoming.map((r) => shape(r)),
    usageByType: types.map((t) => ({ leaveType: t.name, code: t.code, days: toNumber(byType.find((b) => b.leaveTypeId === t.id)?._sum.totalDays ?? 0) })),
  };
}
