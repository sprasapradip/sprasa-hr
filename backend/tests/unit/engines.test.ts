import { describe, expect, it } from 'vitest';
import { computeAttendance, type ShiftRule } from '../../src/services/engines/attendance.engine';
import { workingDaysInRange, type WorkCalendar } from '../../src/services/engines/calendar.engine';
import {
  carryForwardDays,
  countLeaveDays,
  proratedEntitlement,
  remainingBalance,
} from '../../src/services/engines/leave.engine';
import { calculateAnnualTax } from '../../src/services/engines/tax.engine';
import { parseDateOnly } from '../../src/utils/dates';

const morning: ShiftRule = { startTime: '09:00', endTime: '17:00', gracePeriod: 15, breakDuration: 60, workingHours: 7, isFlexible: false };

describe('attendance engine', () => {
  it('marks on-time arrival within grace as present', () => {
    const r = computeAttendance({ checkIn: '09:10', checkOut: '17:00', shift: morning });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
    expect(r.workMinutes).toBe(410);
  });

  it('counts late minutes from shift start once grace is exceeded', () => {
    const r = computeAttendance({ checkIn: '09:20', checkOut: '17:00', shift: morning });
    expect(r.status).toBe('LATE');
    expect(r.lateMinutes).toBe(20);
  });

  it('computes early leave and overtime', () => {
    expect(computeAttendance({ checkIn: '09:00', checkOut: '16:30', shift: morning }).earlyLeaveMinutes).toBe(30);
    expect(computeAttendance({ checkIn: '09:00', checkOut: '18:15', shift: morning }).overtimeMinutes).toBe(75);
  });

  it('flags a short day as half day', () => {
    expect(computeAttendance({ checkIn: '09:00', checkOut: '11:30', shift: morning }).status).toBe('HALF_DAY');
  });

  it('handles overnight shifts', () => {
    const night: ShiftRule = { ...morning, startTime: '22:00', endTime: '06:00' };
    const r = computeAttendance({ checkIn: '22:05', checkOut: '06:30', shift: night });
    expect(r.status).toBe('PRESENT');
    expect(r.overtimeMinutes).toBe(30);
  });

  it('keeps explicit non-work statuses and missing check-in as absent', () => {
    expect(computeAttendance({ status: 'LEAVE', checkIn: '09:00', shift: morning }).status).toBe('LEAVE');
    expect(computeAttendance({ shift: morning }).status).toBe('ABSENT');
  });

  it('uses total hours on flexible shifts', () => {
    const flex = { ...morning, isFlexible: true, workingHours: 8, breakDuration: 0 };
    const r = computeAttendance({ checkIn: '11:00', checkOut: '20:00', shift: flex });
    expect(r.lateMinutes).toBe(0);
    expect(r.overtimeMinutes).toBe(60);
  });
});

// Nepal default: Sunday–Friday working, Saturday off.
const cal: WorkCalendar = { workingDays: [7, 1, 2, 3, 4, 5], holidays: new Set(['2026-10-21']) };

describe('calendar + leave engine', () => {
  it('counts working days excluding Saturdays and holidays', () => {
    // 2026-10-18 (Sun) … 2026-10-24 (Sat): 6 working days minus 1 holiday
    expect(workingDaysInRange(parseDateOnly('2026-10-18'), parseDateOnly('2026-10-24'), cal)).toBe(5);
  });

  it('counts leave days using the leave settings', () => {
    const opts = { halfDay: false, countWeekends: false, countHolidays: false };
    const start = parseDateOnly('2026-10-18');
    const end = parseDateOnly('2026-10-24');
    expect(countLeaveDays(start, end, cal, opts)).toBe(5);
    expect(countLeaveDays(start, end, cal, { ...opts, countWeekends: true, countHolidays: true })).toBe(7);
  });

  it('handles half days', () => {
    const d = parseDateOnly('2026-10-19');
    expect(countLeaveDays(d, d, cal, { halfDay: true, countWeekends: false, countHolidays: false })).toBe(0.5);
    expect(() => countLeaveDays(d, parseDateOnly('2026-10-20'), cal, { halfDay: true, countWeekends: false, countHolidays: false })).toThrow();
  });

  it('rejects end before start', () => {
    expect(() =>
      countLeaveDays(parseDateOnly('2026-10-20'), parseDateOnly('2026-10-19'), cal, { halfDay: false, countWeekends: false, countHolidays: false }),
    ).toThrow();
  });

  it('matches the specification example: 18 entitled, 5 used, 13 remaining', () => {
    expect(remainingBalance({ entitled: 18, carriedForward: 0, adjusted: 0, used: 5, pending: 0 })).toBe(13);
  });

  it('reserves pending days', () => {
    expect(remainingBalance({ entitled: 18, carriedForward: 2, adjusted: 1, used: 5, pending: 3 })).toBe(13);
  });

  it('caps carry forward by policy', () => {
    const prev = { entitled: 18, carriedForward: 0, adjusted: 0, used: 5, pending: 0 };
    expect(carryForwardDays(prev, { carryForward: true, maxCarryForward: 10 })).toBe(10);
    expect(carryForwardDays(prev, { carryForward: true, maxCarryForward: 20 })).toBe(13);
    expect(carryForwardDays(prev, { carryForward: false, maxCarryForward: 20 })).toBe(0);
  });

  it('pro-rates entitlement for mid-year joiners', () => {
    expect(proratedEntitlement(18, parseDateOnly('2025-03-01'), 2026)).toBe(18);
    expect(proratedEntitlement(18, parseDateOnly('2026-07-10'), 2026)).toBe(9);
  });
});

describe('tax engine', () => {
  const slabs = [
    { ruleName: 'A', threshold: 0, rate: 1, deduction: 0, waivedForSsf: true },
    { ruleName: 'B', threshold: 500000, rate: 10, deduction: 0, waivedForSsf: false },
    { ruleName: 'C', threshold: 700000, rate: 20, deduction: 0, waivedForSsf: false },
  ];

  it('applies progressive slabs', () => {
    // 500k×1% + 200k×10% + 100k×20% = 5,000 + 20,000 + 20,000
    const r = calculateAnnualTax(800000, slabs, { ssfContributor: false });
    expect(r.annualTax).toBe(45000);
    expect(r.breakdown).toHaveLength(3);
  });

  it('waives slabs for SSF contributors when configured', () => {
    expect(calculateAnnualTax(800000, slabs, { ssfContributor: true }).annualTax).toBe(40000);
  });

  it('sorts slabs regardless of input order and applies rebates', () => {
    const r = calculateAnnualTax(600000, [{ ...slabs[1], deduction: 1000 }, slabs[0]], { ssfContributor: false });
    expect(r.annualTax).toBe(5000 + 10000 - 1000);
  });

  it('returns zero with no slabs or no income', () => {
    expect(calculateAnnualTax(1000000, [], { ssfContributor: false }).annualTax).toBe(0);
    expect(calculateAnnualTax(0, slabs, { ssfContributor: false }).annualTax).toBe(0);
  });
});
