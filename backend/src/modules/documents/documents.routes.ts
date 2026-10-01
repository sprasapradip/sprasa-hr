import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { body, params, query } from '../../middleware/validate';
import { actorFromRequest } from '../../services/audit.service';
import { badRequest } from '../../utils/errors';
import * as service from './documents.service';

const idParam = z.object({ id: z.string().uuid() });
const documentUpload = uploadSingle('file', { folder: 'documents' });

export const documentRoutes = Router();

documentRoutes.get('/', requirePermission('documents.view'), async (req, res) => {
  res.json({ success: true, ...(await service.list(req.auth!, query(req, service.listDocumentsQuery))) });
});

documentRoutes.post('/', requirePermission('documents.manage'), documentUpload, async (req, res) => {
  if (!req.file) throw badRequest('Choose a file to upload', 'FILE_REQUIRED');
  let input;
  try {
    input = body(req, service.uploadDocumentSchema);
  } catch (err) {
    fs.rm(req.file.path, { force: true }, () => undefined);
    throw err;
  }
  res.status(201).json({ success: true, data: await service.upload(req.auth!, req.file, input, actorFromRequest(req)) });
});

/** Download or preview. Access: documents.view within scope, or the employee's own documents. */
documentRoutes.get('/:id/download', async (req, res) => {
  const { id } = params(req, idParam);
  const { inline } = query(req, z.object({ inline: z.enum(['0', '1']).optional() }));
  const { doc, full } = await service.getForDownload(req.auth!, id);
  if (inline === '1') service.assertPreviewable(doc.mimeType);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline === '1' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.fileName)}"`);
  res.sendFile(full);
});

documentRoutes.delete('/:id', requirePermission('documents.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  await service.remove(req.auth!, id, actorFromRequest(req));
  res.json({ success: true, message: 'Document deleted' });
});
