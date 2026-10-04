import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { diff, writeAudit, type AuditActor } from '../../services/audit.service';
import type { AuthContext } from '../../types/express';
import { randomToken, sha256 } from '../../utils/crypto';
import { addDays, todayIn } from '../../utils/dates';
import { notFound, unauthorized } from '../../utils/errors';
import { nullable } from '../../utils/validation';
import { punchDate, punchTime } from './punches.service';

const deviceFields = {
  name: z.string().trim().min(2).max(80),
  location: nullable(z.string().trim().max(120)),
  serialNumber: nullable(z.string().trim().regex(/^[A-Za-z0-9_-]{4,40}$/, 'Letters, numbers and dashes only, as shown on the device')),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
};
export const createDeviceSchema = z.object(deviceFields);
export const updateDeviceSchema = z.object(deviceFields).partial();

/**
 * Serial numbers that tried to push logs but aren't registered. Kept in memory for a day so HR can
 * add the device with one click instead of copying the serial from the machine's menu.
 */
const waiting = new Map<string, { serialNumber: string; ip: string | null; lastSeen: Date }>();

export function noteUnknownDevice(serialNumber: string, ip: string | null) {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(serialNumber)) return;
  if (waiting.size > 50 && !waiting.has(serialNumber)) return;
  waiting.set(serialNumber, { serialNumber, ip, lastSeen: new Date() });
}

function waitingDevices() {
  const cutoff = Date.now() - 86_400_000;
  for (const [sn, w] of waiting) if (w.lastSeen.getTime() < cutoff) waiting.delete(sn);
  return [...waiting.values()];
}

export async function list(auth: AuthContext) {
  const today = todayIn();
  const [devices, todayCounts] = await Promise.all([
    prisma.attendanceDevice.findMany({ where: { organisationId: auth.organisationId }, orderBy: { name: 'asc' }, include: { _count: { select: { punches: true } } } }),
    prisma.attendancePunch.groupBy({ by: ['deviceId'], where: { organisationId: auth.organisationId, punchedAt: { gte: today, lt: addDays(today, 1) } }, _count: true }),
  ]);
  const scansToday = new Map(todayCounts.map((c) => [c.deviceId, c._count]));
  const registered = new Set(devices.map((d) => d.serialNumber));
  return {
    devices: devices.map(({ agentKeyHash, _count, lastPunchAt, ...d }) => ({
      ...d,
      hasAgentKey: Boolean(agentKeyHash),
      lastPunch: lastPunchAt ? `${punchDate(lastPunchAt)} ${punchTime(lastPunchAt).slice(0, 5)}` : null,
      totalScans: _count.punches,
      scansToday: scansToday.get(d.id) ?? 0,
    })),
    waiting: waitingDevices().filter((w) => !registered.has(w.serialNumber)),
  };
}

async function owned(auth: AuthContext, id: string) {
  const device = await prisma.attendanceDevice.findFirst({ where: { id, organisationId: auth.organisationId } });
  if (!device) throw notFound('Device');
  return device;
}

export async function create(auth: AuthContext, input: z.infer<typeof createDeviceSchema>, actor: AuditActor) {
  const device = await prisma.attendanceDevice.create({ data: { ...input, organisationId: auth.organisationId } });
  if (device.serialNumber) waiting.delete(device.serialNumber);
  await writeAudit(actor, { action: 'DEVICE_CREATED', module: 'attendance', recordId: device.id, newValue: input });
  return device;
}

export async function update(auth: AuthContext, id: string, input: z.infer<typeof updateDeviceSchema>, actor: AuditActor) {
  const before = await owned(auth, id);
  const device = await prisma.attendanceDevice.update({ where: { id }, data: input });
  const d = diff(before as unknown as Record<string, unknown>, input);
  if (d.changed) await writeAudit(actor, { action: 'DEVICE_UPDATED', module: 'attendance', recordId: id, oldValue: d.oldValue, newValue: d.newValue });
  return device;
}

/** Scans already received are kept; they just lose the link to the device. */
export async function remove(auth: AuthContext, id: string, actor: AuditActor) {
  const device = await owned(auth, id);
  await prisma.attendanceDevice.delete({ where: { id } });
  await writeAudit(actor, { action: 'DEVICE_DELETED', module: 'attendance', recordId: id, oldValue: { name: device.name, serialNumber: device.serialNumber } });
}

/** New key for the sync agent. Shown once; any older key stops working. */
export async function issueAgentKey(auth: AuthContext, id: string, actor: AuditActor) {
  await owned(auth, id);
  const key = `shr_${randomToken(24)}`;
  await prisma.attendanceDevice.update({ where: { id }, data: { agentKeyHash: sha256(key) } });
  await writeAudit(actor, { action: 'DEVICE_AGENT_KEY_ISSUED', module: 'attendance', recordId: id });
  return { key };
}

// ── Lookups used by the device-facing routes ────────────────

export async function bySerial(serialNumber: string) {
  const device = await prisma.attendanceDevice.findUnique({ where: { serialNumber } });
  return device?.status === 'ACTIVE' ? device : null;
}

export async function byAgentKey(header: string | undefined) {
  const key = /^Device\s+(\S+)$/i.exec(header ?? '')?.[1];
  if (!key) throw unauthorized('Send the agent key as "Authorization: Device <key>"');
  const device = await prisma.attendanceDevice.findUnique({ where: { agentKeyHash: sha256(key) } });
  if (!device || device.status !== 'ACTIVE') throw unauthorized('Unknown or disabled device key');
  return device;
}

export const touch = (id: string) => prisma.attendanceDevice.update({ where: { id }, data: { lastSeenAt: new Date() } });
