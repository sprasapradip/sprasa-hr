import type { ShiftRule } from './attendance.engine';
import { timeToMinutes } from '../../utils/dates';

const DAY = 24 * 60;

/** Two scans this close together are one person pressing twice, not an in and an out. */
export const DOUBLE_SCAN_MINUTES = 5;

/** How long after an overnight shift ends a morning scan still counts as that shift's check-out. */
export const OVERNIGHT_SPILL_MINUTES = 4 * 60;

const isOvernight = (shift: ShiftRule | null | undefined) => Boolean(shift && !shift.isFlexible && timeToMinutes(shift.endTime) <= timeToMinutes(shift.startTime));

/**
 * Does an early-morning scan belong to yesterday's overnight shift?
 * `minute` is minutes past midnight on the scan's calendar day; `previousShift` is the shift
 * the employee worked the day before.
 */
export function belongsToPreviousDay(minute: number, previousShift: ShiftRule | null | undefined): boolean {
  if (!isOvernight(previousShift)) return false;
  return minute <= timeToMinutes(previousShift!.endTime) + OVERNIGHT_SPILL_MINUTES;
}

const hhmm = (m: number) => {
  const v = ((m % DAY) + DAY) % DAY;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

/**
 * First scan is the check-in, last scan is the check-out. Scans in between (lunch, double presses)
 * are ignored. Minutes are counted from midnight of the attendance day, so a scan after midnight
 * on an overnight shift is passed in as 1440 + minutes.
 */
export function pickInOut(minutes: number[]): { checkIn: string; checkOut: string | null } | null {
  if (minutes.length === 0) return null;
  const first = Math.min(...minutes);
  const last = Math.max(...minutes);
  return { checkIn: hhmm(first), checkOut: last - first >= DOUBLE_SCAN_MINUTES ? hhmm(last) : null };
}
