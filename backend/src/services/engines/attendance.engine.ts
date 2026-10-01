import type { AttendanceStatus } from '@prisma/client';
import { timeToMinutes } from '../../utils/dates';

export interface ShiftRule {
  startTime: string;
  endTime: string;
  gracePeriod: number;
  breakDuration: number;
  workingHours: number;
  isFlexible: boolean;
}

export interface AttendanceInput {
  checkIn?: string | null;
  checkOut?: string | null;
  /** Explicit status from the user (leave, holiday, WFH, absent…). */
  status?: AttendanceStatus | null;
  shift?: ShiftRule | null;
}

export interface AttendanceResult {
  status: AttendanceStatus;
  workMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
}

/** Statuses that are recorded as-is and never recalculated from times. */
const NON_WORK_STATUSES: AttendanceStatus[] = ['ABSENT', 'LEAVE', 'HOLIDAY', 'WEEKEND'];

const DAY = 24 * 60;

/**
 * Derive late / early-leave / overtime minutes and the status from check-in/out times and the shift.
 * Overnight shifts (end before start) and overnight check-outs are supported.
 */
export function computeAttendance(input: AttendanceInput): AttendanceResult {
  const zero = { workMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };

  if (input.status && NON_WORK_STATUSES.includes(input.status)) return { status: input.status, ...zero };
  if (!input.checkIn) return { status: input.status ?? 'ABSENT', ...zero };

  const shift = input.shift;
  const inMin = timeToMinutes(input.checkIn);
  let outMin = input.checkOut ? timeToMinutes(input.checkOut) : null;
  if (outMin !== null && outMin < inMin) outMin += DAY;

  const breakMin = shift?.breakDuration ?? 0;
  const workMinutes = outMin !== null ? Math.max(0, outMin - inMin - breakMin) : 0;

  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;
  const expectedWork = Math.round((shift?.workingHours ?? 8) * 60);

  if (shift && !shift.isFlexible) {
    const start = timeToMinutes(shift.startTime);
    let end = timeToMinutes(shift.endTime);
    if (end <= start) end += DAY;

    // Late minutes are counted from shift start, but only once the grace period is exceeded.
    if (inMin > start + shift.gracePeriod) lateMinutes = inMin - start;
    if (outMin !== null && outMin < end) earlyLeaveMinutes = end - outMin;
    if (outMin !== null && outMin > end) overtimeMinutes = outMin - end;
  } else if (outMin !== null) {
    // Flexible shift: only total hours matter.
    if (workMinutes < expectedWork) earlyLeaveMinutes = expectedWork - workMinutes;
    if (workMinutes > expectedWork) overtimeMinutes = workMinutes - expectedWork;
  }

  let status: AttendanceStatus;
  if (input.status === 'WORK_FROM_HOME') status = 'WORK_FROM_HOME';
  else if (input.status === 'HALF_DAY') status = 'HALF_DAY';
  else if (outMin !== null && workMinutes > 0 && workMinutes < expectedWork / 2) status = 'HALF_DAY';
  else if (lateMinutes > 0) status = 'LATE';
  else status = 'PRESENT';

  return { status, workMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes };
}

/** Status values that count as a paid working day for payroll. */
export const PRESENT_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'WORK_FROM_HOME', 'HALF_DAY'];
