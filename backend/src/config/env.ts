import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: boolFromString,
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().default('Sprasa HR <no-reply@localhost>'),
  UPLOAD_DIR: z.string().default('../uploads'),
  MAX_FILE_SIZE: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  ALLOWED_UPLOAD_TYPES: z
    .string()
    .default('application/pdf,image/jpeg,image/png,image/webp'),
  BACKUP_DIR: z.string().default('../backups'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  BACKUP_CRON: z.string().default('0 2 * * *'),
  PG_DUMP_PATH: z.string().default('pg_dump'),
  ENABLE_JOBS: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Printed once at boot; values are never echoed, only the variable names.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const raw = parsed.data;
const backendRoot = path.resolve(__dirname, '../..');

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  uploadDir: path.resolve(backendRoot, raw.UPLOAD_DIR),
  backupDir: path.resolve(backendRoot, raw.BACKUP_DIR),
  allowedUploadTypes: raw.ALLOWED_UPLOAD_TYPES.split(',').map((s) => s.trim()).filter(Boolean),
  corsOrigins: [raw.FRONTEND_URL, ...raw.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)],
};

export type Env = typeof env;
