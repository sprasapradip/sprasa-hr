import type { CalculationType, ComponentCategory, ComponentType } from '@prisma/client';
import { round2 } from '../../utils/money';
import type { PayrollSettings } from '../settings.service';
import { calculateAnnualTax, type TaxBreakdownLine, type TaxSlab } from './tax.engine';

/**
 * Monthly payroll calculation for one employee. Pure function: all inputs are passed in,
 * nothing is read from the database, which keeps it deterministic and unit-testable.
 *
 *   gross            = basic + allowances + overtime + bonus/commission
 *   total deductions = tax + PF/SSF + loan + advance + unpaid leave + other
 *   net              = gross − total deductions
 */

export interface ComponentMeta {
  componentId: string | null;
  code: string;
  name: string;
  type: ComponentType;
  category: ComponentCategory;
  taxable: boolean;
  reducesTaxableIncome: boolean;
  sortOrder: number;
}

export interface SalaryLineInput extends ComponentMeta {
  calculationType: CalculationType;
  value: number;
}

export interface AdjustmentInput extends ComponentMeta {
  amount: number;
}

export interface PayrollInput {
  basicSalary: number;
  lines: SalaryLineInput[];
  adjustments: AdjustmentInput[];
  workingDays: number;
  calendarDays: number;
  unpaidDays: number;
  overtimeMinutes: number;
  /** Scheduled hours per working day, used for the overtime hourly rate. */
  hoursPerDay: number;
  settings: Pick<
    PayrollSettings,
    'unpaidDayBasis' | 'overtimeEnabled' | 'overtimeRateMultiplier' | 'retirementDeductionCap' | 'retirementDeductionMaxPercent' | 'roundNetSalary'
  >;
  taxSlabs: TaxSlab[];
  ssfContributor: boolean;
  /** Metadata for the overtime line; falls back to a generic "Overtime" earning. */
  overtimeComponent?: ComponentMeta;
}

export interface ComputedComponent extends ComponentMeta {
  amount: number;
}

export interface PayrollResult {
  components: ComputedComponent[];
  basicSalary: number;
  totalAllowances: number;
  grossSalary: number;
  unpaidDeduction: number;
  retirementContribution: number;
  retirementDeductible: number;
  taxableIncome: number;
  taxAmount: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  notes: {
    dailyRate: number;
    overtimeHourlyRate: number;
    annualTaxableIncome: number;
    annualTax: number;
    taxBreakdown: TaxBreakdownLine[];
    disclaimer: string;
  };
}

export const TAX_DISCLAIMER =
  'Tax is calculated from the tax rules configured for this organisation. Verify the configuration against current Nepal requirements with your accountant or tax professional.';

const BASIC_META: ComponentMeta = {
  componentId: null,
  code: 'BASIC',
  name: 'Basic Salary',
  type: 'EARNING',
  category: 'BASIC',
  taxable: true,
  reducesTaxableIncome: false,
  sortOrder: 0,
};

const OVERTIME_META: ComponentMeta = {
  componentId: null,
  code: 'OT',
  name: 'Overtime',
  type: 'EARNING',
  category: 'OVERTIME',
  taxable: true,
  reducesTaxableIncome: false,
  sortOrder: 50,
};

const UNPAID_META: ComponentMeta = {
  componentId: null,
  code: 'UNPAID',
  name: 'Unpaid Leave / Absence',
  type: 'DEDUCTION',
  category: 'UNPAID_LEAVE',
  taxable: false,
  reducesTaxableIncome: false,
  sortOrder: 90,
};

const TAX_META: ComponentMeta = {
  componentId: null,
  code: 'TAX',
  name: 'Income Tax (TDS)',
  type: 'DEDUCTION',
  category: 'TAX',
  taxable: false,
  reducesTaxableIncome: false,
  sortOrder: 100,
};

const RETIREMENT: ComponentCategory[] = ['PROVIDENT_FUND', 'SOCIAL_SECURITY'];

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const basic = round2(input.basicSalary);
  const s = input.settings;
  const earnings: ComputedComponent[] = [{ ...BASIC_META, amount: basic }];
  const deductions: ComputedComponent[] = [];

  // 1. Fixed and basic-linked earnings from the salary structure.
  for (const line of input.lines.filter((l) => l.type === 'EARNING')) {
    const amount = line.calculationType === 'FIXED' ? line.value : (basic * line.value) / 100;
    if (amount > 0) earnings.push({ ...line, amount: round2(amount) });
  }

  // 2. Overtime.
  const dayDivisor = s.unpaidDayBasis === 'CALENDAR_DAYS' ? input.calendarDays : input.workingDays;
  const dailyRate = dayDivisor > 0 ? basic / dayDivisor : 0;
  const hourlyDivisor = input.workingDays * input.hoursPerDay;
  const overtimeHourlyRate = hourlyDivisor > 0 ? basic / hourlyDivisor : 0;
  if (s.overtimeEnabled && input.overtimeMinutes > 0 && overtimeHourlyRate > 0) {
    const amount = (input.overtimeMinutes / 60) * overtimeHourlyRate * s.overtimeRateMultiplier;
    earnings.push({ ...(input.overtimeComponent ?? OVERTIME_META), amount: round2(amount) });
  }

  // 3. One-off earnings for the month (bonus, commission, arrears).
  for (const adj of input.adjustments.filter((a) => a.type === 'EARNING')) {
    if (adj.amount > 0) earnings.push({ ...adj, amount: round2(adj.amount) });
  }

  const gross = round2(earnings.reduce((sum, e) => sum + e.amount, 0));
  const taxableEarnings = earnings.filter((e) => e.taxable).reduce((sum, e) => sum + e.amount, 0);

  // 4. Unpaid days (unpaid leave + absences), never more than basic.
  const unpaidDeduction = round2(Math.min(basic, dailyRate * input.unpaidDays));
  if (unpaidDeduction > 0) deductions.push({ ...UNPAID_META, amount: unpaidDeduction });

  // 5. Structural deductions (PF, SSF, CIT, other recurring).
  for (const line of input.lines.filter((l) => l.type === 'DEDUCTION')) {
    const amount =
      line.calculationType === 'FIXED' ? line.value : line.calculationType === 'PERCENT_OF_BASIC' ? (basic * line.value) / 100 : (gross * line.value) / 100;
    if (amount > 0) deductions.push({ ...line, amount: round2(amount) });
  }

  // 6. One-off deductions (loan instalment, advance recovery, fines).
  for (const adj of input.adjustments.filter((a) => a.type === 'DEDUCTION')) {
    if (adj.amount > 0) deductions.push({ ...adj, amount: round2(adj.amount) });
  }

  // 7. Tax on annualised taxable income, after the capped retirement contribution allowance.
  const retirementContribution = round2(
    deductions.filter((d) => d.reducesTaxableIncome || RETIREMENT.includes(d.category)).reduce((sum, d) => sum + d.amount, 0),
  );
  const annualGross = gross * 12;
  const annualRetirementCap = Math.min(s.retirementDeductionCap, (annualGross * s.retirementDeductionMaxPercent) / 100);
  const retirementDeductible = round2(Math.min(retirementContribution * 12, annualRetirementCap) / 12);
  const taxableIncome = round2(Math.max(0, taxableEarnings - unpaidDeduction - retirementDeductible));

  const tax = calculateAnnualTax(taxableIncome * 12, input.taxSlabs, { ssfContributor: input.ssfContributor });
  const taxAmount = round2(tax.annualTax / 12);
  if (taxAmount > 0) deductions.push({ ...TAX_META, amount: taxAmount });

  const totalDeductions = round2(deductions.reduce((sum, d) => sum + d.amount, 0));
  let net = round2(gross - totalDeductions);
  if (s.roundNetSalary) net = Math.round(net);

  const components = [...earnings, ...deductions].sort((a, b) =>
    a.type === b.type ? a.sortOrder - b.sortOrder : a.type === 'EARNING' ? -1 : 1,
  );

  return {
    components,
    basicSalary: basic,
    totalAllowances: round2(gross - basic),
    grossSalary: gross,
    unpaidDeduction,
    retirementContribution,
    retirementDeductible,
    taxableIncome,
    taxAmount,
    otherDeductions: round2(totalDeductions - taxAmount - retirementContribution),
    totalDeductions,
    netSalary: net,
    notes: {
      dailyRate: round2(dailyRate),
      overtimeHourlyRate: round2(overtimeHourlyRate),
      annualTaxableIncome: tax.annualTaxableIncome,
      annualTax: tax.annualTax,
      taxBreakdown: tax.breakdown,
      disclaimer: TAX_DISCLAIMER,
    },
  };
}
