import { z } from 'zod';
import { prisma, type Db } from '../lib/prisma';
import { notFound } from '../utils/errors';

/**
 * Organisation-level settings stored as JSON columns. Each has a schema with defaults so that
 * missing keys (older rows, new settings) always resolve to a sensible value.
 */

export const leaveSettingsSchema = z.object({
  /** Count weekends inside a leave range as leave days. */
  countWeekends: z.boolean().default(false),
  /** Count public/organisation holidays inside a leave range as leave days. */
  countHolidays: z.boolean().default(false),
  /** Allow approving leave that exceeds the remaining balance. */
  allowNegativeBalance: z.boolean().default(false),
  /** Maximum days in the past an employee may apply for. */
  maxBackdateDays: z.number().int().min(0).max(365).default(30),
});

export const payrollSettingsSchema = z.object({
  /** How a day's pay is derived when deducting unpaid days. */
  unpaidDayBasis: z.enum(['WORKING_DAYS', 'CALENDAR_DAYS']).default('WORKING_DAYS'),
  /** Treat days marked ABSENT as unpaid. */
  deductAbsentDays: z.boolean().default(true),
  /** Days without any attendance record count as absent (only when deductAbsentDays is on). */
  treatMissingAttendanceAsAbsent: z.boolean().default(false),
  overtimeEnabled: z.boolean().default(true),
  overtimeRateMultiplier: z.number().min(0).max(5).default(1.5),
  /** Annual cap on retirement contributions (PF/SSF/CIT) deductible from taxable income. */
  retirementDeductionCap: z.number().min(0).default(500000),
  /** Cap as a percentage of annual gross income (whichever is lower). */
  retirementDeductionMaxPercent: z.number().min(0).max(100).default(33.33),
  roundNetSalary: z.boolean().default(false),
  payslipPrefix: z.string().max(10).default('PS'),
  paymentMethod: z.string().max(60).default('Bank transfer'),
});

export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean().default(true),
  /** Per-type email opt-out; missing types default to enabled. */
  emailTypes: z.record(z.string(), z.boolean()).default({}),
  documentExpiryWarningDays: z.number().int().min(1).max(180).default(30),
});

export const emailSettingsSchema = z.object({
  senderName: z.string().max(80).default(''),
  replyTo: z.string().email().or(z.literal('')).default(''),
  footerNote: z.string().max(300).default(''),
});

export type LeaveSettings = z.infer<typeof leaveSettingsSchema>;
export type PayrollSettings = z.infer<typeof payrollSettingsSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type EmailSettings = z.infer<typeof emailSettingsSchema>;

async function loadOrg(organisationId: string, db: Db) {
  const org = await db.organisation.findUnique({ where: { id: organisationId } });
  if (!org) throw notFound('Organisation');
  return org;
}

export async function getLeaveSettings(organisationId: string, db: Db = prisma): Promise<LeaveSettings> {
  return leaveSettingsSchema.parse((await loadOrg(organisationId, db)).leaveSettings ?? {});
}

export async function getPayrollSettings(organisationId: string, db: Db = prisma): Promise<PayrollSettings> {
  return payrollSettingsSchema.parse((await loadOrg(organisationId, db)).payrollSettings ?? {});
}

export async function getNotificationSettings(organisationId: string, db: Db = prisma): Promise<NotificationSettings> {
  return notificationSettingsSchema.parse((await loadOrg(organisationId, db)).notificationSettings ?? {});
}

export async function getOrgSettings(organisationId: string, db: Db = prisma) {
  const org = await loadOrg(organisationId, db);
  return {
    organisation: org,
    leave: leaveSettingsSchema.parse(org.leaveSettings ?? {}),
    payroll: payrollSettingsSchema.parse(org.payrollSettings ?? {}),
    notifications: notificationSettingsSchema.parse(org.notificationSettings ?? {}),
    email: emailSettingsSchema.parse(org.emailSettings ?? {}),
  };
}
