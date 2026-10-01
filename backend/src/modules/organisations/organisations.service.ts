import crypto from 'node:crypto';
import fs from 'node:fs';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { resolveUploadPath } from '../../middleware/upload';
import { writeAudit, diff, type AuditActor } from '../../services/audit.service';
import { bootstrapOrganisation } from '../../services/org-bootstrap.service';
import { parseDateOnly } from '../../utils/dates';
import { conflict, notFound } from '../../utils/errors';
import { hashPassword, sendPasswordSetupEmail } from '../auth/auth.service';
import type { createOrganisationSchema, updateOrganisationSchema } from './organisations.schemas';

type UpdateInput = z.infer<typeof updateOrganisationSchema>;

function toData(input: UpdateInput) {
  const { fiscalYearStart, ...rest } = input;
  return {
    ...rest,
    ...(fiscalYearStart !== undefined ? { fiscalYearStart: fiscalYearStart ? parseDateOnly(fiscalYearStart) : null } : {}),
  };
}

export async function list() {
  const orgs = await prisma.organisation.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { employees: { where: { deletedAt: null } }, users: { where: { deletedAt: null } } } } },
  });
  return orgs.map(({ logoPath, ...o }) => ({ ...o, hasLogo: Boolean(logoPath) }));
}

export async function get(id: string) {
  const org = await prisma.organisation.findUnique({ where: { id } });
  if (!org) throw notFound('Organisation');
  // JSON settings are served by /settings to users with settings.view only.
  const { logoPath, leaveSettings: _l, payrollSettings: _p, notificationSettings: _n, emailSettings: _e, ...rest } = org;
  return { ...rest, hasLogo: Boolean(logoPath) };
}

export async function update(id: string, input: UpdateInput, actor: AuditActor) {
  const before = await prisma.organisation.findUnique({ where: { id } });
  if (!before) throw notFound('Organisation');
  if (input.defaultShiftId) {
    const shift = await prisma.shift.findFirst({ where: { id: input.defaultShiftId, organisationId: id } });
    if (!shift) throw notFound('Shift');
  }
  const data = toData(input);
  const updated = await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.update({ where: { id }, data });
    const d = diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>);
    if (d.changed) await writeAudit({ ...actor, organisationId: id }, { action: 'SETTINGS_CHANGED', module: 'organisation', recordId: id, ...d }, tx);
    return org;
  });
  return get(updated.id);
}

/** Create an organisation with starter configuration and its first admin user. */
export async function create(input: z.infer<typeof createOrganisationSchema>, actor: AuditActor) {
  const { admin, ...orgInput } = input;
  if (await prisma.user.findUnique({ where: { email: admin.email } })) {
    throw conflict('A user with the admin email already exists', 'EMAIL_TAKEN');
  }
  const { org, adminId } = await prisma.$transaction(
    async (tx) => {
      const org = await tx.organisation.create({ data: { ...toData(orgInput), name: orgInput.name } });
      const { roles } = await bootstrapOrganisation(tx, org.id);
      // The admin sets their own password from the emailed link; this random hash is never shared.
      const user = await tx.user.create({
        data: {
          organisationId: org.id,
          email: admin.email,
          name: admin.name,
          passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
          roleId: roles.hr_admin,
          status: 'INVITED',
        },
      });
      await writeAudit(actor, { action: 'ORGANISATION_CREATED', module: 'organisation', recordId: org.id, newValue: { name: org.name, admin: admin.email } }, tx);
      return { org, adminId: user.id };
    },
    { timeout: 30_000 },
  );
  await sendPasswordSetupEmail(adminId);
  return get(org.id);
}

export async function setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actor: AuditActor) {
  await prisma.organisation.update({ where: { id }, data: { status } });
  await writeAudit(actor, { action: 'ORGANISATION_STATUS_CHANGED', module: 'organisation', recordId: id, newValue: { status } });
}

export async function setLogo(id: string, relativePath: string, actor: AuditActor) {
  const before = await prisma.organisation.findUniqueOrThrow({ where: { id } });
  await prisma.organisation.update({ where: { id }, data: { logoPath: relativePath } });
  if (before.logoPath) fs.rm(resolveUploadPath(before.logoPath), { force: true }, () => undefined);
  await writeAudit({ ...actor, organisationId: id }, { action: 'SETTINGS_CHANGED', module: 'organisation', recordId: id, newValue: { logo: 'updated' } });
}

export async function logoFile(id: string) {
  const org = await prisma.organisation.findUnique({ where: { id }, select: { logoPath: true } });
  if (!org?.logoPath) throw notFound('Logo');
  return resolveUploadPath(org.logoPath);
}
