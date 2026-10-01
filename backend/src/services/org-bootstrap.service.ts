import { Prisma } from '@prisma/client';
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS } from '../config/permissions';
import type { Db } from '../lib/prisma';
import { parseDateOnly } from '../utils/dates';

/** Make sure every permission in the catalogue exists. Safe to run repeatedly. */
export async function syncPermissions(db: Db) {
  for (const key of ALL_PERMISSIONS) {
    const def = PERMISSIONS[key];
    await db.permission.upsert({
      where: { key },
      update: { module: def.module, description: def.description },
      create: { key, module: def.module, description: def.description },
    });
  }
}

export async function createDefaultRoles(db: Db, organisationId: string) {
  const perms = await db.permission.findMany();
  const idByKey = new Map(perms.map((p) => [p.key, p.id]));
  const roles: Record<string, string> = {};
  for (const def of DEFAULT_ROLES) {
    const role = await db.role.upsert({
      where: { organisationId_key: { organisationId, key: def.key } },
      update: {},
      create: {
        organisationId,
        key: def.key,
        name: def.name,
        description: def.description,
        dataScope: def.dataScope,
        isSystem: true,
        permissions: { create: def.permissions.map((k) => ({ permissionId: idByKey.get(k)! })) },
      },
    });
    roles[def.key] = role.id;
  }
  return roles;
}

/**
 * Starter configuration for a new organisation. Everything here is editable in the app;
 * payroll components and tax slabs are examples that must be reviewed before official use.
 */
export async function bootstrapOrganisation(db: Db, organisationId: string) {
  await syncPermissions(db);
  const roles = await createDefaultRoles(db, organisationId);

  const shift = await db.shift.create({
    data: { organisationId, name: 'General Shift', startTime: '09:00', endTime: '17:00', gracePeriod: 15, breakDuration: 60, workingHours: new Prisma.Decimal(7) },
  });
  await db.organisation.update({ where: { id: organisationId }, data: { defaultShiftId: shift.id } });

  await db.leaveType.createMany({
    data: [
      { organisationId, name: 'Annual Leave', code: 'AL', annualDays: 18, carryForward: true, maxCarryForward: 45, requiresHrApproval: true },
      { organisationId, name: 'Sick Leave', code: 'SL', annualDays: 12, carryForward: true, maxCarryForward: 45 },
      { organisationId, name: 'Casual Leave', code: 'CL', annualDays: 6 },
      { organisationId, name: 'Maternity Leave', code: 'ML', annualDays: 98, requiresDocument: true, requiresHrApproval: true, allowHalfDay: false },
      { organisationId, name: 'Paternity Leave', code: 'PL', annualDays: 15, requiresHrApproval: true, allowHalfDay: false },
      { organisationId, name: 'Unpaid Leave', code: 'UL', annualDays: 0, paid: false, limitToBalance: false, requiresHrApproval: true },
      { organisationId, name: 'Other Leave', code: 'OL', annualDays: 0, limitToBalance: false, requiresHrApproval: true },
    ].map((l) => ({ ...l, annualDays: new Prisma.Decimal(l.annualDays), maxCarryForward: new Prisma.Decimal(l.maxCarryForward ?? 0) })),
  });

  const components: Prisma.SalaryComponentCreateManyInput[] = [
    { organisationId, code: 'HOUSING', name: 'Housing Allowance', type: 'EARNING', category: 'ALLOWANCE', sortOrder: 10 },
    { organisationId, code: 'TRANSPORT', name: 'Transport Allowance', type: 'EARNING', category: 'ALLOWANCE', sortOrder: 11 },
    { organisationId, code: 'FOOD', name: 'Food Allowance', type: 'EARNING', category: 'ALLOWANCE', sortOrder: 12 },
    { organisationId, code: 'OTHER_ALW', name: 'Other Allowance', type: 'EARNING', category: 'ALLOWANCE', sortOrder: 13 },
    { organisationId, code: 'OT', name: 'Overtime', type: 'EARNING', category: 'OVERTIME', isRecurring: false, sortOrder: 50, description: 'Calculated from approved overtime minutes' },
    { organisationId, code: 'BONUS', name: 'Bonus', type: 'EARNING', category: 'BONUS', isRecurring: false, sortOrder: 60 },
    { organisationId, code: 'COMMISSION', name: 'Commission', type: 'EARNING', category: 'COMMISSION', isRecurring: false, sortOrder: 61 },
    {
      organisationId,
      code: 'PF',
      name: 'Provident Fund (employee)',
      type: 'DEDUCTION',
      category: 'PROVIDENT_FUND',
      calculationType: 'PERCENT_OF_BASIC',
      defaultValue: new Prisma.Decimal(10),
      employerContribution: new Prisma.Decimal(10),
      taxable: false,
      reducesTaxableIncome: true,
      sortOrder: 20,
      description: 'Example rate. Confirm the rate that applies to your organisation.',
    },
    {
      organisationId,
      code: 'SSF',
      name: 'Social Security Fund (employee)',
      type: 'DEDUCTION',
      category: 'SOCIAL_SECURITY',
      calculationType: 'PERCENT_OF_BASIC',
      defaultValue: new Prisma.Decimal(11),
      employerContribution: new Prisma.Decimal(20),
      taxable: false,
      reducesTaxableIncome: true,
      sortOrder: 21,
      description: 'Example rate. Confirm current SSF contribution rules before use.',
    },
    { organisationId, code: 'CIT', name: 'Citizen Investment Trust', type: 'DEDUCTION', category: 'PROVIDENT_FUND', taxable: false, reducesTaxableIncome: true, sortOrder: 22 },
    { organisationId, code: 'LOAN', name: 'Loan Repayment', type: 'DEDUCTION', category: 'LOAN', taxable: false, isRecurring: false, sortOrder: 30 },
    { organisationId, code: 'ADVANCE', name: 'Salary Advance Recovery', type: 'DEDUCTION', category: 'ADVANCE', taxable: false, isRecurring: false, sortOrder: 31 },
    { organisationId, code: 'OTHER_DED', name: 'Other Deduction', type: 'DEDUCTION', category: 'OTHER', taxable: false, isRecurring: false, sortOrder: 40 },
  ];
  await db.salaryComponent.createMany({ data: components });

  await createSampleTaxRules(db, organisationId, '2082/83', '2025-07-17', '2026-07-16');
  await createSampleTaxRules(db, organisationId, '2083/84', '2026-07-17', null);
  return { roles, shiftId: shift.id };
}

/**
 * Sample slabs based on recently published Nepal individual/couple rates.
 * They are a starting point only: the UI labels them as needing verification, and the
 * organisation must confirm them for each fiscal year before running official payroll.
 */
export async function createSampleTaxRules(db: Db, organisationId: string, fiscalYear: string, from: string, to: string | null) {
  const effectiveFrom = parseDateOnly(from);
  const effectiveTo = to ? parseDateOnly(to) : null;
  const slabs = {
    INDIVIDUAL: [0, 500000, 700000, 1000000, 2000000, 5000000],
    COUPLE: [0, 600000, 800000, 1100000, 2000000, 5000000],
  } as const;
  const rates = [1, 10, 20, 30, 36, 39];
  const data: Prisma.TaxRuleCreateManyInput[] = [];
  for (const [category, thresholds] of Object.entries(slabs) as ['INDIVIDUAL' | 'COUPLE', readonly number[]][]) {
    thresholds.forEach((threshold, i) => {
      data.push({
        organisationId,
        fiscalYear,
        category,
        ruleName: `${category === 'INDIVIDUAL' ? 'Individual' : 'Couple'} slab ${i + 1} (${rates[i]}%)`,
        threshold: new Prisma.Decimal(threshold),
        rate: new Prisma.Decimal(rates[i]),
        waivedForSsf: i === 0,
        effectiveFrom,
        effectiveTo,
      });
    });
  }
  await db.taxRule.createMany({ data });
}
