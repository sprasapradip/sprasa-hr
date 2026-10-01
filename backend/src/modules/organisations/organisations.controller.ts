import type { Request, Response } from 'express';
import { z } from 'zod';
import { IMAGE_TYPES, relativeUploadPath, uploadSingle } from '../../middleware/upload';
import { body, params } from '../../middleware/validate';
import { actorFromRequest } from '../../services/audit.service';
import { badRequest } from '../../utils/errors';
import * as service from './organisations.service';
import { createOrganisationSchema, orgStatusSchema, updateOrganisationSchema } from './organisations.schemas';

const idParam = z.object({ id: z.string().uuid() });

export const logoUpload = uploadSingle('logo', { folder: 'logos', allowedTypes: IMAGE_TYPES, maxSize: 2 * 1024 * 1024 });

export async function list(_req: Request, res: Response) {
  res.json({ success: true, data: await service.list() });
}

export async function create(req: Request, res: Response) {
  const input = body(req, createOrganisationSchema);
  res.status(201).json({ success: true, data: await service.create(input, actorFromRequest(req)) });
}

export async function current(req: Request, res: Response) {
  res.json({ success: true, data: await service.get(req.auth!.organisationId) });
}

export async function updateCurrent(req: Request, res: Response) {
  const input = body(req, updateOrganisationSchema);
  res.json({ success: true, data: await service.update(req.auth!.organisationId, input, actorFromRequest(req)) });
}

export async function update(req: Request, res: Response) {
  const { id } = params(req, idParam);
  const input = body(req, updateOrganisationSchema);
  res.json({ success: true, data: await service.update(id, input, actorFromRequest(req)) });
}

export async function setStatus(req: Request, res: Response) {
  const { id } = params(req, idParam);
  const { status } = body(req, orgStatusSchema);
  await service.setStatus(id, status, actorFromRequest(req));
  res.json({ success: true, message: 'Status updated' });
}

export async function uploadLogo(req: Request, res: Response) {
  if (!req.file) throw badRequest('Choose an image to upload', 'FILE_REQUIRED');
  await service.setLogo(req.auth!.organisationId, relativeUploadPath(req.file.path), actorFromRequest(req));
  res.json({ success: true, message: 'Logo updated' });
}

export async function logo(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(await service.logoFile(req.auth!.organisationId));
}
