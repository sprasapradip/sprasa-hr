import type { PayrollStatus, Prisma, TaxCategory } from '@prisma/client';
import type { z } from 'zod';
import { env } from '../../config/env';
import { templates } from '../../emails/templates';
import { prisma, type Tx } from '../../lib/prisma';
import { writeAudit, type AuditActor } from '../../services/audit.service';
import { loadWorkCalendar } from '../../services/calendar.service';
import { dayKind, workingDaysInRange, type WorkCalendar } from '../../services/engines/calendar.engine';
import { countLeaveDays } from '../../services/engines/leave.engine';
import { calculatePayroll, TAX_DISCLAIMER, type AdjustmentInput, type ComponentMeta, type SalaryLineInput } from '../../services/engines/payroll.engine';
import type { TaxSlab } from '../../services/engines/tax.engine';
import { notify, usersWithPermission } from '../../services/notification.service';
import { getLeaveSettings, getPayrollSettings } from '../../services/settings.service';
import { resolveShifts } from '../../services/shift-resolver.service';
import type { AuthContext } from '../../types/express';
import { daysBetweenInclusive, eachDay, formatDateOnly, monthRange } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { dec, round2, toNumber } from '../../utils/money';
import { paginated, paging } from '../../utils/pagination';
import { fullName } from '../employees/employees.service';
import type { generatePayrollSchema, payrollListQuery, registerQuery } from './payroll.schemas';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const periodLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;
const periodKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const LOCKED: PayrollStatus[] = ['APPROVED', 'PAID'];

/** Tax slabs effective on a date for a category, falling back to rules marked ALL. */
export async function loadTaxSlabs(organisationId: string, category: TaxCategory, date: Date, db: Tx | typeof prisma = prisma): Promise<TaxSlab[]> {
  const rules = await db.taxRule.findMany({
    where: { organisationId, status: 'ACTIVE', effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }], category: { in: [category, 'ALL'] } },
    orderBy: { threshold: 'asc' },
  });
  const specific = rules.filter((r) => r.category === category);
  return (specific.length ? specific : rules.filter((r) => r.category === 'ALL')).map((r) => ({
    ruleName: r.ruleName,
    threshold: toNumber(r.threshold),
    rate: toNumber(r.rate),
    deduction: toNumber(r.deduction),
    waivedForSsf: r.waivedForSsf,
  }));
}

const meta = (c: { id: string; code: string; name: string; type: ComponentMeta['type']; category: ComponentMeta['category']; taxable: boolean; reducesTaxableIncome: boolean; sortOrder: number }): ComponentMeta => ({
  componentId: c.id,
  code: c.code,
  name: c.name,
  type: c.type,
  category: c.category,
  taxable: c.taxable,
  reducesTaxableIncome: c.reducesTaxableIncome,
  sortOrder: c.sortOrder,
});

const maxDate = (a: Date, b: Date) => (a > b ? a : b);
const minDate = (a: Date, b: Date) => (a < b ? a : b);

/** Leave days of a request that fall inside [from, to]. */
function leaveDaysWithin(r: { startDate: Date; endDate: Date; halfDay: boolean }, from: Date, to: Date, cal: WorkCalendar, opts: { countWeekends: boolean; countHolidays: boolean }) {
  const s = maxDate(r.startDate, from);
  const e = minDate(r.endDate, to);
  if (e < s) return 0;
  return countLeaveDays(s, e, cal, { halfDay: r.halfDay && s.getTime() === e.getTime(), ...opts });
}

/**
 * Calculate every eligible employee for the period and write the payroll items.
 * Runs inside the caller's transaction.
 */
async function calculateItems(tx: Tx, payrollId: string, orgId: string, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  const [settings, leaveSettings, cal, components] = await Promise.all([
    getPayrollSettings(orgId, tx),
    getLeaveSettings(orgId, tx),
    loadWorkCalendar(orgId, start, end, tx),
    tx.salaryComponent.findMany({ where: { organisationId: orgId } }),
  ]);
  const workingDays = workingDaysInRange(start, end, cal);
  const calendarDays = daysBetweenInclusive(start, end);
  const overtimeComponent = components.find((c) => c.category === 'OVERTIME' && c.status === 'ACTIVE');

  // Everyone employed during the period with a salary effective in it.
  const employees = await tx.employee.findMany({
    where: {
      organisationId: orgId,
      deletedAt: null,
      joinDate: { lte: end },
      OR: [{ exitDate: null }, { exitDate: { gte: start } }],
      salaries: { some: { effectiveFrom: { lte: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] } },
    },
    include: {
      department: { select: { name: true } },
      designation: { select: { name: true } },
      salaries: {
        where: { effectiveFrom: { lte: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] },
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
        include: { lines: { include: { component: true } } },
      },
    },
    orderBy: { employeeCode: 'asc' },
  });
  if (!employees.length) throw badRequest('No employees with a salary for this period. Add salaries first.', 'NO_ELIGIBLE_EMPLOYEES');

  const ids = employees.map((e) => e.id);
  const [attendance, leaves, adjustments, shifts] = await Promise.all([
    tx.attendance.findMany({ where: { employeeId: { in: ids }, date: { gte: start, lte: end } } }),
    tx.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: 'APPROVED', startDate: { lte: end }, endDate: { gte: start } }, include: { leaveType: { select: { paid: true } } } }),
    tx.payrollAdjustment.findMany({ where: { organisationId: orgId, year, month, employeeId: { in: ids } }, include: { component: true } }),
    resolveShifts(ids, orgId, end, tx),
  ]);
  const taxSlabCache = new Map<TaxCategory, TaxSlab[]>();

  let totals = { gross: 0, deductions: 0, tax: 0, net: 0 };
  for (const emp of employees) {
    const salary = emp.salaries[0];
    const windowStart = maxDate(start, emp.joinDate);
    const windowEnd = emp.exitDate ? minDate(end, emp.exitDate) : end;

    // Days outside employment are unpaid.
    const outsideDays =
      settingsBasis(settings.unpaidDayBasis, start, end, cal) - settingsBasis(settings.unpaidDayBasis, windowStart, windowEnd, cal);

    const att = attendance.filter((a) => a.employeeId === emp.id && a.date >= windowStart && a.date <= windowEnd);
    const empLeaves = leaves.filter((l) => l.employeeId === emp.id);
    const leaveOpts = { countWeekends: leaveSettings.countWeekends, countHolidays: leaveSettings.countHolidays };
    const unpaidLeaveDays = empLeaves.filter((l) => !l.leaveType.paid).reduce((s, l) => s + leaveDaysWithin(l, windowStart, windowEnd, cal, leaveOpts), 0);
    const paidLeaveDays = empLeaves.filter((l) => l.leaveType.paid).reduce((s, l) => s + leaveDaysWithin(l, windowStart, windowEnd, cal, leaveOpts), 0);

    const presentDays = att.filter((a) => ['PRESENT', 'LATE', 'WORK_FROM_HOME'].includes(a.status)).length;
    const halfDays = att.filter((a) => a.status === 'HALF_DAY').length;
    let absentDays = 0;
    if (settings.deductAbsentDays) {
      absentDays = att.filter((a) => a.status === 'ABSENT' && dayKind(a.date, cal) === 'WORKING').length + halfDays * 0.5;
      if (settings.treatMissingAttendanceAsAbsent) {
        const recorded = new Set(att.map((a) => formatDateOnly(a.date)));
        const onLeave = new Set(empLeaves.flatMap((l) => [...eachDay(maxDate(l.startDate, windowStart), minDate(l.endDate, windowEnd))].map(formatDateOnly)));
        for (const d of eachDay(windowStart, windowEnd)) {
          const key = formatDateOnly(d);
          if (dayKind(d, cal) === 'WORKING' && !recorded.has(key) && !onLeave.has(key)) absentDays++;
        }
      }
    }
    // Overtime on self check-ins counts only once HR has approved them.
    const overtimeMinutes = att.filter((a) => a.approvalStatus !== 'PENDING').reduce((s, a) => s + a.overtimeMinutes, 0);
    const unpaidDays = round2(outsideDays + unpaidLeaveDays + absentDays);

    const lines: SalaryLineInput[] = salary.lines
      .filter((l) => l.component.status === 'ACTIVE' && l.component.category !== 'TAX')
      .map((l) => ({ ...meta(l.component), calculationType: l.calculationType, value: toNumber(l.value) }));
    const adj: AdjustmentInput[] = adjustments.filter((a) => a.employeeId === emp.id).map((a) => ({ ...meta(a.component), amount: toNumber(a.amount) }));
    const ssfContributor = lines.some((l) => l.category === 'SOCIAL_SECURITY' && l.value > 0);

    if (!taxSlabCache.has(emp.taxCategory)) taxSlabCache.set(emp.taxCategory, await loadTaxSlabs(orgId, emp.taxCategory, end, tx));
    const shift = shifts.get(emp.id);

    const result = calculatePayroll({
      basicSalary: toNumber(salary.basicSalary),
      lines,
      adjustments: adj,
      workingDays,
      calendarDays,
      unpaidDays,
      overtimeMinutes,
      hoursPerDay: shift ? toNumber(shift.workingHours) : 8,
      settings,
      taxSlabs: taxSlabCache.get(emp.taxCategory)!,
      ssfContributor,
      overtimeComponent: overtimeComponent ? meta(overtimeComponent) : undefined,
    });

    await tx.payrollItem.create({
      data: {
        payrollId,
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: fullName(emp),
        departmentName: emp.department?.name ?? null,
        designationName: emp.designation?.name ?? null,
        bankName: emp.bankName,
        bankAccountNumber: emp.bankAccountNumber,
        basicSalary: dec(result.basicSalary),
        totalAllowances: dec(result.totalAllowances),
        grossSalary: dec(result.grossSalary),
        taxableIncome: dec(result.taxableIncome),
        taxAmount: dec(result.taxAmount),
        retirementContribution: dec(result.retirementContribution),
        otherDeductions: dec(result.otherDeductions),
        totalDeductions: dec(result.totalDeductions),
        netSalary: dec(result.netSalary),
        workingDays,
        payableDays: dec(Math.max(0, (settings.unpaidDayBasis === 'CALENDAR_DAYS' ? calendarDays : workingDays) - unpaidDays)),
        presentDays,
        paidLeaveDays: dec(paidLeaveDays),
        unpaidDays: dec(unpaidDays),
        overtimeMinutes,
        calculationNotes: { ...result.notes, ssfContributor, taxCategory: emp.taxCategory, salaryId: salary.id } as unknown as Prisma.InputJsonValue,
        components: {
          create: result.components.map((c) => ({ componentId: c.componentId, code: c.code, name: c.name, type: c.type, category: c.category, amount: dec(c.amount), sortOrder: c.sortOrder })),
        },
      },
    });
    totals = { gross: totals.gross + result.grossSalary, deductions: totals.deductions + result.totalDeductions, tax: totals.tax + result.taxAmount, net: totals.net + result.netSalary };
  }

  await tx.payroll.update({
    where: { id: payrollId },
    data: {
      status: 'DRAFT',
      workingDays,
      employeeCount: employees.length,
      totalGross: dec(totals.gross),
      totalDeductions: dec(totals.deductions),
      totalTax: dec(totals.tax),
      totalNet: dec(totals.net),
    },
  });
  return { employeeCount: employees.length, ...totals };
}

function settingsBasis(basis: 'WORKING_DAYS' | 'CALENDAR_DAYS', from: Date, to: Date, cal: WorkCalendar) {
  if (to < from) return 0;
  return basis === 'CALENDAR_DAYS' ? daysBetweenInclusive(from, to) : workingDaysInRange(from, to, cal);
}

// ── Payroll runs ─────────────────────────────────────────────

const shapeRun = <T extends { totalGross: Prisma.Decimal; totalDeductions: Prisma.Decimal; totalTax: Prisma.Decimal; totalNet: Prisma.Decimal; year: number; month: number }>(p: T) => ({
  ...p,
  period: periodLabel(p.year, p.month),
  totalGross: toNumber(p.totalGross),
  totalDeductions: toNumber(p.totalDeductions),
  totalTax: toNumber(p.totalTax),
  totalNet: toNumber(p.totalNet),
});

export async function list(orgId: string, q: z.infer<typeof payrollListQuery>) {
  const where: Prisma.PayrollWhereInput = { organisationId: orgId, ...(q.year ? { year: q.year } : {}), ...(q.status ? { status: q.status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.payroll.findMany({ where, orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }], ...paging(q) }),
    prisma.payroll.count({ where }),
  ]);
  return paginated(rows.map(shapeRun), total, q);
}

async function findRun(orgId: string, id: string) {
  const p = await prisma.payroll.findFirst({ where: { id, organisationId: orgId } });
  if (!p) throw notFound('Payroll');
  return p;
}

export async function get(orgId: string, id: string) {
  const p = await findRun(orgId, id);
  const [byDept, users] = await Promise.all([
    prisma.payrollItem.groupBy({ by: ['departmentName'], where: { payrollId: id }, _sum: { grossSalary: true, netSalary: true, taxAmount: true }, _count: true }),
    prisma.user.findMany({ where: { id: { in: [p.generatedById, p.reviewedById, p.approvedById, p.cancelledById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
  ]);
  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  return {
    ...shapeRun(p),
    generatedBy: name(p.generatedById),
    reviewedBy: name(p.reviewedById),
    approvedBy: name(p.approvedById),
    cancelledBy: name(p.cancelledById),
    locked: LOCKED.includes(p.status),
    disclaimer: TAX_DISCLAIMER,
    byDepartment: byDept.map((d) => ({
      department: d.departmentName ?? 'Unassigned',
      employees: d._count,
      gross: toNumber(d._sum.grossSalary),
      net: toNumber(d._sum.netSalary),
      tax: toNumber(d._sum.taxAmount),
    })),
  };
}

export async function generate(auth: AuthContext, input: z.infer<typeof generatePayrollSchema>, actor: AuditActor) {
  const orgId = auth.organisationId;
  const key = periodKey(input.year, input.month);
  const existing = await prisma.payroll.findUnique({ where: { organisationId_periodKey: { organisationId: orgId, periodKey: key } } });
  if (existing) throw conflict(`Payroll for ${periodLabel(input.year, input.month)} already exists (${existing.status.toLowerCase()}). Recalculate or cancel it instead.`, 'PAYROLL_EXISTS');
  const { start, end } = monthRange(input.year, input.month);

  const payroll = await prisma.$transaction(
    async (tx) => {
      const run = await tx.payroll.create({
        data: { organisationId: orgId, year: input.year, month: input.month, periodKey: key, periodStart: start, periodEnd: end, status: 'PROCESSING', notes: input.notes ?? null, generatedById: auth.userId },
      });
      const totals = await calculateItems(tx, run.id, orgId, input.year, input.month);
      await writeAudit(actor, { action: 'PAYROLL_GENERATED', module: 'payroll', recordId: run.id, newValue: { period: key, ...totals } }, tx);
      return run;
    },
    { timeout: 300_000, maxWait: 20_000 },
  );

  const approvers = await usersWithPermission(orgId, ['payroll.approve']);
  await notify(approvers.filter((u) => u !== auth.userId), {
    organisationId: orgId,
    type: 'PAYROLL_PROCESSED',
    title: `Payroll generated for ${periodLabel(input.year, input.month)}`,
    message: 'A draft payroll is ready for review.',
    link: `/app/payroll/runs/${payroll.id}`,
  });
  return get(orgId, payroll.id);
}

/** Re-run calculations for a draft (or reviewed) payroll after fixing attendance, leave or salaries. */
export async function recalculate(auth: AuthContext, id: string, actor: AuditActor) {
  const p = await findRun(auth.organisationId, id);
  if (!['DRAFT', 'REVIEWED'].includes(p.status)) throw badRequest(`A ${p.status.toLowerCase()} payroll cannot be recalculated`, 'PAYROLL_LOCKED');
  await prisma.$transaction(
    async (tx) => {
      await tx.payroll.update({ where: { id }, data: { status: 'PROCESSING', reviewedById: null, reviewedAt: null } });
      await tx.payrollItem.deleteMany({ where: { payrollId: id } });
      const totals = await calculateItems(tx, id, p.organisationId, p.year, p.month);
      await writeAudit(actor, { action: 'PAYROLL_RECALCULATED', module: 'payroll', recordId: id, newValue: totals }, tx);
    },
    { timeout: 300_000, maxWait: 20_000 },
  );
  return get(auth.organisationId, id);
}

/** Move a run from one status to the next, re-checking the status inside the transaction. */
async function transition(orgId: string, id: string, from: PayrollStatus[], apply: (tx: Tx, p: Awaited<ReturnType<typeof findRun>>) => Promise<void>) {
  const p = await findRun(orgId, id);
  if (!from.includes(p.status)) throw badRequest(`This payroll is ${p.status.toLowerCase()}; that action is not available`, 'INVALID_STATUS');
  await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.payroll.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== p.status) throw conflict('This payroll was just changed by someone else. Refresh and try again.', 'STALE_PAYROLL');
      await apply(tx, p);
    },
    { timeout: 120_000 },
  );
}

export async function review(auth: AuthContext, id: string, actor: AuditActor) {
  await transition(auth.organisationId, id, ['DRAFT'], async (tx) => {
    await tx.payroll.update({ where: { id }, data: { status: 'REVIEWED', reviewedById: auth.userId, reviewedAt: new Date() } });
    await writeAudit(actor, { action: 'PAYROLL_REVIEWED', module: 'payroll', recordId: id }, tx);
  });
  return get(auth.organisationId, id);
}

/** Approve: lock the run and issue a payslip for every item, all in one transaction. */
export async function approve(auth: AuthContext, id: string, actor: AuditActor) {
  let run: Awaited<ReturnType<typeof findRun>> | null = null;
  await transition(auth.organisationId, id, ['REVIEWED'], async (tx, p) => {
    run = p;
    const settings = await getPayrollSettings(p.organisationId, tx);
    await tx.payroll.update({ where: { id }, data: { status: 'APPROVED', approvedById: auth.userId, approvedAt: new Date() } });
    const items = await tx.payrollItem.findMany({ where: { payrollId: id }, select: { id: true, employeeId: true, employeeCode: true } });
    // Remove payslips left over from a cancelled run for the same period, then issue new ones.
    await tx.payslip.deleteMany({ where: { employeeId: { in: items.map((i) => i.employeeId) }, year: p.year, month: p.month } });
    await tx.payslip.createMany({
      data: items.map((i) => ({
        organisationId: p.organisationId,
        payrollItemId: i.id,
        employeeId: i.employeeId,
        year: p.year,
        month: p.month,
        payslipNumber: `${settings.payslipPrefix}-${periodKey(p.year, p.month)}-${i.employeeCode}`,
      })),
    });
    await writeAudit(actor, { action: 'PAYROLL_APPROVED', module: 'payroll', recordId: id, newValue: { period: periodKey(p.year, p.month), payslips: items.length, totalNet: toNumber(p.totalNet) } }, tx);
  });

  const p = run!;
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: auth.organisationId }, select: { name: true } });
  const users = await prisma.user.findMany({
    where: { employee: { payrollItems: { some: { payrollId: id } } }, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  await notify(
    users.map((u) => u.id),
    {
      organisationId: auth.organisationId,
      type: 'PAYSLIP_AVAILABLE',
      title: `Payslip for ${periodLabel(p.year, p.month)} is ready`,
      message: 'Your payslip is available to view and download.',
      link: '/app/me/payslips',
      email: (r) => templates.payslipAvailable({ orgName: org.name, name: r.name, period: periodLabel(p.year, p.month), url: `${env.FRONTEND_URL}/app/me/payslips` }),
    },
  );
  return get(auth.organisationId, id);
}

export async function markPaid(auth: AuthContext, id: string, actor: AuditActor) {
  await transition(auth.organisationId, id, ['APPROVED'], async (tx) => {
    await tx.payroll.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
    await writeAudit(actor, { action: 'PAYROLL_PAID', module: 'payroll', recordId: id }, tx);
  });
  return get(auth.organisationId, id);
}

/** Cancel frees the period for a new run. Paid payroll cannot be cancelled. Items are kept for history. */
export async function cancel(auth: AuthContext, id: string, reason: string, actor: AuditActor) {
  await transition(auth.organisationId, id, ['DRAFT', 'REVIEWED', 'APPROVED'], async (tx, p) => {
    await tx.payslip.deleteMany({ where: { payrollItem: { payrollId: id } } });
    await tx.payroll.update({
      where: { id },
      data: { status: 'CANCELLED', periodKey: null, cancelledById: auth.userId, cancelledAt: new Date(), notes: [p.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') },
    });
    await writeAudit(actor, { action: 'PAYROLL_CANCELLED', module: 'payroll', recordId: id, oldValue: { status: p.status }, newValue: { reason } }, tx);
  });
  return get(auth.organisationId, id);
}

// ── Register & items ─────────────────────────────────────────

const itemInclude = { components: { orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }] }, payslip: { select: { id: true, payslipNumber: true } } } satisfies Prisma.PayrollItemInclude;

export function shapeItem(i: Prisma.PayrollItemGetPayload<{ include: typeof itemInclude }>) {
  const componentsByCategory = (cats: string[]) => i.components.filter((c) => c.type === 'DEDUCTION' && cats.includes(c.category)).reduce((s, c) => s + toNumber(c.amount), 0);
  return {
    ...i,
    basicSalary: toNumber(i.basicSalary),
    totalAllowances: toNumber(i.totalAllowances),
    grossSalary: toNumber(i.grossSalary),
    taxableIncome: toNumber(i.taxableIncome),
    taxAmount: toNumber(i.taxAmount),
    retirementContribution: toNumber(i.retirementContribution),
    otherDeductions: toNumber(i.otherDeductions),
    totalDeductions: toNumber(i.totalDeductions),
    netSalary: toNumber(i.netSalary),
    payableDays: toNumber(i.payableDays),
    paidLeaveDays: toNumber(i.paidLeaveDays),
    unpaidDays: toNumber(i.unpaidDays),
    pfSsf: round2(componentsByCategory(['PROVIDENT_FUND', 'SOCIAL_SECURITY'])),
    components: i.components.map((c) => ({ ...c, amount: toNumber(c.amount) })),
  };
}

export async function register(orgId: string, id: string, q: z.infer<typeof registerQuery>) {
  const p = await findRun(orgId, id);
  const where: Prisma.PayrollItemWhereInput = {
    payrollId: id,
    ...(q.departmentId ? { employee: { departmentId: q.departmentId } } : {}),
    ...(q.search
      ? { OR: [{ employeeName: { contains: q.search, mode: 'insensitive' } }, { employeeCode: { contains: q.search, mode: 'insensitive' } }, { departmentName: { contains: q.search, mode: 'insensitive' } }] }
      : {}),
  };
  const sortable = ['employeeCode', 'employeeName', 'departmentName', 'grossSalary', 'netSalary'] as const;
  const sortBy = (sortable as readonly string[]).includes(q.sortBy ?? '') ? (q.sortBy as (typeof sortable)[number]) : 'employeeCode';
  const [rows, total, sums] = await Promise.all([
    prisma.payrollItem.findMany({ where, include: itemInclude, orderBy: { [sortBy]: q.sortBy ? q.sortOrder : 'asc' }, ...paging(q) }),
    prisma.payrollItem.count({ where }),
    prisma.payrollItem.aggregate({ where, _sum: { basicSalary: true, totalAllowances: true, grossSalary: true, taxAmount: true, retirementContribution: true, otherDeductions: true, totalDeductions: true, netSalary: true } }),
  ]);
  return {
    payroll: shapeRun(p),
    ...paginated(rows.map(shapeItem), total, q),
    totals: Object.fromEntries(Object.entries(sums._sum).map(([k, v]) => [k, toNumber(v)])),
  };
}

export async function item(orgId: string, payrollId: string, itemId: string) {
  const i = await prisma.payrollItem.findFirst({ where: { id: itemId, payrollId, payroll: { organisationId: orgId } }, include: itemInclude });
  if (!i) throw notFound('Payroll item');
  return shapeItem(i);
}
