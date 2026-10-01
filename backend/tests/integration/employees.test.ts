import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { app, auth, login, resetDb, seedFixture, type Fixture } from './helpers';

describe('employees and access control', () => {
  let fx: Fixture;
  let admin: string;
  let manager: string;
  let staff: string;

  beforeAll(async () => {
    await resetDb();
    fx = await seedFixture();
    [admin, manager, staff] = await Promise.all([login('admin@test.local'), login('manager@test.local'), login('staff@test.local')]);
  });
  afterAll(() => prisma.$disconnect());

  let createdId = '';

  it('creates an employee with history, salary, leave balances and an audit record in one go', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set(auth(admin))
      .send({ employeeCode: 'e-100', firstName: 'Nisha', lastName: 'Rai', joinDate: '2026-03-01', departmentId: fx.deptId, basicSalary: 40000, phone: '9841000000', status: 'ACTIVE' });
    expect(res.status).toBe(201);
    createdId = res.body.data.id;
    expect(res.body.data.employeeCode).toBe('E-100');
    const [history, salary, balances, audit] = await Promise.all([
      prisma.employmentHistory.count({ where: { employeeId: createdId } }),
      prisma.employeeSalary.count({ where: { employeeId: createdId } }),
      prisma.leaveBalance.count({ where: { employeeId: createdId } }),
      prisma.auditLog.count({ where: { recordId: createdId, action: 'EMPLOYEE_CREATED' } }),
    ]);
    expect(history).toBe(1);
    expect(salary).toBe(1);
    expect(balances).toBeGreaterThan(0);
    expect(audit).toBe(1);
  });

  it('rejects duplicate employee IDs and invalid input', async () => {
    const dup = await request(app).post('/api/v1/employees').set(auth(admin)).send({ employeeCode: 'E-100', firstName: 'A', lastName: 'B', joinDate: '2026-03-01' });
    expect(dup.status).toBe(409);
    const bad = await request(app).post('/api/v1/employees').set(auth(admin)).send({ employeeCode: 'E-101', firstName: '', lastName: 'B', joinDate: 'yesterday', panNumber: '12' });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });

  it('ignores fields that are not in the schema (mass assignment)', async () => {
    const res = await request(app).put(`/api/v1/employees/${createdId}`).set(auth(admin)).send({ organisationId: '00000000-0000-0000-0000-000000000000', notes: 'ok' });
    expect(res.status).toBe(200);
    const e = await prisma.employee.findUniqueOrThrow({ where: { id: createdId } });
    expect(e.organisationId).toBe(fx.orgId);
  });

  it('lists and searches with server-side pagination', async () => {
    const res = await request(app).get('/api/v1/employees?search=nisha&limit=10').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, total: 1 });
  });

  it('limits managers to their team', async () => {
    const res = await request(app).get('/api/v1/employees').set(auth(manager));
    const ids = res.body.data.map((e: { id: string }) => e.id);
    expect(ids).toContain(fx.staffEmpId);
    expect(ids).not.toContain(createdId);
    const other = await request(app).get(`/api/v1/employees/${createdId}`).set(auth(manager));
    expect(other.status).toBe(404);
  });

  it('hides sensitive fields from managers', async () => {
    await prisma.employee.update({ where: { id: fx.staffEmpId }, data: { panNumber: '123456789', bankAccountNumber: '999' } });
    const res = await request(app).get(`/api/v1/employees/${fx.staffEmpId}`).set(auth(manager));
    expect(res.body.data.panNumber).toBeNull();
    expect(res.body.data.bankAccountNumber).toBeNull();
  });

  it('blocks employees from the admin API but allows self-service', async () => {
    expect((await request(app).get('/api/v1/employees').set(auth(staff))).status).toBe(403);
    expect((await request(app).get(`/api/v1/employees/${fx.managerEmpId}`).set(auth(staff))).status).toBe(403);
    const me = await request(app).get('/api/v1/me/profile').set(auth(staff));
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(fx.staffEmpId);
    expect(me.body.data.panNumber).toBe('123456789');
  });

  it('keeps salary history instead of overwriting', async () => {
    const back = await request(app).post(`/api/v1/employees/${createdId}/salaries`).set(auth(admin)).send({ basicSalary: 45000, effectiveFrom: '2026-02-01' });
    expect(back.status).toBe(400);
    const ok = await request(app).post(`/api/v1/employees/${createdId}/salaries`).set(auth(admin)).send({ basicSalary: 45000, effectiveFrom: '2026-07-17', reason: 'Increment' });
    expect(ok.status).toBe(201);
    const rows = await prisma.employeeSalary.findMany({ where: { employeeId: createdId }, orderBy: { effectiveFrom: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0].effectiveTo?.toISOString().slice(0, 10)).toBe('2026-07-16');
  });

  it('prevents reporting loops', async () => {
    const res = await request(app).put(`/api/v1/employees/${fx.managerEmpId}`).set(auth(admin)).send({ managerId: fx.staffEmpId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REPORTING_CYCLE');
  });

  it('soft-deletes and disables the linked login', async () => {
    const res = await request(app).delete(`/api/v1/employees/${fx.staffEmpId}`).set(auth(admin));
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'staff@test.local' } });
    expect(user.status).toBe('DISABLED');
    expect((await request(app).get('/api/v1/me/profile').set(auth(staff))).status).toBe(401);
  });
});
