import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../lib/prisma';

const SENSITIVE_KEYS = new Set(['passwordHash', 'password', 'twoFactorSecret', 'tokenHash']);

function sanitise(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (SENSITIVE_KEYS.has(key)) return undefined;
      if (typeof v === 'bigint') return v.toString();
      return v;
    }),
  );
}

export interface AuditEntry {
  action: string;
  module: string;
  recordId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface AuditActor {
  organisationId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function actorFromRequest(req: Request): AuditActor {
  return {
    organisationId: req.auth?.organisationId ?? null,
    userId: req.auth?.userId ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  };
}

/** Write an audit record. Pass a transaction client to make it part of the same unit of work. */
export async function writeAudit(actor: AuditActor, entry: AuditEntry, db: Db = prisma) {
  await db.auditLog.create({
    data: {
      organisationId: actor.organisationId ?? null,
      userId: actor.userId ?? null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      action: entry.action,
      module: entry.module,
      recordId: entry.recordId ?? null,
      oldValue: sanitise(entry.oldValue),
      newValue: sanitise(entry.newValue),
    },
  });
}

export const audit = (req: Request, entry: AuditEntry, db: Db = prisma) => writeAudit(actorFromRequest(req), entry, db);

/** Only the fields that changed, for compact audit diffs. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) {
      oldValue[key] = before[key] ?? null;
      newValue[key] = after[key] ?? null;
    }
  }
  return { oldValue, newValue, changed: Object.keys(newValue).length > 0 };
}
