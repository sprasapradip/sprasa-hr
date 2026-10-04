import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma';
import { writeAudit, type AuditActor } from '../../services/audit.service';
import { ensureLeaveBalances } from '../../services/leave-balance.service';
import { toCsv, toXlsx } from '../../services/export.service';
import type { AuthContext } from '../../types/express';
import { parseDateOnly, todayIn } from '../../utils/dates';
import { unprocessable } from '../../utils/errors';
import { dec } from '../../utils/money';
import { normaliseDeviceUserId } from '../attendance/punch-file.parser';
import { syncEmployeePunches } from '../attendance/punches.service';
import { createEmployeeSchema } from './employees.schemas';

/** Columns in the import template, in order. */
export const IMPORT_COLUMNS = [
  { key: 'employeeCode', header: 'Employee ID', required: true, example: 'EMP-0101' },
  { key: 'firstName', header: 'First Name', required: true, example: 'Sita' },
  { key: 'middleName', header: 'Middle Name', required: false, example: '' },
  { key: 'lastName', header: 'Last Name', required: true, example: 'Sharma' },
  { key: 'gender', header: 'Gender (MALE/FEMALE/OTHER)', required: false, example: 'FEMALE' },
  { key: 'dateOfBirth', header: 'Date of Birth (YYYY-MM-DD)', required: false, example: '1995-04-12' },
  { key: 'phone', header: 'Phone', required: false, example: '9812345678' },
  { key: 'email', header: 'Email', required: false, example: 'sita.sharma@example.com' },
  { key: 'joinDate', header: 'Join Date (YYYY-MM-DD)', required: true, example: '2026-01-15' },
  { key: 'employmentType', header: 'Employment Type', required: false, example: 'FULL_TIME' },
  { key: 'status', header: 'Status', required: false, example: 'ACTIVE' },
  { key: 'department', header: 'Department (code or name)', required: false, example: 'FIN' },
  { key: 'designation', header: 'Designation', required: false, example: 'Accountant' },
  { key: 'managerCode', header: 'Manager Employee ID', required: false, example: 'EMP-0001' },
  { key: 'branch', header: 'Branch', required: false, example: 'Kathmandu' },
  { key: 'workLocation', header: 'Work Location', required: false, example: 'Head Office' },
  { key: 'deviceUserId', header: 'Thumb Machine ID', required: false, example: '101' },
  { key: 'basicSalary', header: 'Basic Salary (NPR)', required: false, example: '45000' },
  { key: 'bankName', header: 'Bank Name', required: false, example: 'Nabil Bank' },
  { key: 'bankAccountNumber', header: 'Bank Account Number', required: false, example: '0010012345678' },
  { key: 'panNumber', header: 'PAN (9 digits)', required: false, example: '' },
  { key: 'citizenshipNumber', header: 'Citizenship Number', required: false, example: '' },
  { key: 'address', header: 'Address', required: false, example: 'Baneshwor' },
  { key: 'province', header: 'Province', required: false, example: 'Bagmati' },
  { key: 'district', header: 'District', required: false, example: 'Kathmandu' },
  { key: 'municipality', header: 'Municipality', required: false, example: 'Kathmandu Metropolitan City' },
  { key: 'emergencyContactName', header: 'Emergency Contact', required: false, example: '' },
  { key: 'emergencyContactPhone', header: 'Emergency Contact Phone', required: false, example: '' },
  { key: 'taxCategory', header: 'Tax Category (INDIVIDUAL/COUPLE)', required: false, example: 'INDIVIDUAL' },
] as const;

const headerToKey = new Map<string, string>(IMPORT_COLUMNS.flatMap((c) => [[c.header.toLowerCase(), c.key], [c.key.toLowerCase(), c.key]]));

export async function template(format: 'csv' | 'xlsx') {
  const table = {
    title: 'Employee import',
    filename: 'sprasa-hr-employee-import-template',
    columns: IMPORT_COLUMNS.map((c) => ({ key: c.key, header: c.header })),
    rows: [Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.example]))],
  };
  return format === 'csv' ? toCsv(table) : toXlsx(table);
}

function normaliseRow(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [h, v] of Object.entries(raw)) {
    const key = headerToKey.get(h.trim().toLowerCase());
    if (!key) continue;
    let value: string;
    if (v instanceof Date) value = v.toISOString().slice(0, 10);
    else if (v && typeof v === 'object' && 'text' in v) value = String((v as { text: unknown }).text);
    else if (v && typeof v === 'object' && 'result' in v) value = String((v as { result: unknown }).result);
    else value = v === null || v === undefined ? '' : String(v);
    out[key] = value.trim();
  }
  return out;
}

export async function parseFile(buffer: Buffer, filename: string): Promise<Record<string, string>[]> {
  if (filename.toLowerCase().endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    // Find the header row (first row containing "Employee ID" or employeeCode).
    let headerRowNo = 1;
    ws.eachRow((row, n) => {
      if (headerRowNo === 1 && (row.values as unknown[]).some((v) => typeof v === 'string' && headerToKey.get(v.trim().toLowerCase()) === 'employeeCode')) headerRowNo = n;
    });
    const headers = (ws.getRow(headerRowNo).values as unknown[]).map((v) => (v ? String(v) : ''));
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, n) => {
      if (n <= headerRowNo) return;
      const raw: Record<string, unknown> = {};
      (row.values as unknown[]).forEach((v, i) => {
        if (headers[i]) raw[headers[i]] = v;
      });
      const r = normaliseRow(raw);
      if (Object.values(r).some(Boolean)) rows.push(r);
    });
    return rows;
  }
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const records = parse(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  return records.map(normaliseRow).filter((r) => Object.values(r).some(Boolean));
}

export interface RowResult {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

/** Validate every row against the same rules as the create form, plus lookups and duplicates. */
export async function validateRows(auth: AuthContext, rows: Record<string, string>[]): Promise<{ results: RowResult[]; valid: number; invalid: number }> {
  const orgId = auth.organisationId;
  const [departments, designations, employees] = await Promise.all([
    prisma.department.findMany({ where: { organisationId: orgId, deletedAt: null }, select: { id: true, code: true, name: true } }),
    prisma.designation.findMany({ where: { organisationId: orgId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: { organisationId: orgId }, select: { id: true, employeeCode: true, email: true, deviceUserId: true } }),
  ]);
  const deptBy = new Map<string, string>();
  departments.forEach((d) => {
    deptBy.set(d.code.toLowerCase(), d.id);
    deptBy.set(d.name.toLowerCase(), d.id);
  });
  const desigBy = new Map(designations.map((d) => [d.name.toLowerCase(), d.id]));
  const existingCodes = new Map(employees.map((e) => [e.employeeCode.toUpperCase(), e.id]));
  const fileCodes = new Map<string, number>();
  const usedMachineIds = new Set(employees.map((e) => e.deviceUserId).filter(Boolean));
  const fileMachineIds = new Map<string, number>();
  for (const r of rows) {
    const code = (r.employeeCode ?? '').toUpperCase();
    if (code) fileCodes.set(code, (fileCodes.get(code) ?? 0) + 1);
    const machineId = r.deviceUserId ? normaliseDeviceUserId(r.deviceUserId) : '';
    if (machineId) fileMachineIds.set(machineId, (fileMachineIds.get(machineId) ?? 0) + 1);
  }

  const results: RowResult[] = rows.map((data, i) => {
    const errors: string[] = [];
    for (const c of IMPORT_COLUMNS) if (c.required && !data[c.key]) errors.push(`${c.header} is required`);

    const code = (data.employeeCode ?? '').toUpperCase();
    if (code && existingCodes.has(code)) errors.push(`Employee ID ${code} already exists`);
    if (code && (fileCodes.get(code) ?? 0) > 1) errors.push(`Employee ID ${code} appears more than once in the file`);
    const machineId = data.deviceUserId ? normaliseDeviceUserId(data.deviceUserId) : '';
    if (machineId && usedMachineIds.has(machineId)) errors.push(`Thumb machine ID ${machineId} is already given to another employee`);
    if (machineId && (fileMachineIds.get(machineId) ?? 0) > 1) errors.push(`Thumb machine ID ${machineId} appears more than once in the file`);
    if (data.department && !deptBy.has(data.department.toLowerCase())) errors.push(`Department "${data.department}" not found`);
    if (data.designation && !desigBy.has(data.designation.toLowerCase())) errors.push(`Designation "${data.designation}" not found`);
    if (data.managerCode) {
      const m = data.managerCode.toUpperCase();
      if (!existingCodes.has(m) && !fileCodes.has(m)) errors.push(`Manager ${data.managerCode} not found`);
    }

    const parsed = createEmployeeSchema.safeParse({
      ...data,
      gender: data.gender?.toUpperCase() || undefined,
      employmentType: data.employmentType?.toUpperCase().replace(/\s+/g, '_') || undefined,
      status: data.status?.toUpperCase().replace(/\s+/g, '_') || undefined,
      taxCategory: data.taxCategory?.toUpperCase() || undefined,
      basicSalary: data.basicSalary ? data.basicSalary.replace(/,/g, '') : undefined,
    });
    if (!parsed.success) for (const issue of parsed.error.issues) errors.push(`${issue.path.join('.') || 'row'}: ${issue.message}`);

    return { row: i + 2, data, errors: [...new Set(errors)] };
  });

  const invalid = results.filter((r) => r.errors.length).length;
  return { results, valid: results.length - invalid, invalid };
}

/**
 * Import all rows in one transaction. If any row is invalid nothing is imported; the
 * administrator gets the full error list instead of a silent partial import.
 */
export async function commit(auth: AuthContext, rows: Record<string, string>[], actor: AuditActor) {
  const check = await validateRows(auth, rows);
  if (check.invalid > 0) {
    throw unprocessable(`${check.invalid} row(s) have errors. Nothing was imported.`, 'IMPORT_INVALID', check.results.filter((r) => r.errors.length));
  }
  const orgId = auth.organisationId;
  const [departments, designations, org] = await Promise.all([
    prisma.department.findMany({ where: { organisationId: orgId, deletedAt: null } }),
    prisma.designation.findMany({ where: { organisationId: orgId, deletedAt: null } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { defaultShiftId: true } }),
  ]);
  const dept = (v?: string) => (v ? departments.find((d) => d.code.toLowerCase() === v.toLowerCase() || d.name.toLowerCase() === v.toLowerCase())?.id ?? null : null);
  const desig = (v?: string) => (v ? designations.find((d) => d.name.toLowerCase() === v.toLowerCase())?.id ?? null : null);
  const year = todayIn().getUTCFullYear();

  const created = await prisma.$transaction(
    async (tx) => {
      const codeToId = new Map<string, string>();
      const pendingManagers: { id: string; managerCode: string }[] = [];
      for (const data of rows) {
        const input = createEmployeeSchema.parse({
          ...data,
          gender: data.gender?.toUpperCase() || undefined,
          employmentType: data.employmentType?.toUpperCase().replace(/\s+/g, '_') || undefined,
          status: data.status?.toUpperCase().replace(/\s+/g, '_') || undefined,
          taxCategory: data.taxCategory?.toUpperCase() || undefined,
          basicSalary: data.basicSalary ? data.basicSalary.replace(/,/g, '') : undefined,
        });
        const joinDate = parseDateOnly(input.joinDate);
        const emp = await tx.employee.create({
          data: {
            organisationId: orgId,
            employeeCode: input.employeeCode,
            firstName: input.firstName,
            middleName: input.middleName ?? null,
            lastName: input.lastName,
            gender: input.gender ?? null,
            dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth) : null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            joinDate,
            employmentType: input.employmentType,
            status: input.status,
            departmentId: dept(data.department),
            designationId: desig(data.designation),
            branch: input.branch ?? null,
            workLocation: input.workLocation ?? null,
            deviceUserId: input.deviceUserId ?? null,
            bankName: input.bankName ?? null,
            bankAccountNumber: input.bankAccountNumber ?? null,
            panNumber: input.panNumber ?? null,
            citizenshipNumber: input.citizenshipNumber ?? null,
            address: input.address ?? null,
            province: input.province ?? null,
            district: input.district ?? null,
            municipality: input.municipality ?? null,
            emergencyContactName: input.emergencyContactName ?? null,
            emergencyContactPhone: input.emergencyContactPhone ?? null,
            taxCategory: input.taxCategory,
          },
        });
        codeToId.set(emp.employeeCode, emp.id);
        if (data.managerCode) pendingManagers.push({ id: emp.id, managerCode: data.managerCode.toUpperCase() });
        await tx.employmentHistory.create({
          data: { employeeId: emp.id, eventType: 'JOINED', effectiveDate: joinDate, departmentId: emp.departmentId, designationId: emp.designationId, status: emp.status, remarks: 'Imported', createdById: auth.userId },
        });
        if (input.basicSalary !== undefined) {
          await tx.employeeSalary.create({ data: { employeeId: emp.id, basicSalary: dec(input.basicSalary), effectiveFrom: joinDate, reason: 'Imported', createdById: auth.userId } });
        }
        if (org.defaultShiftId) await tx.employeeShift.create({ data: { employeeId: emp.id, shiftId: org.defaultShiftId, effectiveFrom: joinDate } });
        await ensureLeaveBalances(tx, orgId, emp.id, year);
      }
      // Managers can reference rows in the same file, so link them after everyone exists.
      for (const p of pendingManagers) {
        const managerId = codeToId.get(p.managerCode) ?? (await tx.employee.findFirst({ where: { organisationId: orgId, employeeCode: p.managerCode }, select: { id: true } }))?.id;
        if (managerId && managerId !== p.id) await tx.employee.update({ where: { id: p.id }, data: { managerId } });
      }
      await writeAudit(actor, { action: 'EMPLOYEES_IMPORTED', module: 'employees', newValue: { count: rows.length, codes: [...codeToId.keys()] } }, tx);
      return codeToId.size;
    },
    { timeout: 120_000 },
  );
  // Pick up any scans the machine already sent for these people.
  const withMachineIds = await prisma.employee.findMany({ where: { organisationId: orgId, deviceUserId: { not: null }, employeeCode: { in: rows.map((r) => (r.employeeCode ?? '').toUpperCase()) } }, select: { id: true, deviceUserId: true } });
  for (const e of withMachineIds) await syncEmployeePunches(orgId, e.id, e.deviceUserId);
  return { imported: created };
}
