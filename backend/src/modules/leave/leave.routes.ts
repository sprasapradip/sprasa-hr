import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { body, params, query } from '../../middleware/validate';
import { actorFromRequest, audit, diff } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { ensureLeaveBalancesForOrganisation } from '../../services/leave-balance.service';
import { conflict, notFound } from '../../utils/errors';
import { zDate } from '../../utils/validation';
import { adjustBalanceSchema, applyLeaveSchema, balanceQuery, decisionSchema, leaveTypeSchema, listLeaveQuery, rejectSchema, updateLeaveSchema } from './leave.schemas';
import * as service from './leave.service';

const idParam = z.object({ id: z.string().uuid() });
export const leaveAttachmentUpload = uploadSingle('attachment', { folder: 'leave' });

export const leaveRoutes = Router();

// ── Leave types ──────────────────────────────────────────────

leaveRoutes.get('/types', async (req, res) => {
  const { active } = query(req, z.object({ active: z.enum(['0', '1']).optional() }));
  res.json({ success: true, data: await service.listTypes(req.auth!.organisationId, active === '1') });
});

const toTypeData = (input: Partial<z.infer<typeof leaveTypeSchema>>) => ({
  ...input,
  ...(input.annualDays !== undefined ? { annualDays: new Prisma.Decimal(input.annualDays) } : {}),
  ...(input.maxCarryForward !== undefined ? { maxCarryForward: new Prisma.Decimal(input.maxCarryForward) } : {}),
});

leaveRoutes.post('/types', requirePermission('leave.manage'), async (req, res) => {
  const input = body(req, leaveTypeSchema);
  const row = await prisma.leaveType.create({
    data: { ...input, annualDays: new Prisma.Decimal(input.annualDays), maxCarryForward: new Prisma.Decimal(input.maxCarryForward), organisationId: req.auth!.organisationId },
  });
  await audit(req, { action: 'LEAVE_TYPE_CREATED', module: 'leave', recordId: row.id, newValue: input });
  res.status(201).json({ success: true, data: row });
});

leaveRoutes.put('/types/:id', requirePermission('leave.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, leaveTypeSchema.partial());
  const before = await prisma.leaveType.findFirst({ where: { id, organisationId: req.auth!.organisationId } });
  if (!before) throw notFound('Leave type');
  const row = await prisma.leaveType.update({ where: { id }, data: toTypeData(input) });
  const d = diff(before as unknown as Record<string, unknown>, input);
  if (d.changed) await audit(req, { action: 'LEAVE_TYPE_UPDATED', module: 'leave', recordId: id, oldValue: d.oldValue, newValue: d.newValue });
  res.json({ success: true, data: row });
});

leaveRoutes.delete('/types/:id', requirePermission('leave.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const type = await prisma.leaveType.findFirst({ where: { id, organisationId: req.auth!.organisationId }, include: { _count: { select: { requests: true } } } });
  if (!type) throw notFound('Leave type');
  if (type._count.requests) throw conflict('This leave type has requests. Mark it inactive instead.', 'LEAVE_TYPE_IN_USE');
  await prisma.leaveType.delete({ where: { id } });
  await audit(req, { action: 'LEAVE_TYPE_DELETED', module: 'leave', recordId: id, oldValue: { name: type.name } });
  res.json({ success: true, message: 'Leave type deleted' });
});

// ── Requests ─────────────────────────────────────────────────

leaveRoutes.get('/requests', requirePermission('leave.view'), async (req, res) => {
  const q = query(req, listLeaveQuery);
  if (q.format) {
    const all = await service.listRequests(req.auth!, { ...q, page: 1, limit: 10_000 });
    return sendExport(res, q.format, {
      title: 'Leave requests',
      subtitle: [q.from, q.to].filter(Boolean).join(' to ') || undefined,
      filename: 'leave-requests',
      columns: [
        { key: 'code', header: 'Employee ID' },
        { key: 'employeeName', header: 'Employee', width: 2 },
        { key: 'type', header: 'Leave Type', width: 1.5 },
        { key: 'startDate', header: 'From', format: 'date' },
        { key: 'endDate', header: 'To', format: 'date' },
        { key: 'totalDays', header: 'Days', format: 'number' },
        { key: 'status', header: 'Status' },
        { key: 'reason', header: 'Reason', width: 2.5 },
      ],
      rows: all.data.map((r) => ({ ...r, code: r.employee.employeeCode, type: r.leaveType.name })),
    });
  }
  res.json({ success: true, ...(await service.listRequests(req.auth!, q)) });
});

leaveRoutes.get('/requests/:id', async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.getRequest(req.auth!, id) });
});

leaveRoutes.get('/requests/:id/attachment', async (req, res) => {
  const { id } = params(req, idParam);
  const file = await service.attachmentFile(req.auth!, id);
  res.setHeader('Cache-Control', 'private, no-store');
  res.download(file.path, file.name);
});

/** Apply: employees for themselves; HR (leave.manage) may pass employeeId. */
leaveRoutes.post('/requests', leaveAttachmentUpload, async (req, res) => {
  const input = body(req, applyLeaveSchema);
  res.status(201).json({ success: true, data: await service.apply(req.auth!, input, req.file, actorFromRequest(req)) });
});

leaveRoutes.put('/requests/:id', async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.update(req.auth!, id, body(req, updateLeaveSchema), actorFromRequest(req)) });
});

leaveRoutes.post('/requests/:id/approve', requirePermission('leave.approve', 'leave.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const { remarks } = body(req, decisionSchema);
  res.json({ success: true, data: await service.approve(req.auth!, id, remarks, actorFromRequest(req)) });
});

leaveRoutes.post('/requests/:id/reject', requirePermission('leave.approve', 'leave.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const { reason } = body(req, rejectSchema);
  res.json({ success: true, data: await service.reject(req.auth!, id, reason, actorFromRequest(req)) });
});

leaveRoutes.post('/requests/:id/cancel', async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.cancel(req.auth!, id, actorFromRequest(req)) });
});

// ── Balances, calendar, dashboard ────────────────────────────

leaveRoutes.get('/balances', requirePermission('leave.view'), async (req, res) => {
  res.json({ success: true, data: await service.balances(req.auth!, query(req, balanceQuery)) });
});

leaveRoutes.post('/balances/:id/adjust', requirePermission('leave.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, adjustBalanceSchema);
  res.json({ success: true, data: await service.adjustBalance(req.auth!, id, input.delta, input.reason, actorFromRequest(req)) });
});

leaveRoutes.post('/balances/initialise', requirePermission('leave.manage'), async (req, res) => {
  const { year } = body(req, z.object({ year: z.coerce.number().int().min(2000).max(2100) }));
  const count = await ensureLeaveBalancesForOrganisation(req.auth!.organisationId, year);
  await audit(req, { action: 'LEAVE_BALANCES_INITIALISED', module: 'leave', newValue: { year, employees: count } });
  res.json({ success: true, message: `Balances ready for ${count} employee(s) for ${year}` });
});

leaveRoutes.get('/calendar', requirePermission('leave.view'), async (req, res) => {
  const q = query(req, z.object({ from: zDate, to: zDate, departmentId: z.string().uuid().optional() }));
  res.json({ success: true, data: await service.calendar(req.auth!, q.from, q.to, q.departmentId) });
});

leaveRoutes.get('/dashboard', requirePermission('leave.view'), async (req, res) => {
  res.json({ success: true, data: await service.dashboard(req.auth!) });
});
