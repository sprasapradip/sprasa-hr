import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { body, params, query } from '../../middleware/validate';
import { actorFromRequest } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { generatePayrollSchema, payrollListQuery, payslipListQuery, registerQuery } from './payroll.schemas';
import * as service from './payroll.service';
import * as payslips from './payslip.service';

const idParam = z.object({ id: z.string().uuid() });

export const payrollRoutes = Router();

payrollRoutes.get('/', requirePermission('payroll.view'), async (req, res) => {
  res.json({ success: true, ...(await service.list(req.auth!.organisationId, query(req, payrollListQuery))) });
});

payrollRoutes.post('/generate', requirePermission('payroll.process'), async (req, res) => {
  const input = body(req, generatePayrollSchema);
  res.status(201).json({ success: true, data: await service.generate(req.auth!, input, actorFromRequest(req)) });
});

payrollRoutes.get('/:id', requirePermission('payroll.view'), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.get(req.auth!.organisationId, id) });
});

payrollRoutes.post('/:id/recalculate', requirePermission('payroll.process'), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.recalculate(req.auth!, id, actorFromRequest(req)) });
});

payrollRoutes.post('/:id/review', requirePermission('payroll.process'), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.review(req.auth!, id, actorFromRequest(req)) });
});

payrollRoutes.post('/:id/approve', requirePermission('payroll.approve'), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.approve(req.auth!, id, actorFromRequest(req)) });
});

payrollRoutes.post('/:id/mark-paid', requirePermission('payroll.approve'), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ success: true, data: await service.markPaid(req.auth!, id, actorFromRequest(req)) });
});

payrollRoutes.post('/:id/cancel', requirePermission('payroll.approve'), async (req, res) => {
  const { id } = params(req, idParam);
  const { reason } = body(req, z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) }));
  res.json({ success: true, data: await service.cancel(req.auth!, id, reason, actorFromRequest(req)) });
});

/** Payroll register: one row per employee, with CSV / Excel / PDF export. */
payrollRoutes.get('/:id/register', requirePermission('payroll.view'), async (req, res) => {
  const { id } = params(req, idParam);
  const q = query(req, registerQuery);
  if (q.format) {
    const all = await service.register(req.auth!.organisationId, id, { ...q, page: 1, limit: 10_000 });
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: req.auth!.organisationId }, select: { name: true } });
    return sendExport(res, q.format, {
      title: `Payroll register — ${all.payroll.period}`,
      subtitle: `${org.name} · Status: ${all.payroll.status} · ${all.pagination.total} employees`,
      filename: `payroll-register-${all.payroll.year}-${String(all.payroll.month).padStart(2, '0')}`,
      columns: [
        { key: 'employeeCode', header: 'Employee ID' },
        { key: 'employeeName', header: 'Employee Name', width: 2 },
        { key: 'departmentName', header: 'Department', width: 1.4 },
        { key: 'basicSalary', header: 'Basic', format: 'money' },
        { key: 'totalAllowances', header: 'Allowances', format: 'money' },
        { key: 'grossSalary', header: 'Gross', format: 'money' },
        { key: 'taxAmount', header: 'Tax', format: 'money' },
        { key: 'pfSsf', header: 'PF/SSF', format: 'money' },
        { key: 'otherDeductions', header: 'Other Deductions', format: 'money' },
        { key: 'netSalary', header: 'Net Salary', format: 'money' },
        { key: 'status', header: 'Status' },
      ],
      rows: all.data.map((r) => ({ ...r, status: all.payroll.status })),
      totals: {
        employeeName: 'Total',
        basicSalary: all.totals.basicSalary,
        totalAllowances: all.totals.totalAllowances,
        grossSalary: all.totals.grossSalary,
        taxAmount: all.totals.taxAmount,
        pfSsf: all.data.reduce((s, r) => s + r.pfSsf, 0),
        otherDeductions: all.totals.otherDeductions,
        netSalary: all.totals.netSalary,
      },
    });
  }
  res.json({ success: true, ...(await service.register(req.auth!.organisationId, id, q)) });
});

payrollRoutes.get('/:id/items/:itemId', requirePermission('payroll.view'), async (req, res) => {
  const p = params(req, z.object({ id: z.string().uuid(), itemId: z.string().uuid() }));
  res.json({ success: true, data: await service.item(req.auth!.organisationId, p.id, p.itemId) });
});

// ── Payslips ─────────────────────────────────────────────────

export const payslipRoutes = Router();

/** Anyone can list: HR sees all in scope, employees only their own (enforced in the service). */
payslipRoutes.get('/', async (req, res) => {
  res.json({ success: true, ...(await payslips.list(req.auth!, query(req, payslipListQuery))) });
});

payslipRoutes.get('/:id', async (req, res) => {
  const { id } = params(req, idParam);
  const { logoPath: _logo, ...data } = await payslips.get(req.auth!, id);
  res.json({ success: true, data });
});

payslipRoutes.get('/:id/pdf', async (req, res) => {
  const { id } = params(req, idParam);
  const { inline } = query(req, z.object({ inline: z.enum(['0', '1']).optional() }));
  const p = await payslips.get(req.auth!, id);
  const pdf = await payslips.renderPdf(p);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${inline === '1' ? 'inline' : 'attachment'}; filename="${p.payslipNumber}.pdf"`);
  res.send(pdf);
});
