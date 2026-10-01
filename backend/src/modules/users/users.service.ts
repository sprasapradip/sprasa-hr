import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ALL_PERMISSIONS } from '../../config/permissions';
import { prisma } from '../../lib/prisma';
import { writeAudit, type AuditActor } from '../../services/audit.service';
import type { AuthContext } from '../../types/express';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { paginated, paging, type PaginationQuery } from '../../utils/pagination';
import { nullable } from '../../utils/validation';
import { passwordSchema } from '../auth/auth.schemas';
import { hashPassword, sendPasswordSetupEmail } from '../auth/auth.service';

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  username: nullable(z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, '3–40 letters, numbers, dots, dashes or underscores')),
  roleId: z.string().uuid(),
  employeeId: nullable(z.string().uuid()),
  /** If omitted, the user gets an email link to set their own password. */
  password: passwordSchema.optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED']).optional(),
});

export const updateUserSchema = createUserSchema.omit({ password: true }).partial();

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: nullable(z.string().trim().max(250)),
  dataScope: z.enum(['ORGANISATION', 'TEAM', 'SELF']),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(ALL_PERMISSIONS.length),
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  lockedUntil: true,
  role: { select: { id: true, key: true, name: true } },
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
} satisfies Prisma.UserSelect;

export async function listUsers(orgId: string, q: PaginationQuery & { roleId?: string; status?: string }) {
  const where: Prisma.UserWhereInput = {
    organisationId: orgId,
    deletedAt: null,
    ...(q.roleId ? { roleId: q.roleId } : {}),
    ...(q.status ? { status: q.status as Prisma.EnumUserStatusFilter['equals'] } : {}),
    ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, orderBy: { name: 'asc' }, ...paging(q) }),
    prisma.user.count({ where }),
  ]);
  return paginated(rows, total, q);
}

/** Only super admins may grant roles that include role/organisation management. */
async function assertAssignableRole(auth: AuthContext, roleId: string) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, organisationId: auth.organisationId },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) throw notFound('Role');
  const privileged = role.permissions.some((p) => p.permission.key === 'roles.manage' || p.permission.key === 'organisations.manage');
  if (privileged && !auth.permissions.has('roles.manage')) throw forbidden('You cannot assign this role', 'PRIVILEGE_ESCALATION');
  // Nobody can grant permissions they don't hold themselves.
  const missing = role.permissions.map((p) => p.permission.key).filter((k) => !auth.permissions.has(k));
  if (missing.length) throw forbidden('You cannot assign a role with permissions you do not have', 'PRIVILEGE_ESCALATION');
  return role;
}

async function assertEmployeeLinkable(orgId: string, employeeId: string, exceptUserId?: string) {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organisationId: orgId, deletedAt: null }, include: { user: true } });
  if (!emp) throw notFound('Employee');
  if (emp.user && emp.user.id !== exceptUserId) throw conflict('This employee already has a user account', 'EMPLOYEE_ALREADY_LINKED');
}

export async function createUser(auth: AuthContext, input: z.infer<typeof createUserSchema>, actor: AuditActor) {
  await assertAssignableRole(auth, input.roleId);
  if (input.employeeId) await assertEmployeeLinkable(auth.organisationId, input.employeeId);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        organisationId: auth.organisationId,
        name: input.name,
        email: input.email,
        username: input.username ?? null,
        roleId: input.roleId,
        employeeId: input.employeeId ?? null,
        passwordHash: await hashPassword(input.password ?? crypto.randomBytes(32).toString('hex')),
        status: input.password ? (input.status ?? 'ACTIVE') : 'INVITED',
      },
      select: userSelect,
    });
    await writeAudit(actor, { action: 'USER_CREATED', module: 'users', recordId: created.id, newValue: { email: created.email, role: created.role.key } }, tx);
    return created;
  });
  if (!input.password) await sendPasswordSetupEmail(user.id);
  return user;
}

export async function updateUser(auth: AuthContext, id: string, input: z.infer<typeof updateUserSchema>, actor: AuditActor) {
  const before = await prisma.user.findFirst({ where: { id, organisationId: auth.organisationId, deletedAt: null }, select: userSelect });
  if (!before) throw notFound('User');
  if (id === auth.userId && (input.roleId || (input.status && input.status !== 'ACTIVE'))) {
    throw badRequest('You cannot change your own role or disable your own account', 'SELF_MODIFICATION');
  }
  // Changing anything about a privileged user requires the ability to assign that role.
  await assertAssignableRole(auth, before.role.id);
  if (input.roleId) await assertAssignableRole(auth, input.roleId);
  if (input.employeeId) await assertEmployeeLinkable(auth.organisationId, input.employeeId, id);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: input, select: userSelect });
    if (input.status && input.status !== 'ACTIVE') {
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await writeAudit(actor, { action: 'USER_UPDATED', module: 'users', recordId: id, oldValue: { role: before.role.key, status: before.status, email: before.email }, newValue: input }, tx);
    return u;
  });
  return updated;
}

export async function deleteUser(auth: AuthContext, id: string, actor: AuditActor) {
  if (id === auth.userId) throw badRequest('You cannot delete your own account', 'SELF_MODIFICATION');
  const user = await prisma.user.findFirst({ where: { id, organisationId: auth.organisationId, deletedAt: null }, include: { role: true } });
  if (!user) throw notFound('User');
  await assertAssignableRole(auth, user.roleId);
  await prisma.$transaction(async (tx) => {
    // Soft delete: free the unique email/username/employee link so they can be reused.
    await tx.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DISABLED', email: `deleted+${id}@invalid.local`, username: null, employeeId: null },
    });
    await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(actor, { action: 'USER_DELETED', module: 'users', recordId: id, oldValue: { email: user.email, role: user.role.key } }, tx);
  });
}

export async function resendInvite(auth: AuthContext, id: string) {
  const user = await prisma.user.findFirst({ where: { id, organisationId: auth.organisationId, deletedAt: null } });
  if (!user) throw notFound('User');
  await sendPasswordSetupEmail(user.id);
}

export async function unlockUser(auth: AuthContext, id: string, actor: AuditActor) {
  const user = await prisma.user.findFirst({ where: { id, organisationId: auth.organisationId, deletedAt: null } });
  if (!user) throw notFound('User');
  await prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } });
  await writeAudit(actor, { action: 'USER_UNLOCKED', module: 'users', recordId: id });
}

// ── Roles ────────────────────────────────────────────────────

export async function listRoles(orgId: string) {
  const roles = await prisma.role.findMany({
    where: { organisationId: orgId },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: { permissions: { include: { permission: true } }, _count: { select: { users: { where: { deletedAt: null } } } } },
  });
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    dataScope: r.dataScope,
    isSystem: r.isSystem,
    userCount: r._count.users,
    permissions: r.permissions.map((p) => p.permission.key).sort(),
  }));
}

export async function listPermissions() {
  return prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
}

async function permissionIds(keys: string[]) {
  const perms = await prisma.permission.findMany({ where: { key: { in: keys } } });
  return perms.map((p) => ({ permissionId: p.id }));
}

export async function createRole(orgId: string, input: z.infer<typeof roleSchema>, actor: AuditActor) {
  const key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + crypto.randomBytes(2).toString('hex');
  const role = await prisma.role.create({
    data: { organisationId: orgId, key, name: input.name, description: input.description ?? null, dataScope: input.dataScope, permissions: { create: await permissionIds(input.permissions) } },
  });
  await writeAudit(actor, { action: 'ROLE_CREATED', module: 'users', recordId: role.id, newValue: input });
  return role;
}

export async function updateRole(orgId: string, id: string, input: z.infer<typeof roleSchema>, actor: AuditActor) {
  const role = await prisma.role.findFirst({ where: { id, organisationId: orgId }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw notFound('Role');
  if (role.key === 'super_admin') throw badRequest('The Super Admin role always has every permission', 'ROLE_LOCKED');
  const ids = await permissionIds(input.permissions);
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: id } });
    await tx.role.update({
      where: { id },
      data: { name: input.name, description: input.description ?? null, dataScope: input.dataScope, permissions: { create: ids } },
    });
    await writeAudit(
      actor,
      { action: 'ROLE_UPDATED', module: 'users', recordId: id, oldValue: { permissions: role.permissions.map((p) => p.permission.key), dataScope: role.dataScope }, newValue: input },
      tx,
    );
  });
}

export async function deleteRole(orgId: string, id: string, actor: AuditActor) {
  const role = await prisma.role.findFirst({ where: { id, organisationId: orgId }, include: { _count: { select: { users: { where: { deletedAt: null } } } } } });
  if (!role) throw notFound('Role');
  if (role.isSystem) throw badRequest('Built-in roles cannot be deleted', 'ROLE_LOCKED');
  if (role._count.users > 0) throw conflict('Move users to another role before deleting this one', 'ROLE_IN_USE');
  await prisma.role.delete({ where: { id } });
  await writeAudit(actor, { action: 'ROLE_DELETED', module: 'users', recordId: id, oldValue: { name: role.name } });
}
