import { round2 } from '../../utils/money';

/**
 * Configurable progressive tax engine.
 *
 * IMPORTANT: this engine only applies the slabs it is given. It does not know Nepal tax law.
 * Slabs, rates and waivers are configuration and must be verified by the organisation's
 * accountant or tax professional for the current fiscal year before running official payroll.
 */

export interface TaxSlab {
  ruleName: string;
  /** Annual income where this slab begins. */
  threshold: number;
  /** Percentage rate for income inside this slab. */
  rate: number;
  /** Fixed rebate subtracted from this slab's tax (never below zero). */
  deduction: number;
  /** Slab is not charged when the employee contributes to SSF. */
  waivedForSsf: boolean;
}

export interface TaxBreakdownLine {
  ruleName: string;
  from: number;
  to: number | null;
  taxableAmount: number;
  rate: number;
  tax: number;
  waived: boolean;
}

export interface TaxResult {
  annualTaxableIncome: number;
  annualTax: number;
  breakdown: TaxBreakdownLine[];
}

export function calculateAnnualTax(annualIncome: number, slabs: TaxSlab[], opts: { ssfContributor: boolean }): TaxResult {
  const income = Math.max(0, annualIncome);
  const sorted = [...slabs].sort((a, b) => a.threshold - b.threshold);
  const breakdown: TaxBreakdownLine[] = [];
  let total = 0;

  sorted.forEach((slab, i) => {
    const upper = i + 1 < sorted.length ? sorted[i + 1].threshold : null;
    const portion = Math.max(0, (upper === null ? income : Math.min(income, upper)) - slab.threshold);
    if (portion <= 0) return;
    const waived = slab.waivedForSsf && opts.ssfContributor;
    const tax = waived ? 0 : Math.max(0, (portion * slab.rate) / 100 - slab.deduction);
    total += tax;
    breakdown.push({ ruleName: slab.ruleName, from: slab.threshold, to: upper, taxableAmount: round2(portion), rate: slab.rate, tax: round2(tax), waived });
  });

  return { annualTaxableIncome: round2(income), annualTax: round2(total), breakdown };
}
