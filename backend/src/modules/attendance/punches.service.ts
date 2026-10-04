import type { Attendance, AttendanceStatus, Prisma, PunchSource } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Db } from '../../lib/prisma';
import { employeeScope } from '../../services/access.service';
import { writeAudit, type AuditActor } from '../../services/audit.service';
import { computeAttendance } from '../../services/engines/attendance.engine';
import { belongsToPreviousDay, pickInOut } from '../../services/engines/punch.engine';
import { resolveShift, toShiftRule } from '../../services/shift-resolver.service';
import type { AuthContext } from '../../types/express';
import { addDays, formatDateOnly, parseDateOnly, timeToMinutes, todayIn } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { paginated, paginationQuery, paging } from '../../utils/pagination';
import { zDate } from '../../utils/validation';
import { fullName } from '../employees/employees.service';
import type { ParsedPunch } from './punch-file.parser';

const DAY = 24 * 60;
const pad = (n: number) => String(n).padStart(2, '0');

/** Punch times are wall clock held in UTC fields, so these never apply a timezone. */
export const punchDate = (d: Date) => formatDateOnly(d);
export const punchTime = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const minuteOfDay = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

/** Times HR typed in (or confirmed) are kept. The machine only overrides a bare "absent / off" mark. */
const PRESENCE: AttendanceStatus[] = ['PRESENT', 'LATE', 'HALF_DAY', 'WORK_FROM_HOME'];
function heldByHr(existing: Attendance): boolean {
  if (existing.status === 'LEAVE') return true;
  if (!['MANUAL', 'ADMIN', 'IMPORT'].includes(existing.source)) return false;
  return Boolean(existing.checkIn) || PRESENCE.includes(existing.status);
}

/**
 * Rebuild attendance for one employee on the given days from their scans.
 * Returns the number of days written. Days with no scans are left alone.
 */
export async function processDays(organisationId: string, employeeId: string, days: Date[], db: Db = prisma): Promise<number> {
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { joinDate: true, organisation: { select: { timezone: true } } } });
  if (!emp) return 0;
  const today = todayIn(emp.organisation.timezone);
  const unique = [...new Set(days.map((d) => d.getTime()))].sort((a, b) => a - b).map((t) => new Date(t));

  let written = 0;
  for (const day of unique) {
    if (day > today || day < emp.joinDate) continue;
    const [prev, shift] = await Promise.all([resolveShift(employeeId, organisationId, addDays(day, -1), db), resolveShift(employeeId, organisationId, day, db)]);
    const prevRule = prev ? toShiftRule(prev) : null;
    const rule = shift ? toShiftRule(shift) : null;

    const scans = await db.attendancePunch.findMany({ where: { employeeId, punchedAt: { gte: day, lt: addDays(day, 2) } }, select: { punchedAt: true } });
    const minutes: number[] = [];
    for (const s of scans) {
      const m = minuteOfDay(s.punchedAt);
      if (punchDate(s.punchedAt) === formatDateOnly(day)) {
        if (!belongsToPreviousDay(m, prevRule)) minutes.push(m);
      } else if (belongsToPreviousDay(m, rule)) {
        minutes.push(DAY + m);
      }
    }
    if (minutes.length === 0) continue;

    const existing = await db.attendance.findUnique({ where: { employeeId_date: { employeeId, date: day } } });
    if (existing && heldByHr(existing)) continue;
    // Someone who checked in on the web and scanned out on the machine: keep both.
    // A rejected web check-in is ignored: the machine scans alone decide the day.
    const rejectedWebEntry = existing?.approvalStatus === 'REJECTED';
    if (existing?.source === 'EMPLOYEE' && existing.checkIn && !rejectedWebEntry) {
      const inMin = timeToMinutes(existing.checkIn);
      minutes.push(inMin);
      if (existing.checkOut) {
        const outMin = timeToMinutes(existing.checkOut);
        minutes.push(outMin < inMin ? DAY + outMin : outMin);
      }
    }

    const picked = pickInOut(minutes)!;
    const computed = computeAttendance({ ...picked, shift: rule });
    // Scans are trusted. A day that still mixes in pending web times keeps waiting for HR.
    const mixesPendingWebTimes = existing?.source === 'EMPLOYEE' && existing.approvalStatus === 'PENDING';
    const review = mixesPendingWebTimes ? {} : { approvalStatus: null, approvedById: null, approvedAt: null, rejectionReason: null };
    const data = { ...picked, ...computed, shiftId: shift?.id ?? null, source: 'DEVICE' as const, ...review };
    await db.attendance.upsert({
      where: { employeeId_date: { employeeId, date: day } },
      create: { organisationId, employeeId, date: day, ...data },
      update: data,
    });
    written++;
  }
  return written;
}

/** The days a batch of scans can affect: its own day, and the day before for early-morning scans (overnight shifts). */
function affectedDays(rows: { employeeId: string | null; punchedAt: Date }[]) {
  const byEmployee = new Map<string, Date[]>();
  for (const r of rows) {
    if (!r.employeeId) continue;
    const day = parseDateOnly(r.punchedAt);
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push(day);
    if (minuteOfDay(r.punchedAt) < 12 * 60) list.push(addDays(day, -1));
    byEmployee.set(r.employeeId, list);
  }
  return byEmployee;
}

export interface IngestResult {
  received: number;
  saved: number;
  duplicates: number;
  daysUpdated: number;
  /** Machine user numbers with no employee attached yet. */
  unmatched: string[];
}

/** Store scans (duplicates are ignored, so re-sending the same log is safe) and update attendance. */
export async function ingest(organisationId: string, source: PunchSource, punches: ParsedPunch[], deviceId: string | null = null): Promise<IngestResult> {
  const ids = [...new Set(punches.map((p) => p.deviceUserId))];
  const employees = ids.length
    ? await prisma.employee.findMany({ where: { organisationId, deviceUserId: { in: ids }, deletedAt: null }, select: { id: true, deviceUserId: true } })
    : [];
  const byDeviceUser = new Map(employees.map((e) => [e.deviceUserId!, e.id]));

  const inserted: { employeeId: string | null; punchedAt: Date }[] = [];
  for (let i = 0; i < punches.length; i += 1000) {
    const chunk = punches.slice(i, i + 1000);
    const rows = await prisma.attendancePunch.createManyAndReturn({
      data: chunk.map((p) => ({
        organisationId,
        deviceId,
        deviceUserId: p.deviceUserId,
        employeeId: byDeviceUser.get(p.deviceUserId) ?? null,
        punchedAt: p.punchedAt,
        source,
        deviceState: p.deviceState ?? null,
        verifyMode: p.verifyMode ?? null,
      })),
      skipDuplicates: true,
      select: { employeeId: true, punchedAt: true },
    });
    inserted.push(...rows);
  }

  let daysUpdated = 0;
  for (const [employeeId, days] of affectedDays(inserted)) daysUpdated += await processDays(organisationId, employeeId, days);

  if (deviceId && inserted.length) {
    const latest = inserted.reduce((a, b) => (b.punchedAt > a ? b.punchedAt : a), inserted[0].punchedAt);
    await prisma.attendanceDevice.updateMany({ where: { id: deviceId, OR: [{ lastPunchAt: null }, { lastPunchAt: { lt: latest } }] }, data: { lastPunchAt: latest } });
  }

  return { received: punches.length, saved: inserted.length, duplicates: punches.length - inserted.length, daysUpdated, unmatched: ids.filter((id) => !byDeviceUser.has(id)) };
}

/**
 * Point scans at an employee after their machine number is set or changed.
 * Scans under their old number are released so they can be linked to whoever owns it now.
 */
export async function syncEmployeePunches(organisationId: string, employeeId: string, deviceUserId: string | null, previous: string | null = null) {
  if (previous && previous !== deviceUserId) {
    await prisma.attendancePunch.updateMany({ where: { organisationId, employeeId, deviceUserId: previous }, data: { employeeId: null } });
  }
  if (!deviceUserId) return 0;
  const orphans = await prisma.attendancePunch.findMany({ where: { organisationId, deviceUserId, employeeId: null }, select: { id: true, punchedAt: true } });
  if (orphans.length === 0) return 0;
  await prisma.attendancePunch.updateMany({ where: { id: { in: orphans.map((o) => o.id) } }, data: { employeeId } });
  const days = affectedDays(orphans.map((o) => ({ employeeId, punchedAt: o.punchedAt }))).get(employeeId) ?? [];
  return processDays(organisationId, employeeId, days);
}

// ── HR screens ───────────────────────────────────────────────

export const listPunchesQuery = paginationQuery.extend({
  from: zDate.optional(),
  to: zDate.optional(),
  deviceId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  unmatched: z.enum(['true', 'false']).optional(),
});

export async function list(auth: AuthContext, q: z.infer<typeof listPunchesQuery>) {
  const where: Prisma.AttendancePunchWhereInput = {
    organisationId: auth.organisationId,
    ...(q.from || q.to ? { punchedAt: { ...(q.from ? { gte: parseDateOnly(q.from) } : {}), ...(q.to ? { lt: addDays(parseDateOnly(q.to), 1) } : {}) } } : {}),
    ...(q.deviceId ? { deviceId: q.deviceId } : {}),
    ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    AND: [
      q.unmatched === 'true' ? { employeeId: null } : { OR: [{ employeeId: null }, { employee: employeeScope(auth) }] },
      q.search
        ? { OR: [{ deviceUserId: q.search.trim() }, { employee: { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { employeeCode: { contains: q.search, mode: 'insensitive' } }] } }] }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.attendancePunch.findMany({
      where,
      include: { employee: { select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true } }, device: { select: { id: true, name: true } } },
      orderBy: { punchedAt: 'desc' },
      ...paging(q),
    }),
    prisma.attendancePunch.count({ where }),
  ]);
  return paginated(
    rows.map((r) => ({
      id: r.id,
      deviceUserId: r.deviceUserId,
      date: punchDate(r.punchedAt),
      time: punchTime(r.punchedAt),
      source: r.source,
      device: r.device,
      employee: r.employee ? { id: r.employee.id, employeeCode: r.employee.employeeCode, name: fullName(r.employee) } : null,
    })),
    total,
    q,
  );
}

/** Machine numbers that have scans but no employee yet, busiest first. */
export async function unmatched(auth: AuthContext) {
  const groups = await prisma.attendancePunch.groupBy({
    by: ['deviceUserId'],
    where: { organisationId: auth.organisationId, employeeId: null },
    _count: true,
    _min: { punchedAt: true },
    _max: { punchedAt: true },
    orderBy: { _count: { deviceUserId: 'desc' } },
    take: 200,
  });
  return groups.map((g) => ({
    deviceUserId: g.deviceUserId,
    scans: g._count,
    firstScan: g._min.punchedAt ? `${punchDate(g._min.punchedAt)} ${punchTime(g._min.punchedAt).slice(0, 5)}` : null,
    lastScan: g._max.punchedAt ? `${punchDate(g._max.punchedAt)} ${punchTime(g._max.punchedAt).slice(0, 5)}` : null,
  }));
}

export const linkSchema = z.object({ deviceUserId: z.string().trim().min(1).max(30), employeeId: z.string().uuid() });

export async function link(auth: AuthContext, input: z.infer<typeof linkSchema>, actor: AuditActor) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id: input.employeeId }] } });
  if (!emp) throw notFound('Employee');
  const owner = await prisma.employee.findFirst({ where: { organisationId: auth.organisationId, deviceUserId: input.deviceUserId, id: { not: emp.id } } });
  if (owner) throw conflict(`Machine number ${input.deviceUserId} already belongs to ${fullName(owner)}`, 'DEVICE_USER_TAKEN');

  await prisma.employee.update({ where: { id: emp.id }, data: { deviceUserId: input.deviceUserId } });
  const daysUpdated = await syncEmployeePunches(auth.organisationId, emp.id, input.deviceUserId, emp.deviceUserId);
  await writeAudit(actor, { action: 'DEVICE_USER_LINKED', module: 'attendance', recordId: emp.id, oldValue: { deviceUserId: emp.deviceUserId }, newValue: { deviceUserId: input.deviceUserId } });
  return { employeeId: emp.id, name: fullName(emp), daysUpdated };
}

export const reprocessSchema = z.object({ from: zDate, to: zDate, employeeId: z.string().uuid().optional() });

/** Rebuild attendance from scans, e.g. after a shift was changed or a wrong machine number was fixed. */
export async function reprocess(auth: AuthContext, input: z.infer<typeof reprocessSchema>, actor: AuditActor) {
  const from = parseDateOnly(input.from);
  const to = parseDateOnly(input.to);
  if (to < from) throw badRequest('The end date is before the start date', 'INVALID_RANGE');
  if (to.getTime() - from.getTime() > 92 * 86_400_000) throw badRequest('Pick three months or less at a time', 'RANGE_TOO_LONG');

  const scans = await prisma.attendancePunch.findMany({
    where: { organisationId: auth.organisationId, punchedAt: { gte: from, lt: addDays(to, 1) }, employee: employeeScope(auth), ...(input.employeeId ? { employeeId: input.employeeId } : {}) },
    select: { employeeId: true, punchedAt: true },
  });
  let daysUpdated = 0;
  for (const [employeeId, days] of affectedDays(scans)) {
    daysUpdated += await processDays(auth.organisationId, employeeId, days.filter((d) => d >= from && d <= to));
  }
  await writeAudit(actor, { action: 'ATTENDANCE_REPROCESSED', module: 'attendance', newValue: { ...input, daysUpdated } });
  return { scans: scans.length, daysUpdated };
}

/** Scans for one employee, grouped by calendar day, for the self-service and profile views. */
export async function scansByDay(employeeId: string, start: Date, end: Date) {
  const rows = await prisma.attendancePunch.findMany({
    where: { employeeId, punchedAt: { gte: start, lt: addDays(end, 1) } },
    select: { punchedAt: true, source: true, device: { select: { name: true, location: true } } },
    orderBy: { punchedAt: 'asc' },
  });
  const map = new Map<string, { time: string; device: string | null }[]>();
  for (const r of rows) {
    const key = punchDate(r.punchedAt);
    const list = map.get(key) ?? [];
    list.push({ time: punchTime(r.punchedAt).slice(0, 5), device: r.device ? [r.device.name, r.device.location].filter(Boolean).join(', ') : r.source === 'FILE_IMPORT' ? 'Imported log' : null });
    map.set(key, list);
  }
  return map;
}
