import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { app, auth, login, resetDb, seedFixture, type Fixture } from './helpers';

const checkIn = (token: string) => request(app).post('/api/v1/me/attendance/check-in').set(auth(token));
const checkOut = (token: string) => request(app).post('/api/v1/me/attendance/check-out').set(auth(token));
const pending = (token: string) => request(app).get('/api/v1/attendance/approvals').set(auth(token));

describe('app check-in approval', () => {
  let fx: Fixture;
  let admin: string;
  let staff: string;
  let manager: string;
  let accountant: string;

  beforeAll(async () => {
    await resetDb();
    fx = await seedFixture();
    [admin, staff, manager, accountant] = await Promise.all([login('admin@test.local'), login('staff@test.local'), login('manager@test.local'), login('accountant@test.local')]);
  });
  beforeEach(() => prisma.attendance.deleteMany({ where: { organisationId: fx.orgId } }));
  afterAll(() => prisma.$disconnect());

  it('holds a self check-in as pending until HR reviews it', async () => {
    const res = await checkIn(staff);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'EMPLOYEE', approvalStatus: 'PENDING' });

    const list = await pending(admin);
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toEqual([res.body.data.id]);
    const count = await request(app).get('/api/v1/attendance/approvals/count').set(auth(admin));
    expect(count.body.data.pending).toBe(1);
  });

  it('only lets people with attendance.approve review check-ins', async () => {
    const { body } = await checkIn(staff);
    for (const token of [staff, manager, accountant]) {
      expect((await pending(token)).status).toBe(403);
      expect((await request(app).post('/api/v1/attendance/approvals/approve').set(auth(token)).send({ ids: [body.data.id] })).status).toBe(403);
    }
  });

  it('approves, notifies the employee and reopens review when they check out later', async () => {
    const { body } = await checkIn(staff);
    const res = await request(app).post('/api/v1/attendance/approvals/approve').set(auth(admin)).send({ ids: [body.data.id] });
    expect(res.status).toBe(200);
    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(row).toMatchObject({ approvalStatus: 'APPROVED', approvedById: fx.users.admin });
    expect(await prisma.notification.count({ where: { userId: fx.users.staff, type: 'ATTENDANCE_APPROVAL' } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: 'CHECK_IN_APPROVED', recordId: body.data.id } })).toBe(1);

    // Approving twice is refused rather than silently repeated.
    expect((await request(app).post('/api/v1/attendance/approvals/approve').set(auth(admin)).send({ ids: [body.data.id] })).status).toBe(409);

    const out = await checkOut(staff);
    expect(out.status).toBe(200);
    expect(out.body.data.approvalStatus).toBe('PENDING');
  });

  it('marks a rejected day absent and blocks further self check-in/out that day', async () => {
    const { body } = await checkIn(staff);
    const noReason = await request(app).post('/api/v1/attendance/approvals/reject').set(auth(admin)).send({ ids: [body.data.id] });
    expect(noReason.status).toBe(422);

    const res = await request(app).post('/api/v1/attendance/approvals/reject').set(auth(admin)).send({ ids: [body.data.id], reason: 'Not in the office' });
    expect(res.status).toBe(200);
    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(row).toMatchObject({ approvalStatus: 'REJECTED', status: 'ABSENT', rejectionReason: 'Not in the office', workMinutes: 0, overtimeMinutes: 0 });

    expect((await checkOut(staff)).body.code).toBe('CHECK_IN_REJECTED');
    expect((await checkIn(staff)).body.code).toBe('CHECK_IN_REJECTED');
  });

  it('clears the review when HR edits the record directly', async () => {
    const { body } = await checkIn(staff);
    const res = await request(app).put(`/api/v1/attendance/${body.data.id}`).set(auth(admin)).send({ checkIn: '09:00', checkOut: '17:00' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'ADMIN', approvalStatus: null });
  });

  it('does not let a reviewer approve their own check-in', async () => {
    // Give the employee role the approve permission to simulate an HR person who is also staff.
    const perm = await prisma.permission.findUniqueOrThrow({ where: { key: 'attendance.approve' } });
    await prisma.rolePermission.create({ data: { roleId: fx.roles.employee, permissionId: perm.id } });
    try {
      const reviewer = await login('staff@test.local');
      const { body } = await checkIn(reviewer);
      const res = await request(app).post('/api/v1/attendance/approvals/approve').set(auth(reviewer)).send({ ids: [body.data.id] });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SELF_REVIEW');
    } finally {
      await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: fx.roles.employee, permissionId: perm.id } } });
    }
  });
});
