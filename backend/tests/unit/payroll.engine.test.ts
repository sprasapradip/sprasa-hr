import { describe, expect, it } from 'vitest';
import { calculatePayroll, type PayrollInput, type SalaryLineInput, type AdjustmentInput } from '../../src/services/engines/payroll.engine';
import type { TaxSlab } from '../../src/services/engines/tax.engine';

const settings: PayrollInput['settings'] = {
  unpaidDayBasis: 'WORKING_DAYS',
  overtimeEnabled: true,
  overtimeRateMultiplier: 1.5,
  retirementDeductionCap: 500000,
  retirementDeductionMaxPercent: 33.33,
  roundNetSalary: false,
};

const meta = { componentId: null, taxable: true, reducesTaxableIncome: false, sortOrder: 10 };

const allowance = (value: number): SalaryLineInput => ({
  ...meta,
  code: 'ALW',
  name: 'Allowance',
  type: 'EARNING',
  category: 'ALLOWANCE',
  calculationType: 'FIXED',
  value,
});

const oneOff = (type: 'EARNING' | 'DEDUCTION', code: string, amount: number): AdjustmentInput => ({
  ...meta,
  code,
  name: code,
  type,
  category: type === 'EARNING' ? 'OVERTIME' : 'OTHER',
  taxable: type === 'EARNING',
  amount,
});

function base(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    basicSalary: 30000,
    lines: [],
    adjustments: [],
    workingDays: 26,
    calendarDays: 30,
    unpaidDays: 0,
    overtimeMinutes: 0,
    hoursPerDay: 8,
    settings,
    taxSlabs: [],
    ssfContributor: false,
    ...overrides,
  };
}

describe('payroll engine', () => {
  it('matches the specification example: gross 37,000 and 36,000 before tax', () => {
    const r = calculatePayroll(
      base({
        lines: [allowance(5000)],
        adjustments: [oneOff('EARNING', 'OT', 2000), oneOff('DEDUCTION', 'OTHER', 1000)],
      }),
    );
    expect(r.grossSalary).toBe(37000);
    expect(r.totalDeductions).toBe(1000);
    expect(r.netSalary).toBe(36000);
    expect(r.taxAmount).toBe(0);
  });

  it('deducts unpaid days at the daily rate on working-day basis', () => {
    const r = calculatePayroll(base({ basicSalary: 26000, unpaidDays: 2 }));
    expect(r.unpaidDeduction).toBe(2000);
    expect(r.netSalary).toBe(24000);
  });

  it('uses calendar days when configured', () => {
    const r = calculatePayroll(base({ basicSalary: 30000, unpaidDays: 3, settings: { ...settings, unpaidDayBasis: 'CALENDAR_DAYS' } }));
    expect(r.unpaidDeduction).toBe(3000);
  });

  it('never deducts more than basic for unpaid days', () => {
    const r = calculatePayroll(base({ basicSalary: 26000, unpaidDays: 40 }));
    expect(r.unpaidDeduction).toBe(26000);
  });

  it('pays overtime at the configured multiplier', () => {
    // hourly = 20800 / (26 * 8) = 100; 2h * 100 * 1.5 = 300
    const r = calculatePayroll(base({ basicSalary: 20800, overtimeMinutes: 120 }));
    expect(r.components.find((c) => c.category === 'OVERTIME')?.amount).toBe(300);
    expect(r.grossSalary).toBe(21100);
  });

  it('skips overtime when disabled', () => {
    const r = calculatePayroll(base({ overtimeMinutes: 600, settings: { ...settings, overtimeEnabled: false } }));
    expect(r.grossSalary).toBe(30000);
  });

  it('computes percentage deductions and reduces taxable income by retirement contributions', () => {
    const ssf: SalaryLineInput = {
      ...meta,
      code: 'SSF',
      name: 'SSF (employee 11%)',
      type: 'DEDUCTION',
      category: 'SOCIAL_SECURITY',
      calculationType: 'PERCENT_OF_BASIC',
      value: 11,
      taxable: false,
      reducesTaxableIncome: true,
    };
    const r = calculatePayroll(base({ basicSalary: 50000, lines: [ssf] }));
    expect(r.retirementContribution).toBe(5500);
    expect(r.taxableIncome).toBe(44500);
    expect(r.netSalary).toBe(44500);
  });

  it('applies configured tax slabs on annualised income', () => {
    const slabs: TaxSlab[] = [
      { ruleName: 'Slab 1', threshold: 0, rate: 1, deduction: 0, waivedForSsf: true },
      { ruleName: 'Slab 2', threshold: 500000, rate: 10, deduction: 0, waivedForSsf: false },
    ];
    // 50,000 × 12 = 600,000 → 500,000 × 1% + 100,000 × 10% = 15,000 / year = 1,250 / month
    const r = calculatePayroll(base({ basicSalary: 50000, taxSlabs: slabs }));
    expect(r.notes.annualTax).toBe(15000);
    expect(r.taxAmount).toBe(1250);
    expect(r.netSalary).toBe(48750);

    const ssfMember = calculatePayroll(base({ basicSalary: 50000, taxSlabs: slabs, ssfContributor: true }));
    expect(ssfMember.taxAmount).toBe(833.33);
  });

  it('rounds net salary when configured', () => {
    const r = calculatePayroll(base({ basicSalary: 30000.4, settings: { ...settings, roundNetSalary: true } }));
    expect(r.netSalary).toBe(30000);
  });
});
