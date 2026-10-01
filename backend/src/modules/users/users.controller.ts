import type { Request, Response } from 'express';
import { z } from 'zod';
import { body, params, query } from '../../middleware/validate';
import { actorFromRequest } from '../../services/audit.service';
import { paginationQuery } from '../../utils/pagination';
import * as service from './users.service';

const idParam = z.object({ id: z.string().uuid() });
const listQuery = paginationQuery.extend({ roleId: z.string().uuid().optional(), status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED']).optional() });

export async function list(req: Request, res: Response) {
  res.json({ success: true, ...(await service.listUsers(req.auth!.organisationId, query(req, listQuery))) });
}

export async function create(req: Request, res: Response) {
  const input = body(req, service.createUserSchema);
  res.status(201).json({ success: true, data: await service.createUser(req.auth!, input, actorFromRequest(req)) });
}

export async function update(req: Request, res: Response) {
  const { id } = params(req, idParam);
  const input = body(req, service.updateUserSchema);
  res.json({ success: true, data: await service.updateUser(req.auth!, id, input, actorFromRequest(req)) });
}

export async function remove(req: Request, res: Response) {
  const { id } = params(req, idParam);
  await service.deleteUser(req.auth!, id, actorFromRequest(req));
  res.json({ success: true, message: 'User deleted' });
}

export async function resendInvite(req: Request, res: Response) {
  const { id } = params(req, idParam);
  await service.resendInvite(req.auth!, id);
  res.json({ success: true, message: 'Password setup email sent' });
}

export async function unlock(req: Request, res: Response) {
  const { id } = params(req, idParam);
  await service.unlockUser(req.auth!, id, actorFromRequest(req));
  res.json({ success: true, message: 'Account unlocked' });
}

export async function roles(req: Request, res: Response) {
  res.json({ success: true, data: await service.listRoles(req.auth!.organisationId) });
}

export async function permissions(_req: Request, res: Response) {
  res.json({ success: true, data: await service.listPermissions() });
}

export async function createRole(req: Request, res: Response) {
  const input = body(req, service.roleSchema);
  res.status(201).json({ success: true, data: await service.createRole(req.auth!.organisationId, input, actorFromRequest(req)) });
}

export async function updateRole(req: Request, res: Response) {
  const { id } = params(req, idParam);
  const input = body(req, service.roleSchema);
  await service.updateRole(req.auth!.organisationId, id, input, actorFromRequest(req));
  res.json({ success: true, message: 'Role updated' });
}

export async function deleteRole(req: Request, res: Response) {
  const { id } = params(req, idParam);
  await service.deleteRole(req.auth!.organisationId, id, actorFromRequest(req));
  res.json({ success: true, message: 'Role deleted' });
}
