import { prisma, type Db } from '../lib/prisma';
import { formatDateOnly } from '../utils/dates';
import type { WorkCalendar } from './engines/calendar.engine';

/** Load the organisation's working days and active holidays for a date range. */
export async function loadWorkCalendar(organisationId: string, start: Date, end: Date, db: Db = prisma): Promise<WorkCalendar> {
  const [org, holidays] = await Promise.all([
    db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { workingDays: true } }),
    db.holiday.findMany({ where: { organisationId, status: 'ACTIVE', type: { not: 'OPTIONAL' }, date: { gte: start, lte: end } }, select: { date: true } }),
  ]);
  return { workingDays: org.workingDays, holidays: new Set(holidays.map((h) => formatDateOnly(h.date))) };
}
