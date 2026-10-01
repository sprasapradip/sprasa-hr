import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as c from './employees.controller';

export const employeeRoutes = Router();

employeeRoutes.get('/', requirePermission('employees.view'), c.list);
employeeRoutes.get('/options', requirePermission('employees.view', 'leave.view', 'attendance.view', 'payroll.view', 'users.manage'), c.options);
employeeRoutes.get('/next-code', requirePermission('employees.create'), c.nextCode);
employeeRoutes.get('/org-chart', requirePermission('employees.view'), c.orgChart);
employeeRoutes.get('/import/template', requirePermission('employees.import'), c.importTemplate);
employeeRoutes.post('/import/preview', requirePermission('employees.import'), c.importUpload, c.importPreview);
employeeRoutes.post('/import/commit', requirePermission('employees.import'), c.importCommit);
employeeRoutes.post('/', requirePermission('employees.create'), c.create);

employeeRoutes.get('/:id', requirePermission('employees.view'), c.get);
employeeRoutes.put('/:id', requirePermission('employees.update'), c.update);
employeeRoutes.delete('/:id', requirePermission('employees.delete'), c.remove);
employeeRoutes.get('/:id/history', requirePermission('employees.view'), c.history);
employeeRoutes.get('/:id/activity', requirePermission('employees.view'), c.activity);
employeeRoutes.get('/:id/photo', c.photo);
employeeRoutes.post('/:id/photo', requirePermission('employees.update'), c.photoUpload, c.uploadPhoto);
employeeRoutes.get('/:id/salaries', requirePermission('salary.view'), c.salaryHistory);
employeeRoutes.post('/:id/salaries', requirePermission('salary.manage'), c.createSalary);
employeeRoutes.get('/:id/shifts', requirePermission('employees.view', 'attendance.view'), c.shiftHistory);
employeeRoutes.post('/:id/shifts', requirePermission('shifts.manage', 'attendance.manage'), c.assignShift);
