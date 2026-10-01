import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { templates } from '../../emails/templates';
import { signAccessToken } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { writeAudit, type AuditActor } from '../../services/audit.service';
import { sendEmail } from '../../services/email.service';
import { notify } from '../../services/notification.service';
import { randomToken, sha256 } from '../../utils/crypto';
import { badRequest, unauthorized } from '../../utils/errors';

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Used to keep response time similar whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

interface ClientInfo {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

async function issueTokens(userId: string, organisationId: string, family: string, client: ClientInfo): Promise<IssuedTokens> {
  const refreshToken = randomToken(48);
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      family,
      expiresAt: refreshExpiresAt,
      ipAddress: client.ipAddress ?? null,
      userAgent: client.userAgent ?? null,
    },
  });
  return { accessToken: signAccessToken({ sub: userId, org: organisationId }), refreshToken, refreshExpiresAt };
}

export async function login(identifier: string, password: string, client: ClientInfo) {
  const normalised = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ email: normalised }, { username: normalised }] },
  });

  const fail = async (reason: string, userId?: string) => {
    await prisma.loginHistory.create({
      data: { userId: userId ?? null, email: normalised, success: false, reason, ipAddress: client.ipAddress, userAgent: client.userAgent },
    });
  };

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    await fail('UNKNOWN_USER');
    throw unauthorized('Email/username or password is incorrect', 'INVALID_CREDENTIALS');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await fail('LOCKED', user.id);
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw unauthorized(`Too many failed attempts. Try again in ${minutes} minute(s).`, 'ACCOUNT_LOCKED');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    await fail('BAD_PASSWORD', user.id);
    if (lock) {
      await notify([user.id], {
        organisationId: user.organisationId,
        type: 'SECURITY_ALERT',
        title: 'Account temporarily locked',
        message: `Your account was locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_LOGINS} failed sign-in attempts.`,
        email: (r) => templates.securityAlert({ orgName: 'Sprasa HR', name: r.name, message: `your account was locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_LOGINS} failed sign-in attempts.` }),
      });
    }
    throw unauthorized('Email/username or password is incorrect', 'INVALID_CREDENTIALS');
  }

  if (user.status !== 'ACTIVE') {
    await fail(`STATUS_${user.status}`, user.id);
    throw unauthorized('This account is not active. Contact your HR administrator.', 'ACCOUNT_INACTIVE');
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await prisma.loginHistory.create({
    data: { userId: user.id, email: user.email, success: true, ipAddress: client.ipAddress, userAgent: client.userAgent },
  });
  await writeAudit(
    { organisationId: user.organisationId, userId: user.id, ...client },
    { action: 'LOGIN', module: 'auth', recordId: user.id },
  );

  const tokens = await issueTokens(user.id, user.organisationId, crypto.randomUUID(), client);
  return { ...tokens, userId: user.id, organisationId: user.organisationId };
}

/**
 * Rotate a refresh token. Presenting a token that was already rotated means it was stolen or
 * replayed, so the whole token family is revoked and the user must sign in again.
 */
export async function refresh(rawToken: string | undefined, client: ClientInfo) {
  if (!rawToken) throw unauthorized('Session expired', 'REFRESH_MISSING');
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) }, include: { user: true } });
  if (!existing) throw unauthorized('Session expired', 'REFRESH_INVALID');

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { family: existing.family, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(
      { organisationId: existing.user.organisationId, userId: existing.userId, ...client },
      { action: 'REFRESH_TOKEN_REUSE', module: 'auth', recordId: existing.userId },
    );
    throw unauthorized('Session expired. Please sign in again.', 'REFRESH_REUSED');
  }
  if (existing.expiresAt < new Date()) throw unauthorized('Session expired', 'REFRESH_EXPIRED');
  if (existing.user.status !== 'ACTIVE' || existing.user.deletedAt) throw unauthorized('Account is not active', 'ACCOUNT_INACTIVE');

  const tokens = await issueTokens(existing.userId, existing.user.organisationId, existing.family, client);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedBy: sha256(tokens.refreshToken) },
  });
  return tokens;
}

export async function logout(rawToken: string | undefined, actor: AuditActor) {
  if (rawToken) {
    const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) }, include: { user: true } });
    if (token) {
      await prisma.refreshToken.updateMany({ where: { family: token.family, revokedAt: null }, data: { revokedAt: new Date() } });
      await writeAudit(
        { ...actor, organisationId: actor.organisationId ?? token.user.organisationId, userId: actor.userId ?? token.userId },
        { action: 'LOGOUT', module: 'auth', recordId: token.userId },
      );
    }
  }
}

async function createAuthToken(userId: string, type: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION') {
  const raw = randomToken(32);
  // Only one live token of each type per user.
  await prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + (type === 'PASSWORD_RESET' ? RESET_TTL_MS : VERIFY_TTL_MS)),
    },
  });
  return raw;
}

async function consumeAuthToken(raw: string, type: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION') {
  const token = await prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!token || token.type !== type || token.usedAt || token.expiresAt < new Date() || token.user.deletedAt) {
    throw badRequest('This link is invalid or has expired. Request a new one.', 'TOKEN_INVALID');
  }
  await prisma.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
  return token.user;
}

/** Always resolves the same way whether or not the email exists, to prevent account enumeration. */
export async function forgotPassword(email: string) {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null, status: 'ACTIVE' },
    include: { organisation: true },
  });
  if (!user) return;
  const raw = await createAuthToken(user.id, 'PASSWORD_RESET');
  await sendEmail(
    user.email,
    templates.passwordReset({ orgName: user.organisation.name, name: user.name, resetUrl: `${env.FRONTEND_URL}/reset-password?token=${raw}` }),
  );
}

export async function sendPasswordSetupEmail(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { organisation: true } });
  const raw = await createAuthToken(user.id, 'PASSWORD_RESET');
  await sendEmail(
    user.email,
    templates.welcome({
      orgName: user.organisation.name,
      name: user.name,
      email: user.email,
      loginUrl: `${env.FRONTEND_URL}/login`,
      setPasswordUrl: `${env.FRONTEND_URL}/reset-password?token=${raw}`,
    }),
  );
}

export async function resetPassword(raw: string, password: string, client: ClientInfo) {
  const user = await consumeAuthToken(raw, 'PASSWORD_RESET');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        // Following an emailed link proves the address works.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        status: user.status === 'INVITED' ? 'ACTIVE' : user.status,
      },
    });
    await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit({ organisationId: user.organisationId, userId: user.id, ...client }, { action: 'PASSWORD_RESET', module: 'auth', recordId: user.id }, tx);
  });
}

export async function changePassword(userId: string, current: string, next: string, client: ClientInfo) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit({ organisationId: user.organisationId, userId, ...client }, { action: 'PASSWORD_CHANGED', module: 'auth', recordId: userId }, tx);
  });
  await notify([userId], {
    organisationId: user.organisationId,
    type: 'SECURITY_ALERT',
    title: 'Password changed',
    message: 'Your password was changed. If this was not you, contact your HR administrator.',
  });
  return issueTokens(userId, user.organisationId, crypto.randomUUID(), client);
}

export async function sendVerificationEmail(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { organisation: true } });
  if (user.emailVerifiedAt) return { alreadyVerified: true };
  const raw = await createAuthToken(user.id, 'EMAIL_VERIFICATION');
  await sendEmail(
    user.email,
    templates.emailVerification({ orgName: user.organisation.name, name: user.name, verifyUrl: `${env.FRONTEND_URL}/verify-email?token=${raw}` }),
  );
  return { alreadyVerified: false };
}

export async function verifyEmail(raw: string) {
  const user = await consumeAuthToken(raw, 'EMAIL_VERIFICATION');
  await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
}

export async function getProfile(userId: string, organisationId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoPath: true, department: { select: { name: true } }, designation: { select: { name: true } } } },
    },
  });
  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    select: { id: true, name: true, logoPath: true, currency: true, timezone: true, fiscalYear: true, dateFormat: true, workingDays: true },
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    locale: user.locale,
    emailVerified: Boolean(user.emailVerifiedAt),
    lastLoginAt: user.lastLoginAt,
    role: { key: user.role.key, name: user.role.name, dataScope: user.role.dataScope },
    permissions: user.role.permissions.map((p) => p.permission.key).sort(),
    employee: user.employee,
    organisation: { ...org, hasLogo: Boolean(org.logoPath), logoPath: undefined },
    homeOrganisationId: user.organisationId,
  };
}
