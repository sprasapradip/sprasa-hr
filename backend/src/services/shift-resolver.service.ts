import type { Shift } from '@prisma/client';
import { prisma, type Db } from '../lib/prisma';
import { toNumber } from '../utils/money';
import type { ShiftRule } from './engines/attendance.engine';

export function toShiftRule(shift: Shift): ShiftRule {
  return {
    startTime: shift.startTime,
    endTime: shift.endTime,
    gracePeriod: shift.gracePeriod,
    breakDuration: shift.breakDuration,
    workingHours: toNumber(shift.workingHours),
    isFlexible: shift.isFlexible,
  };
}

/** The shift that applies to an employee on a date: their assignment, else the organisation default. */
export async function resolveShift(employeeId: string, organisationId: string, date: Date, db: Db = prisma): Promise<Shift | null> {
  const assignment = await db.employeeShift.findFirst({
    where: { employeeId, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] },
    orderBy: { effectiveFrom: 'desc' },
    include: { shift: true },
  });
  if (assignment) return assignment.shift;
  const org = await db.organisation.findUnique({ where: { id: organisationId }, select: { defaultShiftId: true } });
  return org?.defaultShiftId ? db.shift.findUnique({ where: { id: org.defaultShiftId } }) : null;
}

/** Bulk version for many employees on one date, avoiding N+1 queries. */
export async function resolveShifts(employeeIds: string[], organisationId: string, date: Date, db: Db = prisma) {
  const [assignments, org] = await Promise.all([
    db.employeeShift.findMany({
      where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] },
      orderBy: { effectiveFrom: 'desc' },
      include: { shift: true },
    }),
    db.organisation.findUnique({ where: { id: organisationId }, select: { defaultShiftId: true } }),
  ]);
  const fallback = org?.defaultShiftId ? await db.shift.findUnique({ where: { id: org.defaultShiftId } }) : null;
  const map = new Map<string, Shift | null>();
  for (const a of assignments) if (!map.has(a.employeeId)) map.set(a.employeeId, a.shift);
  for (const id of employeeIds) if (!map.has(id)) map.set(id, fallback);
  return map;
}
