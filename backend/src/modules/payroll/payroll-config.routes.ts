import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { body, params, query } from '../../middleware/validate';
import { audit, diff } from '../../services/audit.service';
import { calculateAnnualTax } from '../../services/engines/tax.engine';
import { TAX_DISCLAIMER } from '../../services/engines/payroll.engine';
import { parseDateOnly, todayIn } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { dec, toNumber } from '../../utils/money';
import { adjustmentSchema, componentSchema, structureSchema, taxPreviewSchema, taxRuleSchema } from './payroll.schemas';
import { loadTaxSlabs } from './payroll.service';

const idParam = z.object({ id: z.string().uuid() });
const D = (n: number) => new Prisma.Decimal(n);

// ── Salary components ────────────────────────────────────────

export const componentRoutes = Router();

const shapeComponent = <T extends { defaultValue: Prisma.Decimal; employerContribution: Prisma.Decimal }>(c: T) => ({
  ...c,
  defaultValue: toNumber(c.defaultValue),
  employerContribution: toNumber(c.employerContribution),
});

componentRoutes.get('/', requirePermission('salary.view', 'salary.manage', 'payroll.view'), async (req, res) => {
  const rows = await prisma.salaryComponent.findMany({ where: { organisationId: req.auth!.organisationId }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
  res.json({ success: true, data: rows.map(shapeComponent) });
});

componentRoutes.post('/', requirePermission('salary.manage'), async (req, res) => {
  const input = body(req, componentSchema);
  const row = await prisma.salaryComponent.create({
    data: { ...input, defaultValue: D(input.defaultValue), employerContribution: D(input.employerContribution), organisationId: req.auth!.organisationId },
  });
  await audit(req, { action: 'SALARY_COMPONENT_CREATED', module: 'payroll', recordId: row.id, newValue: input });
  res.status(201).json({ success: true, data: shapeComponent(row) });
});

componentRoutes.put('/:id', requirePermission('salary.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, componentSchema.innerType().partial());
  const before = await prisma.salaryComponent.findFirst({ where: { id, organisationId: req.auth!.organisationId } });
  if (!before) throw notFound('Salary component');
  const data = {
    ...input,
    ...(input.defaultValue !== undefined ? { defaultValue: D(input.defaultValue) } : {}),
    ...(input.employerContribution !== undefined ? { employerContribution: D(input.employerContribution) } : {}),
  };
  const row = await prisma.salaryComponent.update({ where: { id }, data });
  const d = diff(shapeComponent(before) as unknown as Record<string, unknown>, input);
  if (d.changed) await audit(req, { action: 'SALARY_COMPONENT_UPDATED', module: 'payroll', recordId: id, oldValue: d.oldValue, newValue: d.newValue });
  res.json({ success: true, data: shapeComponent(row) });
});

componentRoutes.delete('/:id', requirePermission('salary.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const c = await prisma.salaryComponent.findFirst({
    where: { id, organisationId: req.auth!.organisationId },
    include: { _count: { select: { employeeLines: true, structureLines: true, adjustments: true } } },
  });
  if (!c) throw notFound('Salary component');
  if (c._count.employeeLines || c._count.structureLines || c._count.adjustments) throw conflict('This component is in use. Mark it inactive instead.', 'COMPONENT_IN_USE');
  await prisma.salaryComponent.delete({ where: { id } });
  await audit(req, { action: 'SALARY_COMPONENT_DELETED', module: 'payroll', recordId: id, oldValue: { code: c.code } });
  res.json({ success: true, message: 'Component deleted' });
});

// ── Salary structures (templates) ────────────────────────────

export const structureRoutes = Router();

const structureInclude = { lines: { include: { component: true }, orderBy: { component: { sortOrder: 'asc' } } }, _count: { select: { employeeSalaries: { where: { effectiveTo: null } } } } } satisfies Prisma.SalaryStructureInclude;
const shapeStructure = (s: Prisma.SalaryStructureGetPayload<{ include: typeof structureInclude }>) => ({
  ...s,
  employeeCount: s._count.employeeSalaries,
  lines: s.lines.map((l) => ({ ...l, value: toNumber(l.value), component: shapeComponent(l.component) })),
});

async function assertComponents(orgId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw badRequest('Each component can appear only once', 'DUPLICATE_COMPONENT');
  const count = await prisma.salaryComponent.count({ where: { organisationId: orgId, id: { in: unique } } });
  if (count !== unique.length) throw notFound('Salary component');
}

structureRoutes.get('/', requirePermission('salary.view', 'salary.manage'), async (req, res) => {
  const rows = await prisma.salaryStructure.findMany({ where: { organisationId: req.auth!.organisationId }, include: structureInclude, orderBy: { name: 'asc' } });
  res.json({ success: true, data: rows.map(shapeStructure) });
});

structureRoutes.post('/', requirePermission('salary.manage'), async (req, res) => {
  const input = body(req, structureSchema);
  await assertComponents(req.auth!.organisationId, input.lines.map((l) => l.componentId));
  const row = await prisma.salaryStructure.create({
    data: {
      organisationId: req.auth!.organisationId,
      name: input.name,
      description: input.description ?? null,
      status: input.status,
      lines: { create: input.lines.map((l) => ({ componentId: l.componentId, calculationType: l.calculationType, value: dec(l.value) })) },
    },
    include: structureInclude,
  });
  await audit(req, { action: 'SALARY_STRUCTURE_CREATED', module: 'payroll', recordId: row.id, newValue: input });
  res.status(201).json({ success: true, data: shapeStructure(row) });
});

/** Editing a template does not change employees' existing salary records. */
structureRoutes.put('/:id', requirePermission('salary.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, structureSchema);
  const before = await prisma.salaryStructure.findFirst({ where: { id, organisationId: req.auth!.organisationId }, include: structureInclude });
  if (!before) throw notFound('Salary structure');
  await assertComponents(req.auth!.organisationId, input.lines.map((l) => l.componentId));
  const row = await prisma.$transaction(async (tx) => {
    await tx.salaryStructureLine.deleteMany({ where: { structureId: id } });
    return tx.salaryStructure.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        lines: { create: input.lines.map((l) => ({ componentId: l.componentId, calculationType: l.calculationType, value: dec(l.value) })) },
      },
      include: structureInclude,
    });
  });
  await audit(req, { action: 'SALARY_STRUCTURE_UPDATED', module: 'payroll', recordId: id, oldValue: shapeStructure(before), newValue: input });
  res.json({ success: true, data: shapeStructure(row) });
});

structureRoutes.delete('/:id', requirePermission('salary.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const s = await prisma.salaryStructure.findFirst({ where: { id, organisationId: req.auth!.organisationId }, include: { _count: { select: { employeeSalaries: true } } } });
  if (!s) throw notFound('Salary structure');
  if (s._count.employeeSalaries) throw conflict('Employees have salaries based on this structure. Mark it inactive instead.', 'STRUCTURE_IN_USE');
  await prisma.salaryStructure.delete({ where: { id } });
  await audit(req, { action: 'SALARY_STRUCTURE_DELETED', module: 'payroll', recordId: id, oldValue: { name: s.name } });
  res.json({ success: true, message: 'Structure deleted' });
});

// ── Monthly adjustments (bonus, commission, loan, advance…) ──

export const adjustmentRoutes = Router();

async function assertPeriodOpen(orgId: string, year: number, month: number) {
  const locked = await prisma.payroll.findFirst({ where: { organisationId: orgId, year, month, status: { in: ['APPROVED', 'PAID'] } } });
  if (locked) throw conflict(`Payroll for ${year}-${String(month).padStart(2, '0')} is ${locked.status.toLowerCase()} and locked`, 'PAYROLL_LOCKED');
}

adjustmentRoutes.get('/', requirePermission('payroll.view', 'payroll.process'), async (req, res) => {
  const q = query(req, z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12), employeeId: z.string().uuid().optional() }));
  const rows = await prisma.payrollAdjustment.findMany({
    where: { organisationId: req.auth!.organisationId, year: q.year, month: q.month, ...(q.employeeId ? { employeeId: q.employeeId } : {}) },
    include: { component: { select: { id: true, name: true, code: true, type: true, category: true } }, employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: rows.map((r) => ({ ...r, amount: toNumber(r.amount) })) });
});

adjustmentRoutes.post('/', requirePermission('payroll.process'), async (req, res) => {
  const input = body(req, adjustmentSchema);
  const orgId = req.auth!.organisationId;
  await assertPeriodOpen(orgId, input.year, input.month);
  const [emp, comp] = await Promise.all([
    prisma.employee.findFirst({ where: { id: input.employeeId, organisationId: orgId, deletedAt: null } }),
    prisma.salaryComponent.findFirst({ where: { id: input.componentId, organisationId: orgId } }),
  ]);
  if (!emp) throw notFound('Employee');
  if (!comp) throw notFound('Salary component');
  if (comp.category === 'TAX' || comp.category === 'UNPAID_LEAVE') throw badRequest('Tax and unpaid leave are calculated automatically', 'COMPONENT_NOT_ADJUSTABLE');
  const row = await prisma.payrollAdjustment.create({ data: { ...input, amount: dec(input.amount), note: input.note ?? null, organisationId: orgId, createdById: req.auth!.userId } });
  await audit(req, { action: 'PAYROLL_ADJUSTMENT_ADDED', module: 'payroll', recordId: input.employeeId, newValue: { ...input, component: comp.code } });
  res.status(201).json({ success: true, data: { ...row, amount: toNumber(row.amount) } });
});

adjustmentRoutes.delete('/:id', requirePermission('payroll.process'), async (req, res) => {
  const { id } = params(req, idParam);
  const row = await prisma.payrollAdjustment.findFirst({ where: { id, organisationId: req.auth!.organisationId } });
  if (!row) throw notFound('Adjustment');
  await assertPeriodOpen(row.organisationId, row.year, row.month);
  await prisma.payrollAdjustment.delete({ where: { id } });
  await audit(req, { action: 'PAYROLL_ADJUSTMENT_REMOVED', module: 'payroll', recordId: row.employeeId, oldValue: { amount: toNumber(row.amount), year: row.year, month: row.month } });
  res.json({ success: true, message: 'Adjustment removed' });
});

// ── Tax rules ────────────────────────────────────────────────

export const taxRoutes = Router();

const shapeRule = <T extends { threshold: Prisma.Decimal; rate: Prisma.Decimal; deduction: Prisma.Decimal }>(r: T) => ({
  ...r,
  threshold: toNumber(r.threshold),
  rate: toNumber(r.rate),
  deduction: toNumber(r.deduction),
});

taxRoutes.get('/', requirePermission('tax.manage', 'payroll.view'), async (req, res) => {
  const q = query(req, z.object({ fiscalYear: z.string().optional() }));
  const rows = await prisma.taxRule.findMany({
    where: { organisationId: req.auth!.organisationId, ...(q.fiscalYear ? { fiscalYear: q.fiscalYear } : {}) },
    orderBy: [{ fiscalYear: 'desc' }, { category: 'asc' }, { threshold: 'asc' }],
  });
  res.json({ success: true, data: rows.map(shapeRule), meta: { disclaimer: TAX_DISCLAIMER } });
});

const toRuleData = (input: Partial<z.infer<typeof taxRuleSchema>>) => ({
  ...input,
  ...(input.threshold !== undefined ? { threshold: D(input.threshold) } : {}),
  ...(input.rate !== undefined ? { rate: D(input.rate) } : {}),
  ...(input.deduction !== undefined ? { deduction: D(input.deduction) } : {}),
  ...(input.effectiveFrom !== undefined ? { effectiveFrom: parseDateOnly(input.effectiveFrom) } : {}),
  ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo ? parseDateOnly(input.effectiveTo) : null } : {}),
});

taxRoutes.post('/', requirePermission('tax.manage'), async (req, res) => {
  const input = body(req, taxRuleSchema);
  const row = await prisma.taxRule.create({
    data: { ...toRuleData(input), fiscalYear: input.fiscalYear, ruleName: input.ruleName, threshold: D(input.threshold), rate: D(input.rate), effectiveFrom: parseDateOnly(input.effectiveFrom), organisationId: req.auth!.organisationId },
  });
  await audit(req, { action: 'TAX_RULE_CREATED', module: 'payroll', recordId: row.id, newValue: input });
  res.status(201).json({ success: true, data: shapeRule(row) });
});

taxRoutes.put('/:id', requirePermission('tax.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, taxRuleSchema.partial());
  const before = await prisma.taxRule.findFirst({ where: { id, organisationId: req.auth!.organisationId } });
  if (!before) throw notFound('Tax rule');
  const row = await prisma.taxRule.update({ where: { id }, data: toRuleData(input) });
  await audit(req, { action: 'TAX_RULE_UPDATED', module: 'payroll', recordId: id, oldValue: shapeRule(before), newValue: input });
  res.json({ success: true, data: shapeRule(row) });
});

taxRoutes.delete('/:id', requirePermission('tax.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const rule = await prisma.taxRule.findFirst({ where: { id, organisationId: req.auth!.organisationId } });
  if (!rule) throw notFound('Tax rule');
  await prisma.taxRule.delete({ where: { id } });
  await audit(req, { action: 'TAX_RULE_DELETED', module: 'payroll', recordId: id, oldValue: shapeRule(rule) });
  res.json({ success: true, message: 'Tax rule deleted' });
});

/** Try the configured slabs on an annual income without running payroll. */
taxRoutes.post('/preview', requirePermission('tax.manage', 'payroll.view'), async (req, res) => {
  const input = body(req, taxPreviewSchema);
  const date = input.date ? parseDateOnly(input.date) : todayIn();
  const slabs = await loadTaxSlabs(req.auth!.organisationId, input.category, date);
  const result = calculateAnnualTax(input.annualIncome, slabs, { ssfContributor: input.ssfContributor });
  res.json({ success: true, data: { ...result, monthlyTax: Math.round((result.annualTax / 12) * 100) / 100, slabsUsed: slabs.length, disclaimer: TAX_DISCLAIMER } });
});
