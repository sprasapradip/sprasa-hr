import { eachDay, formatDateOnly, isoWeekday } from '../../utils/dates';

export interface WorkCalendar {
  /** ISO weekdays that are working days (1 = Mon … 7 = Sun). */
  workingDays: number[];
  /** Holiday dates as YYYY-MM-DD. */
  holidays: Set<string>;
}

export function isWorkingDay(date: Date, cal: WorkCalendar): boolean {
  return cal.workingDays.includes(isoWeekday(date)) && !cal.holidays.has(formatDateOnly(date));
}

export function workingDaysInRange(start: Date, end: Date, cal: WorkCalendar): number {
  let count = 0;
  for (const d of eachDay(start, end)) if (isWorkingDay(d, cal)) count++;
  return count;
}

export function dayKind(date: Date, cal: WorkCalendar): 'WORKING' | 'WEEKEND' | 'HOLIDAY' {
  if (cal.holidays.has(formatDateOnly(date))) return 'HOLIDAY';
  if (!cal.workingDays.includes(isoWeekday(date))) return 'WEEKEND';
  return 'WORKING';
}
