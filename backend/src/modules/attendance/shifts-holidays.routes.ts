import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { body, params, query } from '../../middleware/validate';
import { audit, diff } from '../../services/audit.service';
import { parseDateOnly } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { nullable, zDate, zTime } from '../../utils/validation';

const idParam = z.object({ id: z.string().uuid() });

// ── Shifts ───────────────────────────────────────────────────

const shiftSchema = z.object({
  name: z.string().trim().min(2).max(60),
  startTime: zTime,
  endTime: zTime,
  gracePeriod: z.coerce.number().int().min(0).max(240).default(15),
  breakDuration: z.coerce.number().int().min(0).max(480).default(60),
  workingHours: z.coerce.number().min(0.5).max(24),
  isFlexible: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const shiftRoutes = Router();

shiftRoutes.get('/', async (req, res) => {
  const rows = await prisma.shift.findMany({
    where: { organisationId: req.auth!.organisationId },
    orderBy: { startTime: 'asc' },
    include: { _count: { select: { employees: { where: { effectiveTo: null } } } } },
  });
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: req.auth!.organisationId }, select: { defaultShiftId: true } });
  res.json({ success: true, data: rows.map((s) => ({ ...s, isDefault: s.id === org.defaultShiftId })) });
});

shiftRoutes.post('/', requirePermission('shifts.manage'), async (req, res) => {
  const input = body(req, shiftSchema);
  const row = await prisma.shift.create({ data: { ...input, workingHours: new Prisma.Decimal(input.workingHours), organisationId: req.auth!.organisationId } });
  await audit(req, { action: 'SHIFT_CREATED', module: 'attendance', recordId: row.id, newValue: input });
  res.status(201).json({ success: true, data: row });
});

shiftRoutes.put('/:id', requirePermission('shifts.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, shiftSchema.partial());
  const before = await prisma.shift.findFirst({ where: { id, organisationId: req.auth!.organisationId } });
  if (!before) throw notFound('Shift');
  const data = { ...input, ...(input.workingHours !== undefined ? { workingHours: new Prisma.Decimal(input.workingHours) } : {}) };
  const row = await prisma.shift.update({ where: { id }, data });
  const d = diff(before as unknown as Record<string, unknown>, input);
  if (d.changed) await audit(req, { action: 'SHIFT_UPDATED', module: 'attendance', recordId: id, oldValue: d.oldValue, newValue: d.newValue });
  res.json({ success: true, data: row });
});

shiftRoutes.delete('/:id', requirePermission('shifts.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const shift = await prisma.shift.findFirst({ where: { id, organisationId: req.auth!.organisationId }, include: { _count: { select: { employees: true, attendance: true } } } });
  if (!shift) throw notFound('Shift');
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: req.auth!.organisationId }, select: { defaultShiftId: true } });
  if (org.defaultShiftId === id) throw badRequest('This is the default shift. Choose another default first.', 'DEFAULT_SHIFT');
  if (shift._count.employees || shift._count.attendance) throw conflict('This shift has been used. Mark it inactive instead of deleting it.', 'SHIFT_IN_USE');
  await prisma.shift.delete({ where: { id } });
  await audit(req, { action: 'SHIFT_DELETED', module: 'attendance', recordId: id, oldValue: { name: shift.name } });
  res.json({ success: true, message: 'Shift deleted' });
});

// ── Holidays ─────────────────────────────────────────────────

const holidaySchema = z.object({
  name: z.string().trim().min(2).max(100),
  date: zDate,
  type: z.enum(['PUBLIC', 'ORGANISATION', 'OPTIONAL']).default('PUBLIC'),
  description: nullable(z.string().trim().max(300)),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const holidayRoutes = Router();

holidayRoutes.get('/', async (req, res) => {
  const q = query(req, z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(), from: zDate.optional(), to: zDate.optional() }));
  const range = q.year
    ? { gte: new Date(Date.UTC(q.year, 0, 1)), lte: new Date(Date.UTC(q.year, 11, 31)) }
    : { ...(q.from ? { gte: parseDateOnly(q.from) } : {}), ...(q.to ? { lte: parseDateOnly(q.to) } : {}) };
  const rows = await prisma.holiday.findMany({ where: { organisationId: req.auth!.organisationId, date: range }, orderBy: { date: 'asc' } });
  res.json({ success: true, data: rows });
});

holidayRoutes.post('/', requirePermission('shifts.manage'), async (req, res) => {
  const input = body(req, holidaySchema);
  const row = await prisma.holiday.create({ data: { ...input, date: parseDateOnly(input.date), organisationId: req.auth!.organisationId } });
  await audit(req, { action: 'HOLIDAY_CREATED', module: 'attendance', recordId: row.id, newValue: input });
  res.status(201).json({ success: true, data: row });
});

holidayRoutes.put('/:id', requirePermission('shifts.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, holidaySchema.partial());
  const before = await prisma.holiday.findFirst({ where: { id, organisationId: req.auth!.organisationId } });
  if (!before) throw notFound('Holiday');
  const row = await prisma.holiday.update({ where: { id }, data: { ...input, ...(input.date ? { date: parseDateOnly(input.date) } : {}) } });
  await audit(req, { action: 'HOLIDAY_UPDATED', module: 'attendance', recordId: id, oldValue: { name: before.name, date: before.date }, newValue: input });
  res.json({ success: true, data: row });
});

holidayRoutes.delete('/:id', requirePermission('shifts.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const row = await prisma.holiday.findFirst({ where: { id, organisationId: req.auth!.organisationId } });
  if (!row) throw notFound('Holiday');
  await prisma.holiday.delete({ where: { id } });
  await audit(req, { action: 'HOLIDAY_DELETED', module: 'attendance', recordId: id, oldValue: { name: row.name, date: row.date } });
  res.json({ success: true, message: 'Holiday deleted' });
});
