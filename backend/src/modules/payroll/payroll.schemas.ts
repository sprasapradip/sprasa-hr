import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination';
import { nullable, optional, zDate } from '../../utils/validation';

export const COMPONENT_CATEGORIES = ['ALLOWANCE', 'OVERTIME', 'BONUS', 'COMMISSION', 'TAX', 'PROVIDENT_FUND', 'SOCIAL_SECURITY', 'LOAN', 'ADVANCE', 'UNPAID_LEAVE', 'OTHER'] as const;
export const CALCULATION_TYPES = ['FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS'] as const;

export const componentSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/, '2–20 letters, numbers or underscores'),
    type: z.enum(['EARNING', 'DEDUCTION']),
    category: z.enum(COMPONENT_CATEGORIES),
    calculationType: z.enum(CALCULATION_TYPES).default('FIXED'),
    defaultValue: z.coerce.number().min(0).max(1_000_000_000).default(0),
    taxable: z.boolean().default(true),
    reducesTaxableIncome: z.boolean().default(false),
    employerContribution: z.coerce.number().min(0).max(100).default(0),
    isRecurring: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    description: nullable(z.string().trim().max(300)),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  .refine((c) => !(c.type === 'EARNING' && c.calculationType === 'PERCENT_OF_GROSS'), {
    path: ['calculationType'],
    message: 'Earnings cannot be a percentage of gross',
  });

export const structureSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: nullable(z.string().trim().max(300)),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  lines: z
    .array(
      z.object({
        componentId: z.string().uuid(),
        calculationType: z.enum(CALCULATION_TYPES),
        value: z.coerce.number().min(0).max(1_000_000_000),
      }),
    )
    .max(50),
});

export const adjustmentSchema = z.object({
  employeeId: z.string().uuid(),
  componentId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  amount: z.coerce.number().positive().max(1_000_000_000),
  note: nullable(z.string().trim().max(300)),
});

export const taxRuleSchema = z.object({
  fiscalYear: z.string().regex(/^\d{4}\/\d{2}$/, 'Use a format like 2083/84'),
  ruleName: z.string().trim().min(2).max(100),
  category: z.enum(['ALL', 'INDIVIDUAL', 'COUPLE']).default('INDIVIDUAL'),
  threshold: z.coerce.number().min(0).max(1_000_000_000),
  rate: z.coerce.number().min(0).max(100),
  deduction: z.coerce.number().min(0).max(1_000_000_000).default(0),
  waivedForSsf: z.boolean().default(false),
  effectiveFrom: zDate,
  effectiveTo: nullable(zDate),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const taxPreviewSchema = z.object({
  annualIncome: z.coerce.number().min(0).max(10_000_000_000),
  category: z.enum(['INDIVIDUAL', 'COUPLE']).default('INDIVIDUAL'),
  date: optional(zDate),
  ssfContributor: z.boolean().default(false),
});

export const generatePayrollSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  notes: optional(z.string().trim().max(500)),
});

export const payrollListQuery = paginationQuery.extend({
  year: z.coerce.number().int().optional(),
  status: z.enum(['DRAFT', 'PROCESSING', 'REVIEWED', 'APPROVED', 'PAID', 'CANCELLED']).optional(),
});

export const registerQuery = paginationQuery.extend({
  departmentId: z.string().uuid().optional(),
  format: z.enum(['csv', 'xlsx', 'pdf']).optional(),
});

export const payslipListQuery = paginationQuery.extend({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
