import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { PUNCH_LOG_TYPES, uploadSingle } from '../../middleware/upload';
import { body, params, query } from '../../middleware/validate';
import { actorFromRequest, audit } from '../../services/audit.service';
import { badRequest, notFound } from '../../utils/errors';
import { prisma } from '../../lib/prisma';
import * as devices from './devices.service';
import { parsePunchFile } from './punch-file.parser';
import * as punches from './punches.service';

const idParam = z.object({ id: z.string().uuid() });

export const deviceRoutes = Router();
deviceRoutes.use(requirePermission('attendance.manage'));

deviceRoutes.get('/', async (req, res) => {
  res.json({ success: true, data: await devices.list(req.auth!) });
});

deviceRoutes.post('/', async (req, res) => {
  res.status(201).json({ success: true, data: await devices.create(req.auth!, body(req, devices.createDeviceSchema), actorFromRequest(req)) });
});

deviceRoutes.put('/:id', async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await devices.update(req.auth!, id, body(req, devices.updateDeviceSchema), actorFromRequest(req)) });
});

deviceRoutes.delete('/:id', async (req, res) => {
  const { id } = params(req, idParam);
  await devices.remove(req.auth!, id, actorFromRequest(req));
  res.json({ success: true, message: 'Device removed' });
});

deviceRoutes.post('/:id/agent-key', async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await devices.issueAgentKey(req.auth!, id, actorFromRequest(req)) });
});

export const punchRoutes = Router();
punchRoutes.use(requirePermission('attendance.manage'));

punchRoutes.get('/', async (req, res) => {
  res.json({ success: true, ...(await punches.list(req.auth!, query(req, punches.listPunchesQuery))) });
});

punchRoutes.get('/unmatched', async (req, res) => {
  res.json({ success: true, data: await punches.unmatched(req.auth!) });
});

punchRoutes.post('/link', async (req, res) => {
  const result = await punches.link(req.auth!, body(req, punches.linkSchema), actorFromRequest(req));
  res.json({ success: true, data: result, message: `Linked to ${result.name}` });
});

punchRoutes.post('/reprocess', async (req, res) => {
  res.json({ success: true, data: await punches.reprocess(req.auth!, body(req, punches.reprocessSchema), actorFromRequest(req)) });
});

const importFields = z.object({ deviceId: z.string().uuid().optional(), dateOrder: z.enum(['DMY', 'MDY']).optional() });

punchRoutes.post('/import', uploadSingle('file', { folder: 'imports', memory: true, allowedTypes: PUNCH_LOG_TYPES, maxSize: 10 * 1024 * 1024 }), async (req, res) => {
  if (!req.file) throw badRequest('Choose the log file exported from the machine', 'FILE_REQUIRED');
  const fields = body(req, importFields);
  if (fields.deviceId && !(await prisma.attendanceDevice.findFirst({ where: { id: fields.deviceId, organisationId: req.auth!.organisationId } }))) throw notFound('Device');

  const parsed = await parsePunchFile(req.file.buffer, req.file.originalname, fields.dateOrder);
  if (parsed.punches.length === 0) {
    throw badRequest(parsed.skipped.length ? `No scans could be read. First problem, line ${parsed.skipped[0].line}: ${parsed.skipped[0].reason}` : 'The file is empty', 'NOTHING_TO_IMPORT');
  }
  const result = await punches.ingest(req.auth!.organisationId, 'FILE_IMPORT', parsed.punches, fields.deviceId ?? null);
  await audit(req, { action: 'PUNCH_LOG_IMPORTED', module: 'attendance', newValue: { file: req.file.originalname, ...result, unmatched: result.unmatched.length } });
  res.json({ success: true, data: { ...result, skipped: parsed.skipped.slice(0, 50), skippedCount: parsed.skipped.length, dateOrder: parsed.dateOrder } });
});
