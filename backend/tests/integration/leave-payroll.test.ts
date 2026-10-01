import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { toNumber } from '../../src/utils/money';
import { app, auth, login, resetDb, seedFixture, type Fixture } from './helpers';

/** Next Monday at least a week away, so requests are never in the past. */
function futureMonday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}
const plus = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('leave workflow', () => {
  let fx: Fixture;
  let admin: string;
  let manager: string;
  let staff: string;
  let annualId: string;

  beforeAll(async () => {
    await resetDb();
    fx = await seedFixture();
    [admin, manager, staff] = await Promise.all([login('admin@test.local'), login('manager@test.local'), login('staff@test.local')]);
    annualId = (await prisma.leaveType.findFirstOrThrow({ where: { organisationId: fx.orgId, code: 'AL' } })).id;
  });
  afterAll(() => prisma.$disconnect());

  const balance = async () => {
    const year = Number(futureMonday().slice(0, 4));
    return prisma.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId: fx.staffEmpId, leaveTypeId: annualId, year } } });
  };

  let requestId = '';
  const start = futureMonday();

  it('applies, reserving pending days and skipping the weekend', async () => {
    // Monday to next Monday covers one Saturday (the default weekend): 7 working days.
    const res = await request(app).post('/api/v1/me/leave/requests').set(auth(staff)).field('leaveTypeId', annualId).field('startDate', start).field('endDate', plus(start, 7)).field('reason', 'Family trip');
    expect(res.status).toBe(201);
    requestId = res.body.data.id;
    expect(res.body.data.totalDays).toBe(7);
    expect(toNumber((await balance()).pending)).toBe(7);
  });

  it('prevents overlapping requests', async () => {
    const res = await request(app).post('/api/v1/me/leave/requests').set(auth(staff)).field('leaveTypeId', annualId).field('startDate', plus(start, 2)).field('endDate', plus(start, 2)).field('reason', 'Overlap');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LEAVE_OVERLAP');
  });

  it('rejects requests beyond the balance', async () => {
    const res = await request(app).post('/api/v1/me/leave/requests').set(auth(staff)).field('leaveTypeId', annualId).field('startDate', plus(start, 30)).field('endDate', plus(start, 60)).field('reason', 'Too long');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('does not let employees approve their own leave', async () => {
    const res = await request(app).post(`/api/v1/leave/requests/${requestId}/approve`).set(auth(staff)).send({});
    expect(res.status).toBe(403);
  });

  it('supervisor approval moves annual leave to HR, then HR approval updates the balance', async () => {
    const sup = await request(app).post(`/api/v1/leave/requests/${requestId}/approve`).set(auth(manager)).send({});
    expect(sup.status).toBe(200);
    expect(sup.body.data.status).toBe('SUPERVISOR_APPROVED');

    const again = await request(app).post(`/api/v1/leave/requests/${requestId}/approve`).set(auth(manager)).send({});
    expect(again.status).toBe(403);

    const hr = await request(app).post(`/api/v1/leave/requests/${requestId}/approve`).set(auth(admin)).send({});
    expect(hr.body.data.status).toBe('APPROVED');
    const b = await balance();
    expect(toNumber(b.pending)).toBe(0);
    expect(toNumber(b.used)).toBe(7);
    expect(await prisma.auditLog.count({ where: { recordId: requestId, action: 'LEAVE_APPROVED' } })).toBe(1);
  });

  it('cancelling approved future leave returns the days', async () => {
    const res = await request(app).post(`/api/v1/leave/requests/${requestId}/cancel`).set(auth(staff)).send({});
    expect(res.body.data.status).toBe('CANCELLED');
    expect(toNumber((await balance()).used)).toBe(0);
  });

  it('rejection releases pending days', async () => {
    const r = await request(app).post('/api/v1/me/leave/requests').set(auth(staff)).field('leaveTypeId', annualId).field('startDate', plus(start, 14)).field('endDate', plus(start, 14)).field('reason', 'Errand');
    const rej = await request(app).post(`/api/v1/leave/requests/${r.body.data.id}/reject`).set(auth(manager)).send({ reason: 'Busy week' });
    expect(rej.body.data.status).toBe('REJECTED');
    expect(toNumber((await balance()).pending)).toBe(0);
  });
});

describe('payroll workflow', () => {
  let fx: Fixture;
  let accountant: string;
  let staff: string;
  let payrollId = '';

  beforeAll(async () => {
    await resetDb();
    fx = await seedFixture();
    [accountant, staff] = await Promise.all([login('accountant@test.local'), login('staff@test.local')]);
  });
  afterAll(() => prisma.$disconnect());

  it('generates a draft with one item per salaried employee', async () => {
    const res = await request(app).post('/api/v1/payroll/generate').set(auth(accountant)).send({ year: 2026, month: 5 });
    expect(res.status).toBe(201);
    payrollId = res.body.data.id;
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.employeeCount).toBe(2);
    const item = await prisma.payrollItem.findFirstOrThrow({ where: { payrollId, employeeId: fx.staffEmpId } });
    // Tax comes only from the configured slabs; with the sample slabs, net < gross.
    expect(toNumber(item.grossSalary)).toBe(50000);
    expect(toNumber(item.netSalary)).toBeLessThan(50000);
  });

  it('refuses a second payroll for the same month', async () => {
    const res = await request(app).post('/api/v1/payroll/generate').set(auth(accountant)).send({ year: 2026, month: 5 });
    expect(res.status).toBe(409);
  });

  it('must be reviewed before approval, and approval issues payslips and locks it', async () => {
    expect((await request(app).post(`/api/v1/payroll/${payrollId}/approve`).set(auth(accountant))).status).toBe(400);
    expect((await request(app).post(`/api/v1/payroll/${payrollId}/review`).set(auth(accountant))).body.data.status).toBe('REVIEWED');
    const approved = await request(app).post(`/api/v1/payroll/${payrollId}/approve`).set(auth(accountant));
    expect(approved.body.data.status).toBe('APPROVED');
    expect(approved.body.data.locked).toBe(true);
    expect(await prisma.payslip.count({ where: { payrollItem: { payrollId } } })).toBe(2);
    expect((await request(app).post(`/api/v1/payroll/${payrollId}/recalculate`).set(auth(accountant))).status).toBe(400);
  });

  it('lets an employee download only their own payslip', async () => {
    const mine = await request(app).get('/api/v1/me/payslips').set(auth(staff));
    expect(mine.body.data).toHaveLength(1);
    const pdf = await request(app).get(`/api/v1/payslips/${mine.body.data[0].id}/pdf`).set(auth(staff));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const other = await prisma.payslip.findFirstOrThrow({ where: { employeeId: fx.managerEmpId } });
    expect((await request(app).get(`/api/v1/payslips/${other.id}`).set(auth(staff))).status).toBe(404);
  });

  it('exports the register in all formats', async () => {
    for (const format of ['csv', 'xlsx', 'pdf']) {
      const res = await request(app).get(`/api/v1/payroll/${payrollId}/register?format=${format}`).set(auth(accountant));
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain(`.${format}`);
    }
  });

  it('cancelling frees the month for a new run', async () => {
    const res = await request(app).post(`/api/v1/payroll/${payrollId}/cancel`).set(auth(accountant)).send({ reason: 'Test re-run' });
    expect(res.body.data.status).toBe('CANCELLED');
    const rerun = await request(app).post('/api/v1/payroll/generate').set(auth(accountant)).send({ year: 2026, month: 5 });
    expect(rerun.status).toBe(201);
  });
});
