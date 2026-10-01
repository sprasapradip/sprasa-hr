import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { IMAGE_TYPES, relativeUploadPath, SPREADSHEET_TYPES, uploadSingle } from '../../middleware/upload';
import { body, params, query } from '../../middleware/validate';
import { assertEmployeeAccess, isSelf } from '../../services/access.service';
import { actorFromRequest } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { badRequest, forbidden } from '../../utils/errors';
import * as importer from './employees.import';
import { assignShiftSchema, createEmployeeSchema, createSalarySchema, importCommitSchema, listEmployeesQuery, updateEmployeeSchema } from './employees.schemas';
import * as service from './employees.service';

const idParam = z.object({ id: z.string().uuid() });

export const photoUpload = uploadSingle('photo', { folder: 'photos', allowedTypes: IMAGE_TYPES, maxSize: 2 * 1024 * 1024 });
export const importUpload = uploadSingle('file', { folder: 'imports', allowedTypes: SPREADSHEET_TYPES, maxSize: 5 * 1024 * 1024, memory: true });

export async function list(req: Request, res: Response) {
  const q = query(req, listEmployeesQuery);
  if (q.format) {
    const all = await service.list(req.auth!, { ...q, page: 1, limit: 10_000 });
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: req.auth!.organisationId }, select: { name: true } });
    return sendExport(res, q.format, {
      title: 'Employee list',
      subtitle: `${org.name} · ${all.pagination.total} employees`,
      filename: `employees-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { key: 'employeeCode', header: 'Employee ID' },
        { key: 'fullName', header: 'Name', width: 2 },
        { key: 'department', header: 'Department', width: 1.5 },
        { key: 'designation', header: 'Designation', width: 1.5 },
        { key: 'email', header: 'Email', width: 2 },
        { key: 'phone', header: 'Phone' },
        { key: 'joinDate', header: 'Join Date', format: 'date' },
        { key: 'employmentType', header: 'Type' },
        { key: 'status', header: 'Status' },
      ],
      rows: all.data.map((e) => ({ ...e, department: e.department?.name, designation: e.designation?.name })),
    });
  }
  res.json({ success: true, ...(await service.list(req.auth!, q)) });
}

export async function options(req: Request, res: Response) {
  const { search } = query(req, z.object({ search: z.string().max(100).optional() }));
  res.json({ success: true, data: await service.options(req.auth!, search) });
}

export async function nextCode(req: Request, res: Response) {
  res.json({ success: true, data: { employeeCode: await service.nextEmployeeCode(req.auth!.organisationId) } });
}

export async function get(req: Request, res: Response) {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.getById(req.auth!, id) });
}

export async function create(req: Request, res: Response) {
  const input = body(req, createEmployeeSchema);
  if (input.basicSalary !== undefined && !req.auth!.permissions.has('salary.manage')) {
    throw forbidden('You cannot set salaries', 'SALARY_FORBIDDEN');
  }
  res.status(201).json({ success: true, data: await service.create(req.auth!, input, actorFromRequest(req)) });
}

export async function update(req: Request, res: Response) {
  const { id } = params(req, idParam);
  const input = body(req, updateEmployeeSchema);
  res.json({ success: true, data: await service.update(req.auth!, id, input, actorFromRequest(req)) });
}

export async function remove(req: Request, res: Response) {
  const { id } = params(req, idParam);
  await service.remove(req.auth!, id, actorFromRequest(req));
  res.json({ success: true, message: 'Employee deleted' });
}

export async function history(req: Request, res: Response) {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.history(req.auth!, id) });
}

export async function activity(req: Request, res: Response) {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.activity(req.auth!, id) });
}

export async function orgChart(req: Request, res: Response) {
  res.json({ success: true, data: await service.orgChart(req.auth!) });
}

export async function uploadPhoto(req: Request, res: Response) {
  const { id } = params(req, idParam);
  if (!req.file) throw badRequest('Choose an image to upload', 'FILE_REQUIRED');
  await service.setPhoto(req.auth!, id, relativeUploadPath(req.file.path), actorFromRequest(req));
  res.json({ success: true, message: 'Photo updated' });
}

export async function photo(req: Request, res: Response) {
  const { id } = params(req, idParam);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(await service.photoFile(req.auth!, id));
}

export async function salaryHistory(req: Request, res: Response) {
  const { id } = params(req, idParam);
  if (!req.auth!.permissions.has('salary.view') && !isSelf(req.auth!, id)) throw forbidden();
  res.json({ success: true, data: await service.salaryHistory(req.auth!, id) });
}

export async function createSalary(req: Request, res: Response) {
  const { id } = params(req, idParam);
  const input = body(req, createSalarySchema);
  res.status(201).json({ success: true, data: await service.createSalary(req.auth!, id, input, actorFromRequest(req)) });
}

export async function shiftHistory(req: Request, res: Response) {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.shiftHistory(req.auth!, id) });
}

export async function assignShift(req: Request, res: Response) {
  const { id } = params(req, idParam);
  await assertEmployeeAccess(req.auth!, id);
  await service.assignShift(req.auth!, id, body(req, assignShiftSchema), actorFromRequest(req));
  res.json({ success: true, message: 'Shift assigned' });
}

export async function importTemplate(req: Request, res: Response) {
  const { format } = query(req, z.object({ format: z.enum(['csv', 'xlsx']).default('xlsx') }));
  const buffer = await importer.template(format);
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="employee-import-template.${format}"`);
  res.send(buffer);
}

export async function importPreview(req: Request, res: Response) {
  if (!req.file) throw badRequest('Choose a CSV or Excel file', 'FILE_REQUIRED');
  const rows = await importer.parseFile(req.file.buffer, req.file.originalname);
  if (!rows.length) throw badRequest('The file has no data rows', 'EMPTY_FILE');
  if (rows.length > 2000) throw badRequest('Import at most 2,000 rows at a time', 'TOO_MANY_ROWS');
  res.json({ success: true, data: await importer.validateRows(req.auth!, rows) });
}

export async function importCommit(req: Request, res: Response) {
  const { rows } = body(req, importCommitSchema);
  const clean = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])));
  res.json({ success: true, data: await importer.commit(req.auth!, clean, actorFromRequest(req)) });
}
