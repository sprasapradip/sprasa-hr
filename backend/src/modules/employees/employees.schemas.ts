import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination';
import { nullable, optional, zDate, zMoney, zPhone } from '../../utils/validation';
import { normaliseDeviceUserId } from '../attendance/punch-file.parser';

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'] as const;
export const EMPLOYMENT_STATUSES = ['ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED'] as const;
export const EXIT_STATUSES = ['RESIGNED', 'TERMINATED', 'RETIRED'] as const;

const name = z.string().trim().min(1).max(60);

const employeeFields = {
  employeeCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, '2–20 letters, numbers or dashes'),
  firstName: name,
  middleName: nullable(z.string().trim().max(60)),
  lastName: name,
  gender: nullable(z.enum(['MALE', 'FEMALE', 'OTHER'])),
  maritalStatus: nullable(z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'])),
  dateOfBirth: nullable(zDate),
  phone: nullable(zPhone),
  email: nullable(z.string().trim().toLowerCase().email()),
  address: nullable(z.string().trim().max(250)),
  province: nullable(z.string().trim().max(60)),
  district: nullable(z.string().trim().max(60)),
  municipality: nullable(z.string().trim().max(100)),
  emergencyContactName: nullable(z.string().trim().max(120)),
  emergencyContactPhone: nullable(zPhone),
  citizenshipNumber: nullable(z.string().trim().max(40)),
  panNumber: nullable(z.string().trim().regex(/^\d{9}$/, 'PAN must be 9 digits')),
  joinDate: zDate,
  employmentType: z.enum(EMPLOYMENT_TYPES).default('FULL_TIME'),
  status: z.enum(EMPLOYMENT_STATUSES).default('PROBATION'),
  departmentId: nullable(z.string().uuid()),
  designationId: nullable(z.string().uuid()),
  managerId: nullable(z.string().uuid()),
  supervisorId: nullable(z.string().uuid()),
  branch: nullable(z.string().trim().max(100)),
  workLocation: nullable(z.string().trim().max(100)),
  bankName: nullable(z.string().trim().max(100)),
  bankAccountNumber: nullable(z.string().trim().max(40)),
  ssfNumber: nullable(z.string().trim().max(40)),
  pfNumber: nullable(z.string().trim().max(40)),
  citNumber: nullable(z.string().trim().max(40)),
  taxCategory: z.enum(['INDIVIDUAL', 'COUPLE']).default('INDIVIDUAL'),
  /** User number on the thumb machine. */
  deviceUserId: nullable(z.string().trim().regex(/^[\w-]{1,30}$/, 'Use the number shown on the machine').transform(normaliseDeviceUserId)),
  notes: nullable(z.string().trim().max(2000)),
};

export const createEmployeeSchema = z.object({
  ...employeeFields,
  shiftId: optional(z.string().uuid()),
  /** Initial salary. Creates the first EmployeeSalary record. */
  basicSalary: optional(zMoney),
  salaryStructureId: optional(z.string().uuid()),
  /** Create a self-service login using the employee's email and send an invite. */
  createUserAccount: z.boolean().default(false),
});

export const updateEmployeeSchema = z
  .object({
    ...employeeFields,
    exitDate: nullable(zDate),
    /** Recorded on the employment history entry when department/designation/status changes. */
    changeRemarks: optional(z.string().trim().max(500)),
  })
  .partial();

export const listEmployeesQuery = paginationQuery.extend({
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  status: z.enum(EMPLOYMENT_STATUSES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  /** "current" = everyone except exited employees. */
  scope: z.enum(['current', 'exited', 'all']).default('current'),
  format: z.enum(['csv', 'xlsx', 'pdf']).optional(),
});

export const salaryLineSchema = z.object({
  componentId: z.string().uuid(),
  calculationType: z.enum(['FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS']),
  value: z.coerce.number().min(0).max(1_000_000_000),
});

export const createSalarySchema = z.object({
  basicSalary: zMoney,
  effectiveFrom: zDate,
  structureId: optional(z.string().uuid()),
  /** If omitted and a structure is given, the structure's lines are copied. */
  lines: z.array(salaryLineSchema).max(50).optional(),
  reason: optional(z.string().trim().max(300)),
});

export const assignShiftSchema = z.object({
  shiftId: z.string().uuid(),
  effectiveFrom: zDate,
});

export const importCommitSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
});
