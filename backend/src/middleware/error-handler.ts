import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { AppError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found`, code: 'ROUTE_NOT_FOUND' });
};

/**
 * Converts every error into the standard `{ success: false, message, code }` shape.
 * Stack traces and internal details are only included outside production.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details: unknown;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Some fields are invalid';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      code = 'DUPLICATE';
      const target = (err.meta?.target as string[] | undefined)?.join(', ');
      message = target ? `A record with this ${target} already exists` : 'This record already exists';
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Record not found';
    } else if (err.code === 'P2003') {
      status = 409;
      code = 'FOREIGN_KEY';
      message = 'This record is linked to other data and cannot be changed that way';
    }
  } else if (err instanceof MulterError) {
    status = 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than the allowed size' : err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  }

  if (status >= 500) {
    logger.error({ err, reqId: req.id, userId: req.auth?.userId }, 'Unhandled error');
  }

  res.status(status).json({
    success: false,
    message,
    code,
    ...(details !== undefined ? { details } : {}),
    ...(!env.isProduction && status >= 500 ? { stack: String(err?.stack ?? err) } : {}),
  });
};
