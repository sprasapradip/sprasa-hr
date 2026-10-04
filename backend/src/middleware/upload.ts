import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest } from '../utils/errors';

const EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt', '.dat', '.csv'],
  'application/vnd.ms-excel': ['.csv', '.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

/** Leading bytes for binary formats. Text formats (CSV) are checked for NUL bytes instead. */
const SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
};

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SPREADSHEET_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Thumb-machine logs: the USB .dat/.txt download, or a CSV/Excel report from the vendor software. */
export const PUNCH_LOG_TYPES = [...SPREADSHEET_TYPES, 'text/plain'];

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

interface UploadOptions {
  /** Sub-directory inside UPLOAD_DIR. */
  folder: string;
  allowedTypes?: string[];
  maxSize?: number;
  /** Keep the file in memory instead of on disk (used for imports). */
  memory?: boolean;
}

export function uploadSingle(field: string, opts: UploadOptions): RequestHandler {
  const allowed = opts.allowedTypes ?? env.allowedUploadTypes;
  const dest = path.join(env.uploadDir, opts.folder);

  const storage = opts.memory
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, cb) => {
          ensureDir(dest);
          cb(null, dest);
        },
        // Never trust the original filename: store under a random id with a whitelisted extension.
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${crypto.randomUUID()}${ext}`);
        },
      });

  const upload = multer({
    storage,
    limits: { fileSize: opts.maxSize ?? env.MAX_FILE_SIZE, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowed.includes(file.mimetype) || !(EXTENSIONS[file.mimetype] ?? []).includes(ext)) {
        cb(badRequest(`File type not allowed. Allowed: ${allowed.join(', ')}`, 'FILE_TYPE_NOT_ALLOWED'));
        return;
      }
      cb(null, true);
    },
  }).single(field);

  return (req, res, next) => {
    upload(req, res, (err?: unknown) => {
      if (err) return next(err);
      const file = req.file;
      if (!file) return next();
      try {
        verifySignature(file);
        next();
      } catch (e) {
        if (file.path) fs.rm(file.path, { force: true }, () => undefined);
        next(e);
      }
    });
  };
}

function verifySignature(file: Express.Multer.File) {
  const head = file.buffer
    ? file.buffer.subarray(0, 512)
    : (() => {
        const fd = fs.openSync(file.path, 'r');
        const buf = Buffer.alloc(512);
        const read = fs.readSync(fd, buf, 0, 512, 0);
        fs.closeSync(fd);
        return buf.subarray(0, read);
      })();

  const signatures = SIGNATURES[file.mimetype];
  if (signatures) {
    const ok = signatures.some((sig) => sig.every((byte, i) => head[i] === byte));
    if (!ok) throw badRequest('File content does not match its type', 'FILE_CONTENT_MISMATCH');
  } else if (head.includes(0x00)) {
    throw badRequest('File content does not match its type', 'FILE_CONTENT_MISMATCH');
  }
}

/** Resolve a stored relative path and make sure it cannot escape UPLOAD_DIR. */
export function resolveUploadPath(relative: string): string {
  const full = path.resolve(env.uploadDir, relative);
  if (!full.startsWith(path.resolve(env.uploadDir) + path.sep)) throw badRequest('Invalid file path');
  return full;
}

export function relativeUploadPath(absolute: string): string {
  return path.relative(env.uploadDir, absolute).split(path.sep).join('/');
}
