import { execSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { hashPassword } from '../../src/modules/auth/auth.service';
import { bootstrapOrganisation } from '../../src/services/org-bootstrap.service';
import { parseDateOnly } from '../../src/utils/dates';
import { Prisma } from '@prisma/client';

export const app = createApp();
export const PASSWORD = 'TestPass123';

let migrated = false;

/** Apply migrations to the test database once, then wipe all data before each suite. */
export async function resetDb() {
  if (!migrated) {
    if (!process.env.DATABASE_URL?.includes('_test')) throw new Error('Refusing to run integration tests against a non-test database');
    execSync('npx prisma migrate deploy', { cwd: path.resolve(__dirname, '../..'), stdio: 'ignore', env: process.env });
    migrated = true;
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

export interface Fixture {
  orgId: string;
  roles: Record<string, string>;
  deptId: string;
  managerEmpId: string;
  staffEmpId: string;
  users: Record<'admin' | 'manager' | 'staff' | 'accountant', string>;
}

/** An organisation with an HR admin, a manager, one report and an accountant. */
export async function seedFixture(): Promise<Fixture> {
  const org = await prisma.organisation.create({ data: { name: 'Test Org' } });
  const { roles } = await bootstrapOrganisation(prisma, org.id);
  const dept = await prisma.department.create({ data: { organisationId: org.id, name: 'IT', code: 'IT' } });
  const manager = await prisma.employee.create({ data: { organisationId: org.id, employeeCode: 'E-001', firstName: 'Maya', lastName: 'Manager', joinDate: parseDateOnly('2024-01-01'), status: 'ACTIVE', departmentId: dept.id } });
  const staff = await prisma.employee.create({
    data: { organisationId: org.id, employeeCode: 'E-002', firstName: 'Sam', lastName: 'Staff', joinDate: parseDateOnly('2024-01-01'), status: 'ACTIVE', departmentId: dept.id, managerId: manager.id },
  });
  const hash = await hashPassword(PASSWORD);
  const mk = (email: string, role: string, employeeId?: string) =>
    prisma.user.create({ data: { organisationId: org.id, email, name: email.split('@')[0], passwordHash: hash, roleId: roles[role], employeeId } });
  const admin = await mk('admin@test.local', 'hr_admin');
  const mgr = await mk('manager@test.local', 'manager', manager.id);
  const st = await mk('staff@test.local', 'employee', staff.id);
  const acc = await mk('accountant@test.local', 'accountant');
  for (const e of [manager, staff]) {
    await prisma.employeeSalary.create({ data: { employeeId: e.id, basicSalary: new Prisma.Decimal(50000), effectiveFrom: parseDateOnly('2024-01-01') } });
  }
  return { orgId: org.id, roles, deptId: dept.id, managerEmpId: manager.id, staffEmpId: staff.id, users: { admin: admin.id, manager: mgr.id, staff: st.id, accountant: acc.id } };
}

export async function login(email: string, password = PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
