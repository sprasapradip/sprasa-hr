import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { body, params, query } from '../../middleware/validate';
import { audit, diff } from '../../services/audit.service';
import { conflict, notFound } from '../../utils/errors';
import { nullable } from '../../utils/validation';
import { EXIT_STATUSES } from '../employees/employees.schemas';

const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']).optional(), search: z.string().max(100).optional(), departmentId: z.string().uuid().optional() });

const departmentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,12}$/, '2–12 letters, numbers, dashes'),
  description: nullable(z.string().trim().max(500)),
  headId: nullable(z.string().uuid()),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const designationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  departmentId: nullable(z.string().uuid()),
  description: nullable(z.string().trim().max(500)),
  level: z.coerce.number().int().min(1).max(20).default(5),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const activeEmployees = { where: { deletedAt: null, status: { notIn: [...EXIT_STATUSES] } } };

// ── Departments ──────────────────────────────────────────────

export const departmentRoutes = Router();

departmentRoutes.get('/', async (req: Request, res: Response) => {
  const q = query(req, listQuery);
  const rows = await prisma.department.findMany({
    where: {
      organisationId: req.auth!.organisationId,
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { name: 'asc' },
    include: { head: { select: { id: true, firstName: true, lastName: true, employeeCode: true } }, _count: { select: { employees: activeEmployees, designations: { where: { deletedAt: null } } } } },
  });
  res.json({ success: true, data: rows });
});

async function assertHead(orgId: string, headId?: string | null) {
  if (headId && !(await prisma.employee.findFirst({ where: { id: headId, organisationId: orgId, deletedAt: null } }))) throw notFound('Employee');
}

departmentRoutes.post('/', requirePermission('departments.manage'), async (req, res) => {
  const input = body(req, departmentSchema);
  await assertHead(req.auth!.organisationId, input.headId);
  const dept = await prisma.department.create({ data: { ...input, organisationId: req.auth!.organisationId } });
  await audit(req, { action: 'DEPARTMENT_CREATED', module: 'departments', recordId: dept.id, newValue: input });
  res.status(201).json({ success: true, data: dept });
});

departmentRoutes.put('/:id', requirePermission('departments.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, departmentSchema.partial());
  const before = await prisma.department.findFirst({ where: { id, organisationId: req.auth!.organisationId, deletedAt: null } });
  if (!before) throw notFound('Department');
  await assertHead(req.auth!.organisationId, input.headId);
  const dept = await prisma.department.update({ where: { id }, data: input });
  const d = diff(before as unknown as Record<string, unknown>, input);
  if (d.changed) await audit(req, { action: 'DEPARTMENT_UPDATED', module: 'departments', recordId: id, oldValue: d.oldValue, newValue: d.newValue });
  res.json({ success: true, data: dept });
});

departmentRoutes.delete('/:id', requirePermission('departments.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const dept = await prisma.department.findFirst({ where: { id, organisationId: req.auth!.organisationId, deletedAt: null }, include: { _count: { select: { employees: activeEmployees } } } });
  if (!dept) throw notFound('Department');
  if (dept._count.employees > 0) throw conflict(`Move the ${dept._count.employees} employee(s) in this department first`, 'DEPARTMENT_IN_USE');
  // Soft delete and release the code so it can be reused.
  await prisma.department.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE', code: `${dept.code}~${id.slice(0, 8)}` } });
  await audit(req, { action: 'DEPARTMENT_DELETED', module: 'departments', recordId: id, oldValue: { name: dept.name, code: dept.code } });
  res.json({ success: true, message: 'Department deleted' });
});

// ── Designations ─────────────────────────────────────────────

export const designationRoutes = Router();

designationRoutes.get('/', async (req, res) => {
  const q = query(req, listQuery);
  const rows = await prisma.designation.findMany({
    where: {
      organisationId: req.auth!.organisationId,
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    include: { department: { select: { id: true, name: true } }, _count: { select: { employees: activeEmployees } } },
  });
  res.json({ success: true, data: rows });
});

async function assertDepartment(orgId: string, departmentId?: string | null) {
  if (departmentId && !(await prisma.department.findFirst({ where: { id: departmentId, organisationId: orgId, deletedAt: null } }))) throw notFound('Department');
}

designationRoutes.post('/', requirePermission('departments.manage'), async (req, res) => {
  const input = body(req, designationSchema);
  await assertDepartment(req.auth!.organisationId, input.departmentId);
  const row = await prisma.designation.create({ data: { ...input, organisationId: req.auth!.organisationId } });
  await audit(req, { action: 'DESIGNATION_CREATED', module: 'designations', recordId: row.id, newValue: input });
  res.status(201).json({ success: true, data: row });
});

designationRoutes.put('/:id', requirePermission('departments.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const input = body(req, designationSchema.partial());
  const before = await prisma.designation.findFirst({ where: { id, organisationId: req.auth!.organisationId, deletedAt: null } });
  if (!before) throw notFound('Designation');
  await assertDepartment(req.auth!.organisationId, input.departmentId);
  const row = await prisma.designation.update({ where: { id }, data: input });
  const d = diff(before as unknown as Record<string, unknown>, input);
  if (d.changed) await audit(req, { action: 'DESIGNATION_UPDATED', module: 'designations', recordId: id, oldValue: d.oldValue, newValue: d.newValue });
  res.json({ success: true, data: row });
});

designationRoutes.delete('/:id', requirePermission('departments.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  const row = await prisma.designation.findFirst({ where: { id, organisationId: req.auth!.organisationId, deletedAt: null }, include: { _count: { select: { employees: activeEmployees } } } });
  if (!row) throw notFound('Designation');
  if (row._count.employees > 0) throw conflict(`${row._count.employees} employee(s) still hold this designation`, 'DESIGNATION_IN_USE');
  await prisma.designation.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE', name: `${row.name}~${id.slice(0, 8)}` } });
  await audit(req, { action: 'DESIGNATION_DELETED', module: 'designations', recordId: id, oldValue: { name: row.name } });
  res.json({ success: true, message: 'Designation deleted' });
});
