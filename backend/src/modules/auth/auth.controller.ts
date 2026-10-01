import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { body, query } from '../../middleware/validate';
import { CSRF_COOKIE, REFRESH_COOKIE, setCsrfCookie } from '../../middleware/security';
import { actorFromRequest } from '../../services/audit.service';
import { paginated, paginationQuery, paging } from '../../utils/pagination';
import * as service from './auth.service';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema, verifyEmailSchema } from './auth.schemas';

const REFRESH_PATH = '/api/v1/auth';

function client(req: Request) {
  return { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 300) ?? null };
}

function setSession(res: Response, tokens: service.IssuedTokens) {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    path: REFRESH_PATH,
    expires: tokens.refreshExpiresAt,
  });
  setCsrfCookie(res);
}

function clearSession(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

export async function login(req: Request, res: Response) {
  const input = body(req, loginSchema);
  const tokens = await service.login(input.identifier, input.password, client(req));
  setSession(res, tokens);
  res.json({ success: true, data: { accessToken: tokens.accessToken, user: await service.getProfile(tokens.userId, tokens.organisationId) } });
}

export async function refresh(req: Request, res: Response) {
  try {
    const tokens = await service.refresh(req.cookies?.[REFRESH_COOKIE], client(req));
    setSession(res, tokens);
    res.json({ success: true, data: { accessToken: tokens.accessToken } });
  } catch (err) {
    clearSession(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await service.logout(req.cookies?.[REFRESH_COOKIE], actorFromRequest(req));
  clearSession(res);
  res.json({ success: true, message: 'Signed out' });
}

/** Issues a CSRF cookie for the SPA before the first cookie-authenticated call. */
export function csrf(_req: Request, res: Response) {
  const token = setCsrfCookie(res);
  res.json({ success: true, data: { csrfToken: token } });
}

export async function forgotPassword(req: Request, res: Response) {
  const input = body(req, forgotPasswordSchema);
  await service.forgotPassword(input.email);
  res.json({ success: true, message: 'If an account exists for that email, a reset link is on its way.' });
}

export async function resetPassword(req: Request, res: Response) {
  const input = body(req, resetPasswordSchema);
  await service.resetPassword(input.token, input.password, client(req));
  res.json({ success: true, message: 'Password updated. You can now sign in.' });
}

export async function changePassword(req: Request, res: Response) {
  const input = body(req, changePasswordSchema);
  const tokens = await service.changePassword(req.auth!.userId, input.currentPassword, input.newPassword, client(req));
  setSession(res, tokens);
  res.json({ success: true, message: 'Password changed', data: { accessToken: tokens.accessToken } });
}

export async function sendVerification(req: Request, res: Response) {
  const result = await service.sendVerificationEmail(req.auth!.userId);
  res.json({ success: true, message: result.alreadyVerified ? 'Email already verified' : 'Verification email sent' });
}

export async function verifyEmail(req: Request, res: Response) {
  const input = body(req, verifyEmailSchema);
  await service.verifyEmail(input.token);
  res.json({ success: true, message: 'Email verified' });
}

export async function me(req: Request, res: Response) {
  res.json({ success: true, data: await service.getProfile(req.auth!.userId, req.auth!.organisationId) });
}

export async function loginHistory(req: Request, res: Response) {
  const q = query(req, paginationQuery);
  const where = { userId: req.auth!.userId };
  const [rows, total] = await Promise.all([
    prisma.loginHistory.findMany({ where, orderBy: { createdAt: 'desc' }, ...paging(q), select: { id: true, success: true, reason: true, ipAddress: true, userAgent: true, createdAt: true } }),
    prisma.loginHistory.count({ where }),
  ]);
  res.json({ success: true, ...paginated(rows, total, q) });
}
