import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { body, params, query } from '../../middleware/validate';
import { assertEmployeeAccess } from '../../services/access.service';
import { actorFromRequest } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { zDate } from '../../utils/validation';
import * as service from './attendance.service';

const idParam = z.object({ id: z.string().uuid() });

export const attendanceRoutes = Router();

attendanceRoutes.get('/', requirePermission('attendance.view'), async (req, res) => {
  const q = query(req, service.listAttendanceQuery);
  if (q.format) {
    const all = await service.list(req.auth!, { ...q, page: 1, limit: 20_000 });
    return sendExport(res, q.format, {
      title: 'Attendance',
      subtitle: q.date ? `Date: ${q.date}` : `${q.from ?? '…'} to ${q.to ?? '…'}`,
      filename: `attendance-${q.date ?? q.from ?? 'export'}`,
      columns: [
        { key: 'date', header: 'Date', format: 'date' },
        { key: 'code', header: 'Employee ID' },
        { key: 'employeeName', header: 'Employee', width: 2 },
        { key: 'department', header: 'Department', width: 1.5 },
        { key: 'status', header: 'Status' },
        { key: 'checkIn', header: 'In' },
        { key: 'checkOut', header: 'Out' },
        { key: 'lateMinutes', header: 'Late (min)', format: 'number' },
        { key: 'overtimeMinutes', header: 'OT (min)', format: 'number' },
        { key: 'remarks', header: 'Remarks', width: 2 },
      ],
      rows: all.data.map((r) => ({ ...r, code: r.employee.employeeCode, department: r.employee.department?.name })),
    });
  }
  res.json({ success: true, ...(await service.list(req.auth!, q)) });
});

attendanceRoutes.get('/summary', requirePermission('attendance.view'), async (req, res) => {
  const q = query(req, z.object({ date: zDate.optional(), departmentId: z.string().uuid().optional() }));
  res.json({ success: true, data: await service.summary(req.auth!, q.date, q.departmentId) });
});

attendanceRoutes.get('/roster', requirePermission('attendance.manage'), async (req, res) => {
  const q = query(req, z.object({ date: zDate, departmentId: z.string().uuid().optional() }));
  res.json({ success: true, data: await service.roster(req.auth!, q.date, q.departmentId) });
});

// Self check-ins from the app waiting for HR.
attendanceRoutes.get('/approvals', requirePermission('attendance.approve'), async (req, res) => {
  res.json({ success: true, ...(await service.listApprovals(req.auth!, query(req, service.listApprovalsQuery))) });
});

attendanceRoutes.get('/approvals/count', requirePermission('attendance.approve'), async (req, res) => {
  res.json({ success: true, data: { pending: await service.pendingApprovalCount(req.auth!) } });
});

attendanceRoutes.post('/approvals/approve', requirePermission('attendance.approve'), async (req, res) => {
  const { ids } = body(req, service.approveSchema);
  const data = await service.approveCheckIns(req.auth!, ids, actorFromRequest(req));
  res.json({ success: true, data, message: data.approved === 1 ? 'Check-in approved' : `${data.approved} check-ins approved` });
});

attendanceRoutes.post('/approvals/reject', requirePermission('attendance.approve'), async (req, res) => {
  const { ids, reason } = body(req, service.rejectSchema);
  const data = await service.rejectCheckIns(req.auth!, ids, reason, actorFromRequest(req));
  res.json({ success: true, data, message: data.rejected === 1 ? 'Check-in rejected' : `${data.rejected} check-ins rejected` });
});

attendanceRoutes.get('/employee/:id/month', requirePermission('attendance.view'), async (req, res) => {
  const { id } = params(req, idParam);
  const q = query(req, z.object({ year: z.coerce.number().int().min(2000).max(2100), month: z.coerce.number().int().min(1).max(12) }));
  await assertEmployeeAccess(req.auth!, id);
  res.json({ success: true, data: await service.monthFor(req.auth!.organisationId, id, q.year, q.month) });
});

attendanceRoutes.post('/', requirePermission('attendance.manage'), async (req, res) => {
  const input = body(req, service.upsertAttendanceSchema);
  res.status(201).json({ success: true, data: await service.upsert(req.auth!, input, 'MANUAL', actorFromRequest(req)) });
});

attendanceRoutes.post('/bulk', requirePermission('attendance.manage'), async (req, res) => {
  const input = body(req, service.bulkAttendanceSchema);
  res.json({ success: true, data: await service.bulk(req.auth!, input, actorFromRequest(req)) });
});

attendanceRoutes.put('/:id', requirePermission('attendance.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.update(req.auth!, id, body(req, service.updateAttendanceSchema), actorFromRequest(req)) });
});

attendanceRoutes.delete('/:id', requirePermission('attendance.manage'), async (req, res) => {
  const { id } = params(req, idParam);
  await service.remove(req.auth!, id, actorFromRequest(req));
  res.json({ success: true, message: 'Attendance record deleted' });
});
