import crypto from 'node:crypto';
import fs from 'node:fs';
import type { EmploymentEventType, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma, type Tx } from '../../lib/prisma';
import { resolveUploadPath } from '../../middleware/upload';
import { employeeScope, redactEmployee } from '../../services/access.service';
import { diff, writeAudit, type AuditActor } from '../../services/audit.service';
import { ensureLeaveBalances } from '../../services/leave-balance.service';
import type { AuthContext } from '../../types/express';
import { addDays, parseDateOnly, todayIn } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { dec, toNumber } from '../../utils/money';
import { orderBy, paginated, paging } from '../../utils/pagination';
import { hashPassword, sendPasswordSetupEmail } from '../auth/auth.service';
import type { assignShiftSchema, createEmployeeSchema, createSalarySchema, listEmployeesQuery, updateEmployeeSchema } from './employees.schemas';
import { EXIT_STATUSES } from './employees.schemas';
import { syncEmployeePunches } from '../attendance/punches.service';

type CreateInput = z.infer<typeof createEmployeeSchema>;
type UpdateInput = z.infer<typeof updateEmployeeSchema>;
type ListQuery = z.infer<typeof listEmployeesQuery>;

export const fullName = (e: { firstName: string; middleName?: string | null; lastName: string }) =>
  [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ');

export const listInclude = {
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
} satisfies Prisma.EmployeeInclude;

function searchWhere(search?: string): Prisma.EmployeeWhereInput {
  if (!search) return {};
  const terms = search.split(/\s+/).filter(Boolean).slice(0, 4);
  return {
    AND: terms.map((t) => ({
      OR: [
        { firstName: { contains: t, mode: 'insensitive' } },
        { lastName: { contains: t, mode: 'insensitive' } },
        { employeeCode: { contains: t, mode: 'insensitive' } },
        { email: { contains: t, mode: 'insensitive' } },
        { phone: { contains: t } },
        { department: { name: { contains: t, mode: 'insensitive' } } },
        { designation: { name: { contains: t, mode: 'insensitive' } } },
      ],
    })),
  };
}

export function buildListWhere(auth: AuthContext, q: Omit<ListQuery, 'page' | 'limit' | 'sortOrder'>): Prisma.EmployeeWhereInput {
  const statusScope: Prisma.EmployeeWhereInput =
    q.status ? { status: q.status } : q.scope === 'current' ? { status: { notIn: [...EXIT_STATUSES] } } : q.scope === 'exited' ? { status: { in: [...EXIT_STATUSES] } } : {};
  return {
    AND: [
      employeeScope(auth),
      statusScope,
      q.departmentId ? { departmentId: q.departmentId } : {},
      q.designationId ? { designationId: q.designationId } : {},
      q.managerId ? { managerId: q.managerId } : {},
      q.employmentType ? { employmentType: q.employmentType } : {},
      searchWhere(q.search),
    ],
  };
}

const SORTABLE = ['employeeCode', 'firstName', 'lastName', 'joinDate', 'createdAt', 'status'] as const;

export async function list(auth: AuthContext, q: ListQuery) {
  const where = buildListWhere(auth, q);
  const [rows, total] = await Promise.all([
    prisma.employee.findMany({ where, include: listInclude, orderBy: orderBy(q.sortBy, SORTABLE, 'employeeCode', q.sortBy ? q.sortOrder : 'asc'), ...paging(q) }),
    prisma.employee.count({ where }),
  ]);
  return paginated(
    rows.map((r) => redactEmployee(auth, { ...r, fullName: fullName(r), photoPath: undefined, hasPhoto: Boolean(r.photoPath) })),
    total,
    q,
  );
}

/** Lightweight list for pickers (manager, approver, filters). */
export async function options(auth: AuthContext, search?: string) {
  const rows = await prisma.employee.findMany({
    where: { AND: [employeeScope(auth), { status: { notIn: [...EXIT_STATUSES] } }, searchWhere(search)] },
    select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true, department: { select: { name: true } }, designation: { select: { name: true } } },
    orderBy: { firstName: 'asc' },
    take: 50,
  });
  return rows.map((r) => ({ id: r.id, employeeCode: r.employeeCode, name: fullName(r), department: r.department?.name ?? null, designation: r.designation?.name ?? null }));
}

export async function getById(auth: AuthContext, id: string) {
  const emp = await prisma.employee.findFirst({
    where: { AND: [employeeScope(auth), { id }] },
    include: {
      ...listInclude,
      supervisor: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      user: { select: { id: true, email: true, status: true, role: { select: { name: true } } } },
      reports: { where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: { select: { name: true } } } },
      shifts: { orderBy: { effectiveFrom: 'desc' }, take: 1, include: { shift: true } },
    },
  });
  if (!emp) throw notFound('Employee');

  const canSeeSalary = auth.permissions.has('salary.view') || auth.employeeId === id;
  const currentSalary = canSeeSalary ? await currentSalaryFor(id) : null;

  const { photoPath, shifts, ...rest } = emp;
  return redactEmployee(auth, {
    ...rest,
    fullName: fullName(emp),
    hasPhoto: Boolean(photoPath),
    currentShift: shifts[0]?.shift ?? null,
    currentSalary: currentSalary ? { id: currentSalary.id, basicSalary: toNumber(currentSalary.basicSalary), effectiveFrom: currentSalary.effectiveFrom } : null,
  });
}

export async function currentSalaryFor(employeeId: string, onDate?: Date) {
  const date = onDate ?? todayIn();
  return prisma.employeeSalary.findFirst({
    where: { employeeId, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] },
    orderBy: { effectiveFrom: 'desc' },
    include: { lines: { include: { component: true } }, structure: { select: { id: true, name: true } } },
  });
}

/** Validate that referenced department/designation/manager/shift belong to the same organisation. */
async function assertReferences(orgId: string, input: Partial<CreateInput & UpdateInput>, selfId?: string) {
  const checks: Promise<void>[] = [];
  const need = (ok: Promise<unknown>, entity: string) =>
    checks.push(ok.then((r) => { if (!r) throw notFound(entity); }));
  if (input.departmentId) need(prisma.department.findFirst({ where: { id: input.departmentId, organisationId: orgId, deletedAt: null } }), 'Department');
  if (input.designationId) need(prisma.designation.findFirst({ where: { id: input.designationId, organisationId: orgId, deletedAt: null } }), 'Designation');
  if (input.managerId) need(prisma.employee.findFirst({ where: { id: input.managerId, organisationId: orgId, deletedAt: null } }), 'Manager');
  if (input.supervisorId) need(prisma.employee.findFirst({ where: { id: input.supervisorId, organisationId: orgId, deletedAt: null } }), 'Supervisor');
  if (input.shiftId) need(prisma.shift.findFirst({ where: { id: input.shiftId, organisationId: orgId } }), 'Shift');
  if (input.salaryStructureId) need(prisma.salaryStructure.findFirst({ where: { id: input.salaryStructureId, organisationId: orgId } }), 'Salary structure');
  await Promise.all(checks);

  if (input.deviceUserId) {
    const owner = await prisma.employee.findFirst({ where: { organisationId: orgId, deviceUserId: input.deviceUserId, ...(selfId ? { id: { not: selfId } } : {}) } });
    if (owner) throw conflict(`Machine number ${input.deviceUserId} already belongs to ${fullName(owner)}`, 'DEVICE_USER_TAKEN');
  }

  if (selfId && (input.managerId === selfId || input.supervisorId === selfId)) {
    throw badRequest('An employee cannot report to themselves', 'INVALID_MANAGER');
  }
  if (selfId && input.managerId) await assertNoReportingCycle(selfId, input.managerId);
}

/** Walk up the manager chain to make sure the new manager does not report (indirectly) to this employee. */
async function assertNoReportingCycle(employeeId: string, managerId: string) {
  let current: string | null = managerId;
  for (let depth = 0; current && depth < 50; depth++) {
    if (current === employeeId) throw badRequest('This would create a reporting loop', 'REPORTING_CYCLE');
    const next: { managerId: string | null } | null = await prisma.employee.findUnique({ where: { id: current }, select: { managerId: true } });
    current = next?.managerId ?? null;
  }
}

function dateFields<T extends { dateOfBirth?: string | null; joinDate?: string; exitDate?: string | null }>(input: T) {
  return {
    ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth) : null } : {}),
    ...(input.joinDate !== undefined ? { joinDate: parseDateOnly(input.joinDate) } : {}),
    ...(input.exitDate !== undefined ? { exitDate: input.exitDate ? parseDateOnly(input.exitDate) : null } : {}),
  };
}

async function copyStructureLines(tx: Tx, structureId: string) {
  const lines = await tx.salaryStructureLine.findMany({ where: { structureId } });
  return lines.map((l) => ({ componentId: l.componentId, calculationType: l.calculationType, value: l.value }));
}

export async function create(auth: AuthContext, input: CreateInput, actor: AuditActor) {
  const orgId = auth.organisationId;
  await assertReferences(orgId, input);
  if (input.createUserAccount) {
    if (!input.email) throw badRequest('An email address is required to create a login', 'EMAIL_REQUIRED');
    if (await prisma.user.findUnique({ where: { email: input.email } })) throw conflict('A user with this email already exists', 'EMAIL_TAKEN');
  }

  const { shiftId, basicSalary, salaryStructureId, createUserAccount, dateOfBirth: _dob, joinDate: _jd, ...fields } = input;
  const joinDate = parseDateOnly(input.joinDate);

  const { employee, userId } = await prisma.$transaction(
    async (tx) => {
      const employee = await tx.employee.create({
        data: { ...fields, ...dateFields(input), joinDate, organisationId: orgId },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: employee.id,
          eventType: 'JOINED',
          effectiveDate: joinDate,
          departmentId: employee.departmentId,
          designationId: employee.designationId,
          status: employee.status,
          remarks: 'Joined the organisation',
          createdById: auth.userId,
        },
      });

      if (basicSalary !== undefined) {
        await tx.employeeSalary.create({
          data: {
            employeeId: employee.id,
            basicSalary: dec(basicSalary),
            effectiveFrom: joinDate,
            structureId: salaryStructureId ?? null,
            reason: 'Initial salary',
            createdById: auth.userId,
            lines: salaryStructureId ? { create: await copyStructureLines(tx, salaryStructureId) } : undefined,
          },
        });
      }

      const org = await tx.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { defaultShiftId: true } });
      const shift = shiftId ?? org.defaultShiftId;
      if (shift) await tx.employeeShift.create({ data: { employeeId: employee.id, shiftId: shift, effectiveFrom: joinDate } });

      await ensureLeaveBalances(tx, orgId, employee.id, todayIn().getUTCFullYear());

      let userId: string | null = null;
      if (createUserAccount && input.email) {
        const role = await tx.role.findUniqueOrThrow({ where: { organisationId_key: { organisationId: orgId, key: 'employee' } } });
        const user = await tx.user.create({
          data: {
            organisationId: orgId,
            email: input.email,
            name: fullName(employee),
            roleId: role.id,
            employeeId: employee.id,
            status: 'INVITED',
            passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
          },
        });
        userId = user.id;
      }

      await writeAudit(
        actor,
        { action: 'EMPLOYEE_CREATED', module: 'employees', recordId: employee.id, newValue: { employeeCode: employee.employeeCode, name: fullName(employee), basicSalary } },
        tx,
      );
      return { employee, userId };
    },
    { timeout: 30_000 },
  );

  if (userId) await sendPasswordSetupEmail(userId);
  // Scans the machine sent before this person was added show up straight away.
  if (employee.deviceUserId) await syncEmployeePunches(orgId, employee.id, employee.deviceUserId);
  return getById(auth, employee.id);
}

export async function update(auth: AuthContext, id: string, input: UpdateInput, actor: AuditActor) {
  const before = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] } });
  if (!before) throw notFound('Employee');
  await assertReferences(auth.organisationId, input, id);

  const { changeRemarks, ...fields } = input;
  const data: Prisma.EmployeeUncheckedUpdateInput = { ...fields, ...dateFields(input) };
  const today = todayIn();
  const becomingExited = input.status && (EXIT_STATUSES as readonly string[]).includes(input.status) && !(EXIT_STATUSES as readonly string[]).includes(before.status);
  if (becomingExited && !input.exitDate && !before.exitDate) data.exitDate = today;

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data });

    const events: { eventType: EmploymentEventType; remarks: string }[] = [];
    if (input.departmentId !== undefined && input.departmentId !== before.departmentId) events.push({ eventType: 'TRANSFER', remarks: 'Department changed' });
    if (input.designationId !== undefined && input.designationId !== before.designationId) events.push({ eventType: 'PROMOTION', remarks: 'Designation changed' });
    if (input.managerId !== undefined && input.managerId !== before.managerId) events.push({ eventType: 'MANAGER_CHANGE', remarks: 'Manager changed' });
    if (input.status && input.status !== before.status) events.push({ eventType: becomingExited ? 'EXIT' : 'STATUS_CHANGE', remarks: `Status changed from ${before.status} to ${input.status}` });

    const after = await tx.employee.findUniqueOrThrow({ where: { id } });
    for (const e of events) {
      await tx.employmentHistory.create({
        data: {
          employeeId: id,
          eventType: e.eventType,
          effectiveDate: e.eventType === 'EXIT' && after.exitDate ? after.exitDate : today,
          departmentId: after.departmentId,
          designationId: after.designationId,
          status: after.status,
          remarks: changeRemarks ? `${e.remarks}. ${changeRemarks}` : e.remarks,
          createdById: auth.userId,
        },
      });
    }

    // Exited employees lose system access.
    if (becomingExited) {
      const user = await tx.user.findUnique({ where: { employeeId: id } });
      if (user) {
        await tx.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
        await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }

    const d = diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>);
    if (d.changed) await writeAudit(actor, { action: 'EMPLOYEE_UPDATED', module: 'employees', recordId: id, oldValue: d.oldValue, newValue: d.newValue }, tx);
  });

  if (input.deviceUserId !== undefined && (input.deviceUserId ?? null) !== before.deviceUserId) {
    await syncEmployeePunches(auth.organisationId, id, input.deviceUserId ?? null, before.deviceUserId);
  }
  return getById(auth, id);
}

export async function remove(auth: AuthContext, id: string, actor: AuditActor) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] } });
  if (!emp) throw notFound('Employee');
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.employee.updateMany({ where: { managerId: id }, data: { managerId: null } });
    await tx.employee.updateMany({ where: { supervisorId: id }, data: { supervisorId: null } });
    await tx.department.updateMany({ where: { headId: id }, data: { headId: null } });
    const user = await tx.user.findUnique({ where: { employeeId: id } });
    if (user) {
      await tx.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await writeAudit(actor, { action: 'EMPLOYEE_DELETED', module: 'employees', recordId: id, oldValue: { employeeCode: emp.employeeCode, name: fullName(emp) } }, tx);
  });
}

export async function history(auth: AuthContext, id: string) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] }, select: { id: true } });
  if (!emp) throw notFound('Employee');
  return prisma.employmentHistory.findMany({
    where: { employeeId: id },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    include: { department: { select: { name: true } }, designation: { select: { name: true } } },
  });
}

/** Recent audit entries about this employee, for the Activity tab. */
export async function activity(auth: AuthContext, id: string) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] }, select: { id: true } });
  if (!emp) throw notFound('Employee');
  return prisma.auditLog.findMany({
    where: { organisationId: auth.organisationId, recordId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, module: true, createdAt: true, user: { select: { name: true } } },
  });
}

export async function nextEmployeeCode(orgId: string) {
  const rows = await prisma.employee.findMany({ where: { organisationId: orgId }, select: { employeeCode: true } });
  const max = rows.reduce((m, r) => {
    const n = /(\d+)$/.exec(r.employeeCode);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `EMP-${String(max + 1).padStart(4, '0')}`;
}

// ── Photo ────────────────────────────────────────────────────

export async function setPhoto(auth: AuthContext, id: string, relativePath: string, actor: AuditActor) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] } });
  if (!emp) throw notFound('Employee');
  await prisma.employee.update({ where: { id }, data: { photoPath: relativePath } });
  if (emp.photoPath) fs.rm(resolveUploadPath(emp.photoPath), { force: true }, () => undefined);
  await writeAudit(actor, { action: 'EMPLOYEE_PHOTO_UPDATED', module: 'employees', recordId: id });
}

export async function photoFile(auth: AuthContext, id: string) {
  const emp = await prisma.employee.findFirst({ where: { AND: [{ organisationId: auth.organisationId }, { id }] }, select: { photoPath: true } });
  if (!emp?.photoPath) throw notFound('Photo');
  return resolveUploadPath(emp.photoPath);
}

// ── Salary history ───────────────────────────────────────────

export async function salaryHistory(auth: AuthContext, id: string) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] }, select: { id: true } });
  if (!emp) throw notFound('Employee');
  const rows = await prisma.employeeSalary.findMany({
    where: { employeeId: id },
    orderBy: { effectiveFrom: 'desc' },
    include: { lines: { include: { component: { select: { id: true, name: true, code: true, type: true, category: true } } } }, structure: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    ...r,
    basicSalary: toNumber(r.basicSalary),
    lines: r.lines.map((l) => ({ ...l, value: toNumber(l.value) })),
  }));
}

/**
 * A salary change never edits the old record: the current salary is closed the day before the
 * new effective date and a new record is created, so historical payroll stays reproducible.
 */
export async function createSalary(auth: AuthContext, id: string, input: z.infer<typeof createSalarySchema>, actor: AuditActor) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] } });
  if (!emp) throw notFound('Employee');
  const effectiveFrom = parseDateOnly(input.effectiveFrom);
  if (effectiveFrom < emp.joinDate) throw badRequest('Salary cannot start before the join date', 'INVALID_EFFECTIVE_DATE');

  if (input.structureId) {
    const s = await prisma.salaryStructure.findFirst({ where: { id: input.structureId, organisationId: auth.organisationId } });
    if (!s) throw notFound('Salary structure');
  }
  if (input.lines?.length) {
    const count = await prisma.salaryComponent.count({ where: { organisationId: auth.organisationId, id: { in: input.lines.map((l) => l.componentId) } } });
    if (count !== new Set(input.lines.map((l) => l.componentId)).size) throw notFound('Salary component');
  }

  const latest = await prisma.employeeSalary.findFirst({ where: { employeeId: id }, orderBy: { effectiveFrom: 'desc' } });
  if (latest && effectiveFrom <= latest.effectiveFrom) {
    throw badRequest('The new salary must start after the current one. Past salary records cannot be overwritten.', 'SALARY_HISTORY_LOCKED');
  }

  const created = await prisma.$transaction(async (tx) => {
    if (latest && !latest.effectiveTo) {
      await tx.employeeSalary.update({ where: { id: latest.id }, data: { effectiveTo: addDays(effectiveFrom, -1) } });
    }
    const lines = input.lines ?? (input.structureId ? await copyStructureLines(tx, input.structureId) : []);
    const salary = await tx.employeeSalary.create({
      data: {
        employeeId: id,
        basicSalary: dec(input.basicSalary),
        effectiveFrom,
        structureId: input.structureId ?? null,
        reason: input.reason ?? null,
        createdById: auth.userId,
        lines: { create: lines.map((l) => ({ componentId: l.componentId, calculationType: l.calculationType, value: typeof l.value === 'number' ? dec(l.value) : l.value })) },
      },
    });
    await tx.employmentHistory.create({
      data: {
        employeeId: id,
        eventType: 'SALARY_CHANGE',
        effectiveDate: effectiveFrom,
        departmentId: emp.departmentId,
        designationId: emp.designationId,
        status: emp.status,
        remarks: input.reason ?? 'Salary revised',
        createdById: auth.userId,
      },
    });
    await writeAudit(
      actor,
      {
        action: 'SALARY_CHANGED',
        module: 'payroll',
        recordId: id,
        oldValue: latest ? { basicSalary: toNumber(latest.basicSalary), effectiveFrom: latest.effectiveFrom } : undefined,
        newValue: { basicSalary: input.basicSalary, effectiveFrom: input.effectiveFrom, lines: lines.length },
      },
      tx,
    );
    return salary;
  });
  return created;
}

// ── Shift assignment ─────────────────────────────────────────

export async function assignShift(auth: AuthContext, id: string, input: z.infer<typeof assignShiftSchema>, actor: AuditActor) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] } });
  if (!emp) throw notFound('Employee');
  const shift = await prisma.shift.findFirst({ where: { id: input.shiftId, organisationId: auth.organisationId } });
  if (!shift) throw notFound('Shift');
  const from = parseDateOnly(input.effectiveFrom);
  await prisma.$transaction(async (tx) => {
    // Close the open assignment; drop any that start on/after the new date.
    await tx.employeeShift.deleteMany({ where: { employeeId: id, effectiveFrom: { gte: from } } });
    await tx.employeeShift.updateMany({ where: { employeeId: id, effectiveTo: null }, data: { effectiveTo: addDays(from, -1) } });
    await tx.employeeShift.create({ data: { employeeId: id, shiftId: shift.id, effectiveFrom: from } });
    await writeAudit(actor, { action: 'SHIFT_ASSIGNED', module: 'attendance', recordId: id, newValue: { shift: shift.name, effectiveFrom: input.effectiveFrom } }, tx);
  });
}

export async function shiftHistory(auth: AuthContext, id: string) {
  const emp = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id }] }, select: { id: true } });
  if (!emp) throw notFound('Employee');
  return prisma.employeeShift.findMany({ where: { employeeId: id }, orderBy: { effectiveFrom: 'desc' }, include: { shift: true } });
}

// ── Organisation chart ───────────────────────────────────────

export interface OrgNode {
  id: string;
  name: string;
  employeeCode: string;
  designation: string | null;
  department: string | null;
  hasPhoto: boolean;
  children: OrgNode[];
}

export async function orgChart(auth: AuthContext) {
  const rows = await prisma.employee.findMany({
    where: { AND: [employeeScope(auth), { status: { notIn: [...EXIT_STATUSES] } }] },
    select: { id: true, firstName: true, middleName: true, lastName: true, employeeCode: true, managerId: true, photoPath: true, designation: { select: { name: true, level: true } }, department: { select: { name: true } } },
  });
  const nodes = new Map<string, OrgNode & { level: number }>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      name: fullName(r),
      employeeCode: r.employeeCode,
      designation: r.designation?.name ?? null,
      department: r.department?.name ?? null,
      hasPhoto: Boolean(r.photoPath),
      level: r.designation?.level ?? 99,
      children: [],
    });
  }
  const roots: OrgNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = r.managerId ? nodes.get(r.managerId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: OrgNode[]) => {
    list.sort((a, b) => (a as OrgNode & { level: number }).level - (b as OrgNode & { level: number }).level || a.name.localeCompare(b.name));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
