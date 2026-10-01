import pino from 'pino';
import { env } from '../config/env';

/** Structured logger. Sensitive fields are redacted wherever they appear. */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.newPassword',
      '*.currentPassword',
    ],
    censor: '[redacted]',
  },
  transport:
    !env.isProduction && !env.isTest
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});
