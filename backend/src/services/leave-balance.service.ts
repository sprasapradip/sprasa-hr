import { prisma, type Db } from '../lib/prisma';
import { dec, toNumber } from '../utils/money';
import { carryForwardDays, proratedEntitlement } from './engines/leave.engine';

/**
 * Create any missing leave balances for an employee and year. Existing balances are left
 * untouched so manual adjustments survive. Entitlement is pro-rated for the joining year and
 * carry-forward is taken from the previous year's unused days, capped by the leave type.
 */
export async function ensureLeaveBalances(db: Db, organisationId: string, employeeId: string, year: number) {
  const [employee, types, existing, previous] = await Promise.all([
    db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { joinDate: true } }),
    db.leaveType.findMany({ where: { organisationId, status: 'ACTIVE' } }),
    db.leaveBalance.findMany({ where: { employeeId, year }, select: { leaveTypeId: true } }),
    db.leaveBalance.findMany({ where: { employeeId, year: year - 1 } }),
  ]);
  const have = new Set(existing.map((b) => b.leaveTypeId));
  const prevByType = new Map(previous.map((b) => [b.leaveTypeId, b]));

  const toCreate = types
    .filter((t) => !have.has(t.id))
    .map((t) => {
      const prev = prevByType.get(t.id);
      const carried = carryForwardDays(
        prev
          ? { entitled: toNumber(prev.entitled), carriedForward: toNumber(prev.carriedForward), adjusted: toNumber(prev.adjusted), used: toNumber(prev.used), pending: 0 }
          : null,
        { carryForward: t.carryForward, maxCarryForward: toNumber(t.maxCarryForward) },
      );
      return {
        employeeId,
        leaveTypeId: t.id,
        year,
        entitled: dec(proratedEntitlement(toNumber(t.annualDays), employee.joinDate, year)),
        carriedForward: dec(carried),
      };
    });
  if (toCreate.length) await db.leaveBalance.createMany({ data: toCreate, skipDuplicates: true });
}

/** Initialise balances for every active employee in an organisation (e.g. at the start of a year). */
export async function ensureLeaveBalancesForOrganisation(organisationId: string, year: number) {
  const employees = await prisma.employee.findMany({
    where: { organisationId, deletedAt: null, status: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE'] } },
    select: { id: true },
  });
  for (const e of employees) await ensureLeaveBalances(prisma, organisationId, e.id, year);
  return employees.length;
}
