import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { PermissionKey } from '../config/permissions';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../utils/errors';

export interface AccessTokenPayload {
  sub: string;
  org: string;
  iat?: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ sub: payload.sub, org: payload.org }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'sprasa-hr',
  });
}

/**
 * Verifies the bearer access token, then loads the user, role and permissions from the
 * database on every request so disabled accounts and role changes take effect immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();

  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { issuer: 'sprasa-hr' }) as AccessTokenPayload;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.', 'TOKEN_INVALID');
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user || user.status !== 'ACTIVE') throw unauthorized('Account is not active', 'ACCOUNT_INACTIVE');
  if (user.passwordChangedAt && payload.iat && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
    throw unauthorized('Password was changed. Please sign in again.', 'TOKEN_REVOKED');
  }

  const permissions = new Set(user.role.permissions.map((rp) => rp.permission.key));

  // Super admins can act inside another organisation by sending X-Organisation-Id.
  let organisationId = user.organisationId;
  const requestedOrg = req.header('x-organisation-id');
  if (requestedOrg && requestedOrg !== user.organisationId) {
    if (!permissions.has('organisations.manage')) throw forbidden('You cannot access another organisation');
    const exists = await prisma.organisation.findUnique({ where: { id: requestedOrg }, select: { id: true } });
    if (!exists) throw forbidden('Organisation not found');
    organisationId = requestedOrg;
  }

  req.auth = {
    userId: user.id,
    organisationId,
    homeOrganisationId: user.organisationId,
    roleKey: user.role.key,
    dataScope: user.role.dataScope,
    permissions,
    employeeId: user.employeeId,
    name: user.name,
    email: user.email,
  };
  next();
};

/** Require at least one of the listed permissions. */
export function requirePermission(...keys: PermissionKey[]): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw unauthorized();
    if (!keys.some((k) => auth.permissions.has(k))) throw forbidden();
    next();
  };
}

/** Routes for employee self-service require a linked employee record. */
export const requireEmployeeLink: RequestHandler = (req, _res, next) => {
  if (!req.auth?.employeeId) {
    throw forbidden('Your user account is not linked to an employee record', 'NO_EMPLOYEE_LINK');
  }
  next();
};
