import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { params, query } from '../../middleware/validate';
import { sendExport } from '../../services/export.service';
import { addDays, parseDateOnly } from '../../utils/dates';
import { notFound } from '../../utils/errors';
import { paginated, paginationQuery, paging } from '../../utils/pagination';
import { zDate } from '../../utils/validation';

const listQuery = paginationQuery.extend({
  module: z.string().max(40).optional(),
  action: z.string().max(60).optional(),
  userId: z.string().uuid().optional(),
  recordId: z.string().max(60).optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  format: z.enum(['csv', 'xlsx', 'pdf']).optional(),
});

/** Audit logs are read-only through the API: there are no create/update/delete routes. */
export const auditRoutes = Router();

auditRoutes.use(requirePermission('audit.view'));

function where(orgId: string, q: z.infer<typeof listQuery>): Prisma.AuditLogWhereInput {
  return {
    organisationId: orgId,
    ...(q.module ? { module: q.module } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.recordId ? { recordId: q.recordId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: parseDateOnly(q.from) } : {}), ...(q.to ? { lt: addDays(parseDateOnly(q.to), 1) } : {}) } } : {}),
    ...(q.search ? { OR: [{ action: { contains: q.search, mode: 'insensitive' } }, { user: { name: { contains: q.search, mode: 'insensitive' } } }, { ipAddress: { contains: q.search } }] } : {}),
  };
}

auditRoutes.get('/', async (req, res) => {
  const q = query(req, listQuery);
  const w = where(req.auth!.organisationId, q);
  if (q.format) {
    const rows = await prisma.auditLog.findMany({ where: w, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 20_000 });
    return sendExport(res, q.format, {
      title: 'Audit log',
      filename: 'audit-log',
      columns: [
        { key: 'createdAt', header: 'Time', width: 1.5 },
        { key: 'user', header: 'User', width: 1.5 },
        { key: 'action', header: 'Action', width: 1.5 },
        { key: 'module', header: 'Module' },
        { key: 'recordId', header: 'Record', width: 1.5 },
        { key: 'ipAddress', header: 'IP' },
      ],
      rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString().replace('T', ' ').slice(0, 19), user: r.user?.name ?? 'System' })),
    });
  }
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where: w, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, ...paging(q) }),
    prisma.auditLog.count({ where: w }),
  ]);
  res.json({ success: true, ...paginated(rows, total, q) });
});

auditRoutes.get('/facets', async (req, res) => {
  const [modules, actions] = await Promise.all([
    prisma.auditLog.findMany({ where: { organisationId: req.auth!.organisationId }, distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } }),
    prisma.auditLog.findMany({ where: { organisationId: req.auth!.organisationId }, distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);
  res.json({ success: true, data: { modules: modules.map((m) => m.module), actions: actions.map((a) => a.action) } });
});

auditRoutes.get('/:id', async (req, res) => {
  const { id } = params(req, z.object({ id: z.string().uuid() }));
  const row = await prisma.auditLog.findFirst({ where: { id, organisationId: req.auth!.organisationId }, include: { user: { select: { id: true, name: true, email: true } } } });
  if (!row) throw notFound('Audit entry');
  res.json({ success: true, data: row });
});
