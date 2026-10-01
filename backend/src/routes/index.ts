import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { attendanceRoutes } from '../modules/attendance/attendance.routes';
import { holidayRoutes, shiftRoutes } from '../modules/attendance/shifts-holidays.routes';
import { auditRoutes } from '../modules/audit/audit.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { departmentRoutes, designationRoutes } from '../modules/departments/departments.routes';
import { documentRoutes } from '../modules/documents/documents.routes';
import { employeeRoutes } from '../modules/employees/employees.routes';
import { leaveRoutes } from '../modules/leave/leave.routes';
import { meRoutes } from '../modules/me/me.routes';
import { notificationRoutes } from '../modules/notifications/notifications.routes';
import { organisationRoutes } from '../modules/organisations/organisations.routes';
import { adjustmentRoutes, componentRoutes, structureRoutes, taxRoutes } from '../modules/payroll/payroll-config.routes';
import { payrollRoutes, payslipRoutes } from '../modules/payroll/payroll.routes';
import { publicRoutes } from '../modules/public/public.routes';
import { reportRoutes } from '../modules/reports/reports.routes';
import { settingsRoutes } from '../modules/settings/settings.routes';
import { roleRoutes, userRoutes } from '../modules/users/users.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
});

// Public
apiRouter.use('/auth', authRoutes);
apiRouter.use('/public', publicRoutes);

// Everything below requires a valid access token.
apiRouter.use(authenticate);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/me', meRoutes);
apiRouter.use('/organisations', organisationRoutes);
apiRouter.use('/settings', settingsRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/roles', roleRoutes);
apiRouter.use('/employees', employeeRoutes);
apiRouter.use('/departments', departmentRoutes);
apiRouter.use('/designations', designationRoutes);
apiRouter.use('/documents', documentRoutes);
apiRouter.use('/attendance', attendanceRoutes);
apiRouter.use('/shifts', shiftRoutes);
apiRouter.use('/holidays', holidayRoutes);
apiRouter.use('/leave', leaveRoutes);
apiRouter.use('/salary-components', componentRoutes);
apiRouter.use('/salary-structures', structureRoutes);
apiRouter.use('/payroll-adjustments', adjustmentRoutes);
apiRouter.use('/tax-rules', taxRoutes);
apiRouter.use('/payroll', payrollRoutes);
apiRouter.use('/payslips', payslipRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/audit-logs', auditRoutes);
