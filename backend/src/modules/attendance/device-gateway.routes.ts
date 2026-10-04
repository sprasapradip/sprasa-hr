import express, { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { body } from '../../middleware/validate';
import { writeAudit } from '../../services/audit.service';
import * as devices from './devices.service';
import { normaliseDeviceUserId, parseAttLogLine, parseWallClock, type ParsedPunch } from './punch-file.parser';
import * as punches from './punches.service';

/** Machines poll every few seconds, so this is looser than the API limit but still bounded per IP. */
const deviceLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: false, legacyHeaders: false, message: 'Too many requests' });

const text = (res: Response, status: number, body: string) => res.status(status).type('text/plain').send(body);

/**
 * ZKTeco "push" protocol (ADMS / Cloud Server), also spoken by eSSL, Biomax and most ZK-based
 * thumb machines. In the device menu: Comm. → Cloud Server Setting → server address = this host,
 * port = the port this app is reachable on. The path is always /iclock/…, which is why this router
 * is mounted at the root, outside /api/v1.
 */
export const iclockRoutes = Router();
iclockRoutes.use(deviceLimiter);
// Devices send plain text (often with a wrong or missing content type), so read every body as text.
iclockRoutes.use(express.text({ type: () => true, limit: '2mb' }));

async function deviceFor(req: Request, res: Response) {
  const sn = typeof req.query.SN === 'string' ? req.query.SN.trim() : '';
  const device = sn ? await devices.bySerial(sn) : null;
  if (!device) {
    if (sn) devices.noteUnknownDevice(sn, req.ip ?? null);
    text(res, 401, 'Unknown device');
    return null;
  }
  await devices.touch(device.id);
  return device;
}

// Handshake: the device asks which options to use.
iclockRoutes.get('/cdata', async (req, res) => {
  const device = await deviceFor(req, res);
  if (!device) return;
  text(
    res,
    200,
    [
      `GET OPTION FROM: ${device.serialNumber}`,
      // "None" asks for every stored log on first contact. Repeats are dropped as duplicates.
      'ATTLOGStamp=None',
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=TransData AttLog',
      'Realtime=1',
      'Encrypt=None',
    ].join('\n'),
  );
});

// Uploads: ATTLOG holds the scans. User, photo and operation logs are acknowledged and ignored.
iclockRoutes.post('/cdata', async (req, res) => {
  const device = await deviceFor(req, res);
  if (!device) return;
  const raw = typeof req.body === 'string' ? req.body : '';
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (String(req.query.table ?? '').toUpperCase() !== 'ATTLOG') {
    text(res, 200, `OK: ${lines.length}`);
    return;
  }

  const parsed = lines.map(parseAttLogLine).filter((p): p is ParsedPunch => p !== null);
  if (parsed.length) {
    const result = await punches.ingest(device.organisationId, 'DEVICE_PUSH', parsed, device.id);
    logger.info({ device: device.name, ...result, unmatched: result.unmatched.length }, 'device scans received');
  }
  text(res, 200, `OK: ${lines.length}`);
});

// The device asks for commands to run. We never send any.
iclockRoutes.get('/getrequest', async (req, res) => {
  if (await deviceFor(req, res)) text(res, 200, 'OK');
});

iclockRoutes.post('/devicecmd', async (req, res) => {
  if (await deviceFor(req, res)) text(res, 200, 'OK');
});

/**
 * For machines that can't push (or sit on a LAN the server can't reach): a small agent on an office
 * PC reads the machine and posts scans here with "Authorization: Device <key>".
 */
export const agentRoutes = Router();
agentRoutes.use(deviceLimiter);

agentRoutes.get('/ping', async (req, res) => {
  const device = await devices.byAgentKey(req.header('authorization'));
  await devices.touch(device.id);
  res.json({ success: true, data: { device: device.name, lastPunch: device.lastPunchAt ? `${punches.punchDate(device.lastPunchAt)} ${punches.punchTime(device.lastPunchAt)}` : null } });
});

const agentBatch = z.object({
  punches: z
    .array(
      z.object({
        deviceUserId: z.union([z.string(), z.number()]).transform((v) => normaliseDeviceUserId(String(v))).pipe(z.string().min(1).max(30)),
        /** Device wall-clock time, "YYYY-MM-DD HH:mm:ss". */
        time: z.string().max(40),
        state: z.number().int().min(0).max(255).nullish(),
        verify: z.number().int().min(0).max(255).nullish(),
      }),
    )
    .max(5000),
});

agentRoutes.post('/punches', async (req, res) => {
  const device = await devices.byAgentKey(req.header('authorization'));
  await devices.touch(device.id);
  const input = body(req, agentBatch);
  const parsed: ParsedPunch[] = [];
  const rejected: string[] = [];
  for (const p of input.punches) {
    const punchedAt = parseWallClock(p.time);
    if (punchedAt) parsed.push({ deviceUserId: p.deviceUserId, punchedAt, deviceState: p.state ?? null, verifyMode: p.verify ?? null });
    else rejected.push(p.time);
  }
  const result = await punches.ingest(device.organisationId, 'DEVICE_AGENT', parsed, device.id);
  if (result.saved) await writeAudit({ organisationId: device.organisationId, ipAddress: req.ip ?? null, userAgent: req.header('user-agent')?.slice(0, 300) ?? null }, { action: 'DEVICE_AGENT_SYNC', module: 'attendance', recordId: device.id, newValue: { saved: result.saved, duplicates: result.duplicates } });
  res.json({ success: true, data: { ...result, rejected: rejected.slice(0, 20) } });
});
