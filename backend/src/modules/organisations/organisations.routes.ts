import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as c from './organisations.controller';

export const organisationRoutes = Router();

organisationRoutes.get('/current', c.current);
organisationRoutes.put('/current', requirePermission('settings.manage'), c.updateCurrent);
organisationRoutes.get('/current/logo', c.logo);
organisationRoutes.post('/current/logo', requirePermission('settings.manage'), c.logoUpload, c.uploadLogo);

organisationRoutes.get('/', requirePermission('organisations.manage'), c.list);
organisationRoutes.post('/', requirePermission('organisations.manage'), c.create);
organisationRoutes.put('/:id', requirePermission('organisations.manage'), c.update);
organisationRoutes.patch('/:id/status', requirePermission('organisations.manage'), c.setStatus);
