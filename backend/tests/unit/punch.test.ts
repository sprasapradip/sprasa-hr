import { describe, expect, it } from 'vitest';
import type { ShiftRule } from '../../src/services/engines/attendance.engine';
import { belongsToPreviousDay, pickInOut } from '../../src/services/engines/punch.engine';
import { normaliseDeviceUserId, parseAttLogLine, parsePunchFile, parseWallClock } from '../../src/modules/attendance/punch-file.parser';

const day: ShiftRule = { startTime: '09:00', endTime: '17:00', gracePeriod: 15, breakDuration: 60, workingHours: 7, isFlexible: false };
const night: ShiftRule = { ...day, startTime: '20:00', endTime: '06:00' };
const iso = (d: Date | null) => d?.toISOString().slice(0, 19);

describe('punch engine', () => {
  it('takes the first scan as check-in and the last as check-out', () => {
    expect(pickInOut([9 * 60 + 2, 13 * 60, 14 * 60, 17 * 60 + 30])).toEqual({ checkIn: '09:02', checkOut: '17:30' });
  });

  it('treats two scans a minute apart as one press, not a check-out', () => {
    expect(pickInOut([9 * 60 + 2, 9 * 60 + 3])).toEqual({ checkIn: '09:02', checkOut: null });
    expect(pickInOut([])).toBeNull();
  });

  it('wraps check-out past midnight for overnight shifts', () => {
    expect(pickInOut([20 * 60, 24 * 60 + 6 * 60 + 5])).toEqual({ checkIn: '20:00', checkOut: '06:05' });
  });

  it('gives early-morning scans to the previous night shift only', () => {
    expect(belongsToPreviousDay(6 * 60 + 5, night)).toBe(true);
    expect(belongsToPreviousDay(19 * 60 + 55, night)).toBe(false);
    expect(belongsToPreviousDay(6 * 60, day)).toBe(false);
    expect(belongsToPreviousDay(6 * 60, null)).toBe(false);
  });
});

describe('punch log parsing', () => {
  it('reads common time formats as wall-clock time', () => {
    expect(iso(parseWallClock('2026-10-01 09:03:12'))).toBe('2026-10-01T09:03:12');
    expect(iso(parseWallClock('2026/10/01 9:03'))).toBe('2026-10-01T09:03:00');
    expect(iso(parseWallClock('01/10/2026 5:30 PM', 'DMY'))).toBe('2026-10-01T17:30:00');
    expect(iso(parseWallClock('10/01/2026 05:30 pm', 'MDY'))).toBe('2026-10-01T17:30:00');
    expect(parseWallClock('2026-02-30 09:00')).toBeNull();
    expect(parseWallClock('yesterday')).toBeNull();
  });

  it('drops leading zeros from numeric machine IDs', () => {
    expect(normaliseDeviceUserId(' 0012 ')).toBe('12');
    expect(normaliseDeviceUserId('A-07')).toBe('A-07');
  });

  it('reads a ZKTeco USB attlog.dat download', async () => {
    const dat = '        1\t2026-09-28 09:02:11\t1\t1\t0\t0\n       12\t2026-09-28 17:45:00\t1\t1\t0\t0\n\n   7\tnot a time\t0\t1\n';
    const r = await parsePunchFile(Buffer.from(dat), '1_attlog.dat');
    expect(r.punches.map((p) => [p.deviceUserId, iso(p.punchedAt), p.deviceState, p.verifyMode])).toEqual([
      ['1', '2026-09-28T09:02:11', 1, 1],
      ['12', '2026-09-28T17:45:00', 1, 1],
    ]);
    expect(r.skipped).toHaveLength(1);
  });

  it('finds the columns in a vendor CSV report and works out day-first dates', async () => {
    const csv = 'Department,Name,AC-No.,Time,State\nOffice,Sita,0003,28/09/2026 9:01 AM,C/In\nOffice,Sita,0003,28/09/2026 6:10 PM,C/Out\n';
    const r = await parsePunchFile(Buffer.from(csv), 'report.csv');
    expect(r.punches.map((p) => [p.deviceUserId, iso(p.punchedAt)])).toEqual([
      ['3', '2026-09-28T09:01:00'],
      ['3', '2026-09-28T18:10:00'],
    ]);
    expect(r.dateOrder).toBe('DMY');
  });

  it('combines separate date and time columns', async () => {
    const csv = 'User ID,Date,Time\n5,2026-09-28,08:55\n';
    const r = await parsePunchFile(Buffer.from(csv), 'log.csv');
    expect(iso(r.punches[0].punchedAt)).toBe('2026-09-28T08:55:00');
  });

  it('parses a pushed ATTLOG line', () => {
    const p = parseAttLogLine('101\t2026-09-28 09:00:00\t0\t1\t0\t0\t0');
    expect(p && [p.deviceUserId, iso(p.punchedAt), p.deviceState, p.verifyMode]).toEqual(['101', '2026-09-28T09:00:00', 0, 1]);
    expect(parseAttLogLine('garbage')).toBeNull();
  });
});
