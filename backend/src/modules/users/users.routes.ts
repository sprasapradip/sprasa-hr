import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as c from './users.controller';

export const userRoutes = Router();

userRoutes.get('/', requirePermission('users.view', 'users.manage'), c.list);
userRoutes.post('/', requirePermission('users.manage'), c.create);
userRoutes.put('/:id', requirePermission('users.manage'), c.update);
userRoutes.delete('/:id', requirePermission('users.manage'), c.remove);
userRoutes.post('/:id/resend-invite', requirePermission('users.manage'), c.resendInvite);
userRoutes.post('/:id/unlock', requirePermission('users.manage'), c.unlock);

export const roleRoutes = Router();

roleRoutes.get('/', requirePermission('users.view', 'users.manage', 'roles.manage'), c.roles);
roleRoutes.get('/permissions', requirePermission('roles.manage', 'users.manage'), c.permissions);
roleRoutes.post('/', requirePermission('roles.manage'), c.createRole);
roleRoutes.put('/:id', requirePermission('roles.manage'), c.updateRole);
roleRoutes.delete('/:id', requirePermission('roles.manage'), c.deleteRole);
