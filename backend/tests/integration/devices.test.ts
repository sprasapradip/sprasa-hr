import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { parseDateOnly } from '../../src/utils/dates';
import { app, auth, login, resetDb, seedFixture, type Fixture } from './helpers';

const record = (employeeId: string, date: string) => prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date: parseDateOnly(date) } } });
const push = (sn: string, lines: string[]) => request(app).post(`/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=9999`).set('Content-Type', 'text/plain').send(lines.join('\n'));

describe('thumb machine integration', () => {
  let fx: Fixture;
  let admin: string;
  let staff: string;
  let deviceId = '';

  beforeAll(async () => {
    await resetDb();
    fx = await seedFixture();
    [admin, staff] = await Promise.all([login('admin@test.local'), login('staff@test.local')]);
    const shift = await prisma.shift.create({ data: { organisationId: fx.orgId, name: 'Day', startTime: '09:00', endTime: '17:00', gracePeriod: 15, breakDuration: 60, workingHours: 7 } });
    await prisma.employeeShift.create({ data: { employeeId: fx.staffEmpId, shiftId: shift.id, effectiveFrom: parseDateOnly('2024-01-01') } });
  });
  afterAll(() => prisma.$disconnect());

  it('rejects an unregistered machine but remembers it so HR can add it', async () => {
    const res = await request(app).get('/iclock/cdata?SN=NEWBOX123&options=all');
    expect(res.status).toBe(401);
    const list = await request(app).get('/api/v1/attendance/devices').set(auth(admin));
    expect(list.body.data.waiting.map((w: { serialNumber: string }) => w.serialNumber)).toContain('NEWBOX123');
  });

  it('registers a device and answers its handshake', async () => {
    const res = await request(app).post('/api/v1/attendance/devices').set(auth(admin)).send({ name: 'Front door', location: 'Head office', serialNumber: 'TESTSN001' });
    expect(res.status).toBe(201);
    deviceId = res.body.data.id;
    const hs = await request(app).get('/iclock/cdata?SN=TESTSN001&options=all');
    expect(hs.status).toBe(200);
    expect(hs.text).toContain('GET OPTION FROM: TESTSN001');
  });

  it('stores the machine number without leading zeros', async () => {
    const res = await request(app).put(`/api/v1/employees/${fx.staffEmpId}`).set(auth(admin)).send({ deviceUserId: '0007' });
    expect(res.status).toBe(200);
    expect((await prisma.employee.findUnique({ where: { id: fx.staffEmpId } }))?.deviceUserId).toBe('7');
    const clash = await request(app).put(`/api/v1/employees/${fx.managerEmpId}`).set(auth(admin)).send({ deviceUserId: '7' });
    expect(clash.status).toBe(409);
  });

  it('turns pushed scans into attendance measured against the shift', async () => {
    const res = await push('TESTSN001', ['7\t2026-09-28 09:20:00\t0\t1\t0\t0\t0', '7\t2026-09-28 13:01:00\t0\t1', '7\t2026-09-28 18:00:00\t1\t1', '99\t2026-09-28 09:00:00\t0\t1']);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK: 4');
    const r = await record(fx.staffEmpId, '2026-09-28');
    expect(r).toMatchObject({ checkIn: '09:20', checkOut: '18:00', status: 'LATE', lateMinutes: 20, overtimeMinutes: 60, source: 'DEVICE' });
  });

  it('ignores scans it has already seen', async () => {
    await push('TESTSN001', ['7\t2026-09-28 09:20:00\t0\t1']);
    expect(await prisma.attendancePunch.count({ where: { deviceUserId: '7' } })).toBe(3);
  });

  it('lists unknown machine numbers and back-fills attendance once linked', async () => {
    const list = await request(app).get('/api/v1/attendance/punches/unmatched').set(auth(admin));
    expect(list.body.data).toEqual([expect.objectContaining({ deviceUserId: '99', scans: 1 })]);
    const link = await request(app).post('/api/v1/attendance/punches/link').set(auth(admin)).send({ deviceUserId: '99', employeeId: fx.managerEmpId });
    expect(link.status).toBe(200);
    expect(link.body.data.daysUpdated).toBe(1);
    expect(await record(fx.managerEmpId, '2026-09-28')).toMatchObject({ checkIn: '09:00', checkOut: null, source: 'DEVICE' });
  });

  it('does not overwrite times HR entered by hand', async () => {
    await request(app).post('/api/v1/attendance').set(auth(admin)).send({ employeeId: fx.staffEmpId, date: '2026-09-29', checkIn: '09:00', checkOut: '17:00' });
    await push('TESTSN001', ['7\t2026-09-29 10:30:00\t0\t1']);
    expect(await record(fx.staffEmpId, '2026-09-29')).toMatchObject({ checkIn: '09:00', checkOut: '17:00', source: 'MANUAL' });
  });

  it('imports a log file exported from the machine', async () => {
    const csv = 'AC-No.,Name,Time\n0007,Sam,30/09/2026 08:58 AM\n0007,Sam,30/09/2026 05:05 PM\n0042,Nobody,30/09/2026 09:00 AM\n';
    const res = await request(app)
      .post('/api/v1/attendance/punches/import')
      .set(auth(admin))
      .field('deviceId', deviceId)
      .attach('file', Buffer.from(csv), { filename: 'export.csv', contentType: 'text/plain' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ received: 3, saved: 3, duplicates: 0, unmatched: ['42'], dateOrder: 'DMY' });
    expect(await record(fx.staffEmpId, '2026-09-30')).toMatchObject({ checkIn: '08:58', checkOut: '17:05', status: 'PRESENT' });
  });

  it('accepts scans from a sync agent holding the device key', async () => {
    const key = (await request(app).post(`/api/v1/attendance/devices/${deviceId}/agent-key`).set(auth(admin))).body.data.key as string;
    const bad = await request(app).post('/api/v1/device-agent/punches').set('Authorization', 'Device nope').send({ punches: [] });
    expect(bad.status).toBe(401);
    const res = await request(app)
      .post('/api/v1/device-agent/punches')
      .set('Authorization', `Device ${key}`)
      .send({ punches: [{ deviceUserId: 7, time: '2026-10-01 09:05:00' }, { deviceUserId: '7', time: '2026-10-01 17:10:00' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.saved).toBe(2);
    expect(await record(fx.staffEmpId, '2026-10-01')).toMatchObject({ checkIn: '09:05', checkOut: '17:10' });
  });

  it('shows employees their own scans, and keeps device setup away from them', async () => {
    const res = await request(app).get('/api/v1/me/attendance?year=2026&month=9').set(auth(staff));
    const day = res.body.data.days.find((d: { date: string }) => d.date === '2026-09-28');
    expect(day.scans).toEqual([
      { time: '09:20', device: 'Front door, Head office' },
      { time: '13:01', device: 'Front door, Head office' },
      { time: '18:00', device: 'Front door, Head office' },
    ]);
    expect(res.body.data.totals.workMinutes).toBeGreaterThan(0);
    expect((await request(app).get('/api/v1/attendance/devices').set(auth(staff))).status).toBe(403);
  });
});
