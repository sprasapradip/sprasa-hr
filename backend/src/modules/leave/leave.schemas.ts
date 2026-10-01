import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination';
import { nullable, optional, zDate } from '../../utils/validation';

const bool = z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v), z.boolean());

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,10}$/, '1–10 letters or numbers'),
  description: nullable(z.string().trim().max(300)),
  annualDays: z.coerce.number().min(0).max(365),
  carryForward: z.boolean().default(false),
  maxCarryForward: z.coerce.number().min(0).max(365).default(0),
  requiresDocument: z.boolean().default(false),
  requiresHrApproval: z.boolean().default(false),
  paid: z.boolean().default(true),
  allowHalfDay: z.boolean().default(true),
  limitToBalance: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

/** Multipart-friendly: booleans may arrive as strings. */
export const applyLeaveSchema = z.object({
  employeeId: optional(z.string().uuid()),
  leaveTypeId: z.string().uuid(),
  startDate: zDate,
  endDate: zDate,
  halfDay: bool.default(false),
  reason: z.string().trim().min(3, 'Give a short reason').max(1000),
});

export const updateLeaveSchema = applyLeaveSchema.omit({ employeeId: true, leaveTypeId: true }).partial();

export const decisionSchema = z.object({ remarks: optional(z.string().trim().max(500)) });
export const rejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });

export const listLeaveQuery = paginationQuery.extend({
  status: z.enum(['PENDING', 'SUPERVISOR_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  /** Only requests the caller can act on now. */
  awaitingMe: z.enum(['0', '1']).optional(),
  format: z.enum(['csv', 'xlsx', 'pdf']).optional(),
});

export const balanceQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
});

export const adjustBalanceSchema = z.object({
  /** Days to add (positive) or remove (negative) from the entitlement. */
  delta: z.coerce.number().min(-365).max(365).refine((v) => v !== 0, 'Enter a non-zero adjustment'),
  reason: z.string().trim().min(3).max(300),
});
