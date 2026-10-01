import fs from 'node:fs';
import type { DocumentType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { templates } from '../../emails/templates';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { relativeUploadPath, resolveUploadPath } from '../../middleware/upload';
import { employeeScope } from '../../services/access.service';
import { writeAudit, type AuditActor } from '../../services/audit.service';
import { notify, usersWithPermission } from '../../services/notification.service';
import { getNotificationSettings } from '../../services/settings.service';
import type { AuthContext } from '../../types/express';
import { addDays, formatDateOnly, parseDateOnly, todayIn } from '../../utils/dates';
import { badRequest, notFound } from '../../utils/errors';
import { paginated, paginationQuery, paging } from '../../utils/pagination';
import { optional, zDate } from '../../utils/validation';
import { fullName } from '../employees/employees.service';

export const DOCUMENT_TYPES = ['CITIZENSHIP', 'PASSPORT', 'CONTRACT', 'APPOINTMENT_LETTER', 'EDUCATION_CERTIFICATE', 'EXPERIENCE_LETTER', 'TAX_DOCUMENT', 'OTHER'] as const;

export const uploadDocumentSchema = z.object({
  employeeId: z.string().uuid(),
  documentType: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(2).max(150),
  expiryDate: optional(zDate),
});

export const listDocumentsQuery = paginationQuery.extend({
  employeeId: z.string().uuid().optional(),
  documentType: z.enum(DOCUMENT_TYPES).optional(),
  /** Only documents expiring within this many days (includes already expired). */
  expiringWithin: z.coerce.number().int().min(0).max(365).optional(),
});

const include = {
  employee: { select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true, department: { select: { name: true } } } },
} satisfies Prisma.EmployeeDocumentInclude;

function shape<T extends { filePath: string; expiryDate: Date | null; employee: { firstName: string; middleName: string | null; lastName: string } }>(doc: T) {
  const { filePath: _fp, ...rest } = doc;
  const today = todayIn();
  const daysToExpiry = doc.expiryDate ? Math.round((doc.expiryDate.getTime() - today.getTime()) / 86_400_000) : null;
  return {
    ...rest,
    employeeName: fullName(doc.employee),
    daysToExpiry,
    expiryState: daysToExpiry === null ? 'NONE' : daysToExpiry < 0 ? 'EXPIRED' : daysToExpiry <= 30 ? 'EXPIRING' : 'VALID',
  };
}

export async function list(auth: AuthContext, q: z.infer<typeof listDocumentsQuery>) {
  const where: Prisma.EmployeeDocumentWhereInput = {
    organisationId: auth.organisationId,
    deletedAt: null,
    employee: employeeScope(auth),
    ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    ...(q.documentType ? { documentType: q.documentType } : {}),
    ...(q.expiringWithin !== undefined ? { expiryDate: { not: null, lte: addDays(todayIn(), q.expiringWithin) } } : {}),
    ...(q.search
      ? {
          OR: [
            { title: { contains: q.search, mode: 'insensitive' } },
            { fileName: { contains: q.search, mode: 'insensitive' } },
            { employee: { firstName: { contains: q.search, mode: 'insensitive' } } },
            { employee: { lastName: { contains: q.search, mode: 'insensitive' } } },
            { employee: { employeeCode: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.employeeDocument.findMany({ where, include, orderBy: q.expiringWithin !== undefined ? { expiryDate: 'asc' } : { createdAt: 'desc' }, ...paging(q) }),
    prisma.employeeDocument.count({ where }),
  ]);
  return paginated(rows.map(shape), total, q);
}

export async function upload(auth: AuthContext, file: Express.Multer.File, input: z.infer<typeof uploadDocumentSchema>, actor: AuditActor) {
  const employee = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id: input.employeeId }] } });
  if (!employee) {
    fs.rm(file.path, { force: true }, () => undefined);
    throw notFound('Employee');
  }
  const doc = await prisma.employeeDocument.create({
    data: {
      organisationId: auth.organisationId,
      employeeId: input.employeeId,
      documentType: input.documentType as DocumentType,
      title: input.title,
      filePath: relativeUploadPath(file.path),
      // Original name is kept only for display/download; the stored file uses a random id.
      fileName: file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 150),
      fileSize: file.size,
      mimeType: file.mimetype,
      expiryDate: input.expiryDate ? parseDateOnly(input.expiryDate) : null,
      uploadedById: auth.userId,
    },
    include,
  });
  await writeAudit(actor, { action: 'DOCUMENT_UPLOADED', module: 'documents', recordId: input.employeeId, newValue: { documentId: doc.id, title: doc.title, type: doc.documentType } });
  return shape(doc);
}

/** Resolve a document the caller may read: HR with documents.view (within scope) or the employee themself. */
export async function getForDownload(auth: AuthContext, id: string) {
  const doc = await prisma.employeeDocument.findFirst({ where: { id, organisationId: auth.organisationId, deletedAt: null } });
  if (!doc) throw notFound('Document');
  const own = auth.employeeId === doc.employeeId;
  if (!own) {
    if (!auth.permissions.has('documents.view')) throw notFound('Document');
    const inScope = await prisma.employee.findFirst({ where: { AND: [employeeScope(auth), { id: doc.employeeId }] }, select: { id: true } });
    if (!inScope) throw notFound('Document');
  }
  const full = resolveUploadPath(doc.filePath);
  if (!fs.existsSync(full)) throw notFound('File', 'FILE_MISSING');
  return { doc, full };
}

export async function remove(auth: AuthContext, id: string, actor: AuditActor) {
  const doc = await prisma.employeeDocument.findFirst({ where: { id, organisationId: auth.organisationId, deletedAt: null, employee: employeeScope(auth) } });
  if (!doc) throw notFound('Document');
  await prisma.employeeDocument.update({ where: { id }, data: { deletedAt: new Date() } });
  fs.rm(resolveUploadPath(doc.filePath), { force: true }, () => undefined);
  await writeAudit(actor, { action: 'DOCUMENT_DELETED', module: 'documents', recordId: doc.employeeId, oldValue: { documentId: id, title: doc.title } });
}

export const PREVIEWABLE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export function assertPreviewable(mimeType: string) {
  if (!PREVIEWABLE.includes(mimeType)) throw badRequest('This file type cannot be previewed; download it instead', 'NOT_PREVIEWABLE');
}

/** Daily job: warn HR about documents expiring soon. Each document is only reported once. */
export async function notifyExpiringDocuments() {
  const orgs = await prisma.organisation.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } });
  for (const org of orgs) {
    const settings = await getNotificationSettings(org.id);
    const docs = await prisma.employeeDocument.findMany({
      where: { organisationId: org.id, deletedAt: null, expiryNotifiedAt: null, expiryDate: { not: null, lte: addDays(todayIn(), settings.documentExpiryWarningDays) } },
      include,
    });
    if (!docs.length) continue;
    const recipients = await usersWithPermission(org.id, ['documents.manage']);
    const items = docs.map((d) => ({ employee: fullName(d.employee), title: d.title, expiry: formatDateOnly(d.expiryDate!) }));
    await notify(recipients, {
      organisationId: org.id,
      type: 'DOCUMENT_EXPIRY',
      title: `${docs.length} document(s) expiring soon`,
      message: items.slice(0, 3).map((i) => `${i.employee}: ${i.title} (${i.expiry})`).join('; ') + (docs.length > 3 ? '…' : ''),
      link: '/app/documents?expiring=1',
      email: (r) => templates.documentExpiry({ orgName: org.name, name: r.name, items, url: `${env.FRONTEND_URL}/app/documents?expiring=1` }),
    });
    await prisma.employeeDocument.updateMany({ where: { id: { in: docs.map((d) => d.id) } }, data: { expiryNotifiedAt: new Date() } });
  }
}
