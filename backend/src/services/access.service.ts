import type { Prisma } from '@prisma/client';
import type { AuthContext } from '../types/express';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../utils/errors';

/**
 * Row-level access. Every employee-linked query goes through these helpers so managers only
 * see their team and employees only see themselves, regardless of what the client asks for.
 */
export function employeeScope(auth: AuthContext): Prisma.EmployeeWhereInput {
  const base: Prisma.EmployeeWhereInput = { organisationId: auth.organisationId, deletedAt: null };
  switch (auth.dataScope) {
    case 'ORGANISATION':
      return base;
    case 'TEAM':
      if (!auth.employeeId) return { ...base, id: '__none__' };
      return {
        ...base,
        OR: [{ id: auth.employeeId }, { managerId: auth.employeeId }, { supervisorId: auth.employeeId }, { department: { headId: auth.employeeId } }],
      };
    case 'SELF':
      return { ...base, id: auth.employeeId ?? '__none__' };
  }
}

/** Throws 404 (not 403) when the employee is outside the caller's scope, to avoid leaking existence. */
export async function assertEmployeeAccess(auth: AuthContext, employeeId: string) {
  const found = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id: employeeId }] }, select: { id: true } });
  if (!found) throw notFound('Employee');
}

export function isSelf(auth: AuthContext, employeeId: string) {
  return auth.employeeId === employeeId;
}

export function can(auth: AuthContext, permission: string) {
  return auth.permissions.has(permission);
}

export function assertCan(auth: AuthContext, permission: string) {
  if (!auth.permissions.has(permission)) throw forbidden();
}

/** Is `actorEmployeeId` the manager, supervisor or department head of the employee? */
export async function isSupervisorOf(actorEmployeeId: string | null, employeeId: string) {
  if (!actorEmployeeId) return false;
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { managerId: true, supervisorId: true, department: { select: { headId: true } } },
  });
  if (!emp) return false;
  return emp.managerId === actorEmployeeId || emp.supervisorId === actorEmployeeId || emp.department?.headId === actorEmployeeId;
}

/** Fields removed from employee responses when the caller lacks employees.view_sensitive. */
export const SENSITIVE_EMPLOYEE_FIELDS = [
  'citizenshipNumber',
  'panNumber',
  'bankName',
  'bankAccountNumber',
  'ssfNumber',
  'pfNumber',
  'citNumber',
  'dateOfBirth',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'phone',
] as const;

export function redactEmployee<T extends Record<string, unknown>>(auth: AuthContext, employee: T): T {
  const selfView = auth.employeeId === employee.id;
  if (selfView || auth.permissions.has('employees.view_sensitive')) return employee;
  const copy: Record<string, unknown> = { ...employee };
  for (const f of SENSITIVE_EMPLOYEE_FIELDS) if (f in copy) copy[f] = null;
  return copy as T;
}
