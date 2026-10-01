import crypto from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { safeEqual } from '../utils/crypto';
import { forbidden } from '../utils/errors';

export const CSRF_COOKIE = 'sprasa_csrf';
export const REFRESH_COOKIE = 'sprasa_rt';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

const limiterBody = (message: string) => ({ success: false, message, code: 'RATE_LIMITED' });

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isTest ? 10_000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limiterBody('Too many requests. Please slow down.'),
});

/** Brute-force protection on login and password endpoints (per IP). Accounts also lock after repeated failures. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isTest ? 10_000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limiterBody('Too many attempts. Please wait 15 minutes and try again.'),
});

/** Issue a readable CSRF cookie. The SPA echoes it in X-CSRF-Token (double-submit pattern). */
export function setCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(24).toString('base64url');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: 'strict',
    path: '/',
  });
  return token;
}

/**
 * Only endpoints that authenticate with the refresh cookie need CSRF protection;
 * everything else uses a bearer token that a cross-site form cannot send.
 */
export const verifyCsrf: RequestHandler = (req, _res, next) => {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.header('x-csrf-token');
  if (!cookie || !header || !safeEqual(String(cookie), header)) {
    throw forbidden('Security token missing or invalid. Refresh the page and try again.', 'CSRF_INVALID');
  }
  next();
};
