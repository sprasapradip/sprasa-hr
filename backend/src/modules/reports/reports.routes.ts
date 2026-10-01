import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { params, query } from '../../middleware/validate';
import { sendExport } from '../../services/export.service';
import { formatDateOnly } from '../../utils/dates';
import { notFound } from '../../utils/errors';
import { zDate } from '../../utils/validation';
import { REPORTS, resolveFilters } from './reports.definitions';

const filterQuery = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
  date: zDate.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  departmentId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid().optional(),
  format: z.enum(['csv', 'xlsx', 'pdf']).optional(),
});

export const reportRoutes = Router();

/** Report catalogue, filtered to what the caller may run. */
reportRoutes.get('/', (req, res) => {
  const available = REPORTS.filter((r) => req.auth!.permissions.has(r.permission)).map(({ run: _run, ...r }) => r);
  res.json({ success: true, data: available });
});

reportRoutes.get('/:category', (req, res) => {
  const { category } = params(req, z.object({ category: z.enum(['employees', 'attendance', 'leave', 'payroll']) }));
  const available = REPORTS.filter((r) => r.category === category && req.auth!.permissions.has(r.permission)).map(({ run: _run, ...r }) => r);
  res.json({ success: true, data: available });
});

reportRoutes.get('/:category/:key', async (req, res) => {
  const p = params(req, z.object({ category: z.string(), key: z.string() }));
  const def = REPORTS.find((r) => r.category === p.category && r.key === p.key);
  // Unknown and forbidden reports look the same to the caller.
  if (!def || !req.auth!.permissions.has(def.permission)) throw notFound('Report');
  const q = query(req, filterQuery);
  const filters = resolveFilters(q);
  const result = await def.run(req.auth!, filters);

  if (q.format) {
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: req.auth!.organisationId }, select: { name: true } });
    const range = def.filters.includes('period') || def.filters.includes('year')
      ? def.filters.includes('period') ? `${filters.year}-${String(filters.month).padStart(2, '0')}` : String(filters.year)
      : def.filters.includes('date') ? formatDateOnly(filters.from) : `${formatDateOnly(filters.from)} to ${formatDateOnly(filters.to)}`;
    return sendExport(res, q.format, {
      title: def.title,
      subtitle: `${org.name} · ${range}`,
      filename: `${def.key}-${range.replace(/\s+/g, '')}`,
      columns: result.columns,
      rows: result.rows,
      totals: result.totals,
    });
  }
  res.json({
    success: true,
    data: { report: { key: def.key, title: def.title, description: def.description, category: def.category }, filters: { ...filters, from: formatDateOnly(filters.from), to: formatDateOnly(filters.to) }, ...result },
  });
});

