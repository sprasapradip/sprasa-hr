import { eachDay } from '../../utils/dates';
import { round2 } from '../../utils/money';
import { dayKind, type WorkCalendar } from './calendar.engine';

export interface LeaveDayOptions {
  halfDay: boolean;
  countWeekends: boolean;
  countHolidays: boolean;
}

/**
 * Number of leave days a request consumes. Weekends and holidays inside the range are
 * skipped unless the organisation's leave settings say otherwise.
 */
export function countLeaveDays(start: Date, end: Date, cal: WorkCalendar, opts: LeaveDayOptions): number {
  if (end.getTime() < start.getTime()) throw new Error('End date is before start date');
  if (opts.halfDay) {
    if (start.getTime() !== end.getTime()) throw new Error('A half-day request must start and end on the same day');
    const kind = dayKind(start, cal);
    if ((kind === 'WEEKEND' && !opts.countWeekends) || (kind === 'HOLIDAY' && !opts.countHolidays)) return 0;
    return 0.5;
  }
  let days = 0;
  for (const d of eachDay(start, end)) {
    const kind = dayKind(d, cal);
    if (kind === 'WORKING') days++;
    else if (kind === 'WEEKEND' && opts.countWeekends) days++;
    else if (kind === 'HOLIDAY' && opts.countHolidays) days++;
  }
  return days;
}

export interface BalanceFigures {
  entitled: number;
  carriedForward: number;
  adjusted: number;
  used: number;
  pending: number;
}

/** Days still available to request (pending requests are already reserved). */
export function remainingBalance(b: BalanceFigures): number {
  return round2(b.entitled + b.carriedForward + b.adjusted - b.used - b.pending);
}

/** Days available once pending requests are resolved (used for display). */
export function availableAfterApproved(b: BalanceFigures): number {
  return round2(b.entitled + b.carriedForward + b.adjusted - b.used);
}

export interface CarryForwardPolicy {
  carryForward: boolean;
  maxCarryForward: number;
}

/** Carry-forward into the next year: unused days, capped by the leave type's policy. */
export function carryForwardDays(previous: BalanceFigures | null, policy: CarryForwardPolicy): number {
  if (!previous || !policy.carryForward) return 0;
  const unused = Math.max(0, availableAfterApproved(previous));
  return round2(Math.min(unused, policy.maxCarryForward));
}

/**
 * Entitlement for an employee who joins partway through the year: pro-rated by remaining
 * whole months and rounded to the nearest half day.
 */
export function proratedEntitlement(annualDays: number, joinDate: Date, year: number): number {
  if (joinDate.getUTCFullYear() < year) return annualDays;
  if (joinDate.getUTCFullYear() > year) return 0;
  const monthsRemaining = 12 - joinDate.getUTCMonth();
  return Math.round(((annualDays * monthsRemaining) / 12) * 2) / 2;
}
