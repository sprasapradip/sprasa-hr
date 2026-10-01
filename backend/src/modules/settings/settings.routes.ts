import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { ZodTypeAny } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { body } from '../../middleware/validate';
import { audit } from '../../services/audit.service';
import { backupStatus, runBackup } from '../../services/backup.service';
import { verifySmtp } from '../../services/email.service';
import {
  emailSettingsSchema,
  getOrgSettings,
  leaveSettingsSchema,
  notificationSettingsSchema,
  payrollSettingsSchema,
} from '../../services/settings.service';
import { get as getOrganisation } from '../organisations/organisations.service';

export const settingsRoutes = Router();

settingsRoutes.get('/', requirePermission('settings.view', 'settings.manage'), async (req, res) => {
  const orgId = req.auth!.organisationId;
  const [s, organisation] = await Promise.all([getOrgSettings(orgId), getOrganisation(orgId)]);
  res.json({ success: true, data: { organisation, leave: s.leave, payroll: s.payroll, notifications: s.notifications, email: s.email } });
});

type Column = 'leaveSettings' | 'payrollSettings' | 'notificationSettings' | 'emailSettings';

/** One handler for each JSON settings group: validate with the full schema, store, audit. */
function settingsUpdater(column: Column, schema: ZodTypeAny) {
  return async (req: Request, res: Response) => {
    const orgId = req.auth!.organisationId;
    const before = await prisma.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { [column]: true } as Record<Column, true> });
    const merged = { ...((before as Record<Column, object>)[column] ?? {}), ...(req.body ?? {}) };
    const value = body({ body: merged } as Request, schema);
    await prisma.organisation.update({ where: { id: orgId }, data: { [column]: value as Prisma.InputJsonValue } });
    await audit(req, { action: 'SETTINGS_CHANGED', module: 'settings', recordId: orgId, oldValue: { [column]: (before as Record<Column, object>)[column] }, newValue: { [column]: value } });
    res.json({ success: true, data: value, message: 'Settings saved' });
  };
}

settingsRoutes.put('/leave', requirePermission('settings.manage'), settingsUpdater('leaveSettings', leaveSettingsSchema));
settingsRoutes.put('/payroll', requirePermission('settings.manage'), settingsUpdater('payrollSettings', payrollSettingsSchema));
settingsRoutes.put('/notifications', requirePermission('settings.manage'), settingsUpdater('notificationSettings', notificationSettingsSchema));
settingsRoutes.put('/email', requirePermission('settings.manage'), settingsUpdater('emailSettings', emailSettingsSchema));

settingsRoutes.get('/system-status', requirePermission('settings.view', 'settings.manage'), async (_req, res) => {
  const [smtp, db] = await Promise.all([
    verifySmtp(),
    prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`.then(() => true).catch(() => false),
  ]);
  res.json({ success: true, data: { smtp, database: { ok: db } } });
});

settingsRoutes.get('/backups', requirePermission('backups.manage'), async (_req, res) => {
  res.json({ success: true, data: await backupStatus() });
});

settingsRoutes.post('/backups/run', requirePermission('backups.manage'), async (req, res) => {
  const run = await runBackup('manual');
  await audit(req, { action: 'BACKUP_RUN', module: 'settings', recordId: run.id, newValue: { status: run.status } });
  res.json({ success: run.status === 'SUCCESS', data: { ...run, fileSize: run.fileSize ? Number(run.fileSize) : null }, message: run.status === 'SUCCESS' ? 'Backup completed' : `Backup failed: ${run.error}` });
});
