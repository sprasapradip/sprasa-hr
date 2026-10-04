import type { AttendanceSource, AttendanceStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Db } from '../../lib/prisma';
import { employeeScope } from '../../services/access.service';
import { diff, writeAudit, type AuditActor } from '../../services/audit.service';
import { loadWorkCalendar } from '../../services/calendar.service';
import { computeAttendance } from '../../services/engines/attendance.engine';
import { dayKind } from '../../services/engines/calendar.engine';
import { resolveShift, resolveShifts, toShiftRule } from '../../services/shift-resolver.service';
import type { AuthContext } from '../../types/express';
import { formatDateOnly, monthRange, nowTimeIn, parseDateOnly, todayIn } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { paginated, paginationQuery, paging } from '../../utils/pagination';
import { nullable, optional, zDate, zTime } from '../../utils/validation';
import { EXIT_STATUSES } from '../employees/employees.schemas';
import { fullName } from '../employees/employees.service';
import { scansByDay } from './punches.service';

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEKEND', 'WORK_FROM_HOME'] as const;

const entryFields = {
  checkIn: nullable(zTime),
  checkOut: nullable(zTime),
  status: optional(z.enum(ATTENDANCE_STATUSES)),
  remarks: nullable(z.string().trim().max(300)),
};

export const upsertAttendanceSchema = z.object({ employeeId: z.string().uuid(), date: zDate, ...entryFields });
export const updateAttendanceSchema = z.object(entryFields);
export const bulkAttendanceSchema = z.object({
  date: zDate,
  entries: z.array(z.object({ employeeId: z.string().uuid(), ...entryFields })).min(1).max(1000),
});

export const listAttendanceQuery = paginationQuery.extend({
  date: zDate.optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  departmentId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  format: z.enum(['csv', 'xlsx', 'pdf']).optional(),
});

const include = {
  employee: { select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true, department: { select: { id: true, name: true } } } },
  shift: { select: { id: true, name: true, startTime: true, endTime: true } },
} satisfies Prisma.AttendanceInclude;

export function listWhere(auth: AuthContext, q: z.infer<typeof listAttendanceQuery>): Prisma.AttendanceWhereInput {
  const dateFilter = q.date
    ? { date: parseDateOnly(q.date) }
    : q.from || q.to
      ? { date: { ...(q.from ? { gte: parseDateOnly(q.from) } : {}), ...(q.to ? { lte: parseDateOnly(q.to) } : {}) } }
      : {};
  return {
    organisationId: auth.organisationId,
    ...dateFilter,
    ...(q.status ? { status: q.status } : {}),
    ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    employee: {
      AND: [
        employeeScope(auth),
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.search
          ? { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { employeeCode: { contains: q.search, mode: 'insensitive' } }] }
          : {},
      ],
    },
  };
}

export async function list(auth: AuthContext, q: z.infer<typeof listAttendanceQuery>) {
  const where = listWhere(auth, q);
  const [rows, total] = await Promise.all([
    prisma.attendance.findMany({ where, include, orderBy: [{ date: 'desc' }, { employee: { firstName: 'asc' } }], ...paging(q) }),
    prisma.attendance.count({ where }),
  ]);
  return paginated(rows.map((r) => ({ ...r, employeeName: fullName(r.employee) })), total, q);
}

/** Daily roll-up: counts per status plus employees with no record yet. */
export async function summary(auth: AuthContext, dateStr?: string, departmentId?: string) {
  const date = dateStr ? parseDateOnly(dateStr) : todayIn();
  const empWhere: Prisma.EmployeeWhereInput = {
    AND: [employeeScope(auth), { status: { notIn: [...EXIT_STATUSES] }, joinDate: { lte: date } }, departmentId ? { departmentId } : {}],
  };
  const [employees, grouped, cal, onLeave] = await Promise.all([
    prisma.employee.count({ where: empWhere }),
    prisma.attendance.groupBy({ by: ['status'], where: { organisationId: auth.organisationId, date, employee: empWhere }, _count: true }),
    loadWorkCalendar(auth.organisationId, date, date),
    prisma.leaveRequest.count({ where: { organisationId: auth.organisationId, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date }, employee: empWhere } }),
  ]);
  const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0])) as Record<AttendanceStatus, number>;
  for (const g of grouped) counts[g.status] = g._count;
  const recorded = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    date: formatDateOnly(date),
    dayType: dayKind(date, cal),
    totalEmployees: employees,
    present: counts.PRESENT + counts.LATE + counts.WORK_FROM_HOME + counts.HALF_DAY,
    absent: counts.ABSENT,
    late: counts.LATE,
    onLeave: Math.max(counts.LEAVE, onLeave),
    halfDay: counts.HALF_DAY,
    workFromHome: counts.WORK_FROM_HOME,
    notMarked: Math.max(0, employees - recorded),
    byStatus: counts,
  };
}

async function buildRecord(db: Db, orgId: string, employeeId: string, date: Date, entry: { checkIn?: string | null; checkOut?: string | null; status?: AttendanceStatus }) {
  const shift = await resolveShift(employeeId, orgId, date, db);
  let status = entry.status ?? null;
  if (!status && !entry.checkIn) {
    const cal = await loadWorkCalendar(orgId, date, date, db);
    const kind = dayKind(date, cal);
    status = kind === 'HOLIDAY' ? 'HOLIDAY' : kind === 'WEEKEND' ? 'WEEKEND' : 'ABSENT';
  }
  const result = computeAttendance({ checkIn: entry.checkIn, checkOut: entry.checkOut, status, shift: shift ? toShiftRule(shift) : null });
  return { shiftId: shift?.id ?? null, ...result };
}

async function assertEmployee(auth: AuthContext, employeeId: string, date: Date) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id: employeeId }] } });
  if (!emp) throw notFound('Employee');
  if (date < emp.joinDate) throw badRequest(`${fullName(emp)} joined on ${formatDateOnly(emp.joinDate)}`, 'BEFORE_JOIN_DATE');
  if (date > todayIn()) throw badRequest('Attendance cannot be recorded for a future date', 'FUTURE_DATE');
  return emp;
}

export async function upsert(auth: AuthContext, input: z.infer<typeof upsertAttendanceSchema>, source: AttendanceSource, actor: AuditActor) {
  const date = parseDateOnly(input.date);
  await assertEmployee(auth, input.employeeId, date);
  const computed = await buildRecord(prisma, auth.organisationId, input.employeeId, date, input);
  const data = { checkIn: input.checkIn ?? null, checkOut: input.checkOut ?? null, remarks: input.remarks ?? null, source, createdById: auth.userId, ...computed };
  const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: input.employeeId, date } } });
  const row = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date } },
    create: { organisationId: auth.organisationId, employeeId: input.employeeId, date, ...data },
    update: data,
    include,
  });
  await writeAudit(actor, {
    action: existing ? 'ATTENDANCE_UPDATED' : 'ATTENDANCE_RECORDED',
    module: 'attendance',
    recordId: row.id,
    oldValue: existing ? { status: existing.status, checkIn: existing.checkIn, checkOut: existing.checkOut } : undefined,
    newValue: { employeeId: input.employeeId, date: input.date, status: row.status, checkIn: row.checkIn, checkOut: row.checkOut },
  });
  return { ...row, employeeName: fullName(row.employee) };
}

export async function update(auth: AuthContext, id: string, input: z.infer<typeof updateAttendanceSchema>, actor: AuditActor) {
  const before = await prisma.attendance.findFirst({ where: { id, organisationId: auth.organisationId, employee: employeeScope(auth) } });
  if (!before) throw notFound('Attendance record');
  const merged = {
    checkIn: input.checkIn !== undefined ? input.checkIn : before.checkIn,
    checkOut: input.checkOut !== undefined ? input.checkOut : before.checkOut,
    status: input.status,
  };
  const computed = await buildRecord(prisma, auth.organisationId, before.employeeId, before.date, merged);
  const data = { ...merged, ...computed, remarks: input.remarks !== undefined ? input.remarks : before.remarks, source: 'ADMIN' as const };
  const row = await prisma.attendance.update({ where: { id }, data, include });
  const d = diff(before as unknown as Record<string, unknown>, data);
  if (d.changed) await writeAudit(actor, { action: 'ATTENDANCE_UPDATED', module: 'attendance', recordId: id, oldValue: d.oldValue, newValue: d.newValue });
  return { ...row, employeeName: fullName(row.employee) };
}

export async function remove(auth: AuthContext, id: string, actor: AuditActor) {
  const row = await prisma.attendance.findFirst({ where: { id, organisationId: auth.organisationId, employee: employeeScope(auth) } });
  if (!row) throw notFound('Attendance record');
  await prisma.attendance.delete({ where: { id } });
  await writeAudit(actor, { action: 'ATTENDANCE_DELETED', module: 'attendance', recordId: id, oldValue: { employeeId: row.employeeId, date: formatDateOnly(row.date), status: row.status } });
}

/** Record attendance for many employees on one date in a single transaction. */
export async function bulk(auth: AuthContext, input: z.infer<typeof bulkAttendanceSchema>, actor: AuditActor) {
  const date = parseDateOnly(input.date);
  if (date > todayIn()) throw badRequest('Attendance cannot be recorded for a future date', 'FUTURE_DATE');
  const ids = [...new Set(input.entries.map((e) => e.employeeId))];
  if (ids.length !== input.entries.length) throw badRequest('Each employee can appear only once', 'DUPLICATE_EMPLOYEE');
  const allowed = await prisma.employee.findMany({ where: { AND: [employeeScope(auth), { id: { in: ids } }, { joinDate: { lte: date } }] }, select: { id: true } });
  if (allowed.length !== ids.length) throw badRequest('Some employees were not found or had not joined by this date', 'INVALID_EMPLOYEES');

  const [shifts, cal] = await Promise.all([resolveShifts(ids, auth.organisationId, date), loadWorkCalendar(auth.organisationId, date, date)]);
  const kind = dayKind(date, cal);

  await prisma.$transaction(
    async (tx) => {
      for (const e of input.entries) {
        const shift = shifts.get(e.employeeId) ?? null;
        const status = e.status ?? (!e.checkIn ? (kind === 'HOLIDAY' ? 'HOLIDAY' : kind === 'WEEKEND' ? 'WEEKEND' : 'ABSENT') : undefined);
        const computed = computeAttendance({ checkIn: e.checkIn, checkOut: e.checkOut, status, shift: shift ? toShiftRule(shift) : null });
        const data = { checkIn: e.checkIn ?? null, checkOut: e.checkOut ?? null, remarks: e.remarks ?? null, source: 'ADMIN' as const, createdById: auth.userId, shiftId: shift?.id ?? null, ...computed };
        await tx.attendance.upsert({
          where: { employeeId_date: { employeeId: e.employeeId, date } },
          create: { organisationId: auth.organisationId, employeeId: e.employeeId, date, ...data },
          update: data,
        });
      }
      await writeAudit(actor, { action: 'ATTENDANCE_BULK_RECORDED', module: 'attendance', newValue: { date: input.date, count: input.entries.length } }, tx);
    },
    { timeout: 60_000 },
  );
  return { saved: input.entries.length };
}

/** Roster for bulk entry: every current employee with any existing record for the date. */
export async function roster(auth: AuthContext, dateStr: string, departmentId?: string) {
  const date = parseDateOnly(dateStr);
  const employees = await prisma.employee.findMany({
    where: { AND: [employeeScope(auth), { status: { notIn: [...EXIT_STATUSES] }, joinDate: { lte: date } }, departmentId ? { departmentId } : {}] },
    select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true, department: { select: { name: true } }, attendance: { where: { date } } },
    orderBy: { firstName: 'asc' },
  });
  return employees.map((e) => ({ employeeId: e.id, employeeCode: e.employeeCode, name: fullName(e), department: e.department?.name ?? null, record: e.attendance[0] ?? null }));
}

// ── Self service ─────────────────────────────────────────────

export async function selfCheck(auth: AuthContext, kind: 'in' | 'out', actor: AuditActor) {
  const employeeId = auth.employeeId!;
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: auth.organisationId }, select: { timezone: true } });
  const date = todayIn(org.timezone);
  const time = nowTimeIn(org.timezone);
  const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } });

  if (kind === 'in' && existing?.checkIn) throw conflict(`You already checked in at ${existing.checkIn}`, 'ALREADY_CHECKED_IN');
  if (kind === 'out' && !existing?.checkIn) throw badRequest('Check in first', 'NOT_CHECKED_IN');
  if (kind === 'out' && existing?.checkOut) throw conflict(`You already checked out at ${existing.checkOut}`, 'ALREADY_CHECKED_OUT');

  const entry = kind === 'in' ? { checkIn: time, checkOut: null } : { checkIn: existing!.checkIn, checkOut: time };
  const computed = await buildRecord(prisma, auth.organisationId, employeeId, date, entry);
  const row = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { organisationId: auth.organisationId, employeeId, date, ...entry, ...computed, source: 'EMPLOYEE', createdById: auth.userId },
    update: { ...entry, ...computed, source: 'EMPLOYEE' },
  });
  await writeAudit(actor, { action: kind === 'in' ? 'CHECK_IN' : 'CHECK_OUT', module: 'attendance', recordId: row.id, newValue: { time } });
  return row;
}

/** One employee's month, with every day filled in (records, holidays, weekends). */
export async function monthFor(organisationId: string, employeeId: string, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  const [records, cal, holidays, scans] = await Promise.all([
    prisma.attendance.findMany({ where: { employeeId, date: { gte: start, lte: end } }, orderBy: { date: 'asc' } }),
    loadWorkCalendar(organisationId, start, end),
    prisma.holiday.findMany({ where: { organisationId, status: 'ACTIVE', date: { gte: start, lte: end } } }),
    scansByDay(employeeId, start, end),
  ]);
  const byDate = new Map(records.map((r) => [formatDateOnly(r.date), r]));
  const holidayName = new Map(holidays.map((h) => [formatDateOnly(h.date), h.name]));
  const days = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const key = formatDateOnly(d);
    days.push({ date: key, dayType: dayKind(d, cal), holiday: holidayName.get(key) ?? null, record: byDate.get(key) ?? null, scans: scans.get(key) ?? [] });
  }
  const totals = {
    present: records.filter((r) => ['PRESENT', 'LATE', 'WORK_FROM_HOME'].includes(r.status)).length,
    halfDay: records.filter((r) => r.status === 'HALF_DAY').length,
    absent: records.filter((r) => r.status === 'ABSENT').length,
    late: records.filter((r) => r.status === 'LATE').length,
    leave: records.filter((r) => r.status === 'LEAVE').length,
    overtimeMinutes: records.reduce((s, r) => s + r.overtimeMinutes, 0),
    lateMinutes: records.reduce((s, r) => s + r.lateMinutes, 0),
    workMinutes: records.reduce((s, r) => s + r.workMinutes, 0),
  };
  return { year, month, days, totals };
}
