import { addDaysISO, formatDate, formatMoney, initials, titleCase } from '@/lib/utils';
import { NEPAL_PHONE } from '@/lib/nepal';

describe('formatting', () => {
  it('formats NPR with South Asian grouping', () => {
    expect(formatMoney(3700000)).toBe('NPR 37,00,000.00');
    expect(formatMoney(null)).toBe('—');
  });

  it('formats calendar dates without timezone drift', () => {
    expect(formatDate('2026-07-17')).toBe('17 Jul 2026');
    expect(formatDate('2026-07-17T23:30:00.000Z', 'long')).toBe('17 July 2026');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('title-cases enum values and builds initials', () => {
    expect(titleCase('WORK_FROM_HOME')).toBe('Work From Home');
    expect(initials('Sita Kumari Sharma')).toBe('SK');
  });

  it('accepts Nepali mobile and landline numbers', () => {
    for (const ok of ['9841234567', '+977 9812345678', '01-4000000', '9771234567']) expect(NEPAL_PHONE.test(ok)).toBe(true);
    for (const bad of ['12345', '9512345678', 'abc']) expect(NEPAL_PHONE.test(bad)).toBe(false);
  });
});
