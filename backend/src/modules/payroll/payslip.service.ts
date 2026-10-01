import fs from 'node:fs';
import type { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { resolveUploadPath } from '../../middleware/upload';
import { employeeScope } from '../../services/access.service';
import type { AuthContext } from '../../types/express';
import { formatDateOnly } from '../../utils/dates';
import { notFound } from '../../utils/errors';
import { toNumber } from '../../utils/money';
import { amountInWords } from '../../utils/number-words';
import { paginated, paging } from '../../utils/pagination';
import type { payslipListQuery } from './payroll.schemas';
import { periodLabel, shapeItem } from './payroll.service';
import { getPayrollSettings } from '../../services/settings.service';

const include = {
  payrollItem: { include: { components: { orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }] }, payslip: { select: { id: true, payslipNumber: true } }, payroll: { select: { status: true, paidAt: true } } } },
  employee: { select: { id: true, employeeCode: true, panNumber: true, ssfNumber: true, joinDate: true } },
} satisfies Prisma.PayslipInclude;

/** HR with payslips.view sees everyone in scope; everyone else only their own. */
function accessWhere(auth: AuthContext): Prisma.PayslipWhereInput {
  if (auth.permissions.has('payslips.view')) return { organisationId: auth.organisationId, employee: employeeScope(auth) };
  return { organisationId: auth.organisationId, employeeId: auth.employeeId ?? '__none__' };
}

export async function list(auth: AuthContext, q: z.infer<typeof payslipListQuery>) {
  const where: Prisma.PayslipWhereInput = {
    AND: [
      accessWhere(auth),
      q.year ? { year: q.year } : {},
      q.month ? { month: q.month } : {},
      q.employeeId ? { employeeId: q.employeeId } : {},
      q.departmentId ? { employee: { departmentId: q.departmentId } } : {},
      q.search ? { OR: [{ payslipNumber: { contains: q.search, mode: 'insensitive' } }, { payrollItem: { employeeName: { contains: q.search, mode: 'insensitive' } } }] } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.payslip.findMany({
      where,
      include: { payrollItem: { select: { employeeName: true, employeeCode: true, departmentName: true, grossSalary: true, totalDeductions: true, netSalary: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { payslipNumber: 'asc' }],
      ...paging(q),
    }),
    prisma.payslip.count({ where }),
  ]);
  return paginated(
    rows.map((r) => ({
      id: r.id,
      payslipNumber: r.payslipNumber,
      year: r.year,
      month: r.month,
      period: periodLabel(r.year, r.month),
      generatedAt: r.generatedAt,
      employeeId: r.employeeId,
      employeeName: r.payrollItem.employeeName,
      employeeCode: r.payrollItem.employeeCode,
      department: r.payrollItem.departmentName,
      grossSalary: toNumber(r.payrollItem.grossSalary),
      totalDeductions: toNumber(r.payrollItem.totalDeductions),
      netSalary: toNumber(r.payrollItem.netSalary),
    })),
    total,
    q,
  );
}

export async function get(auth: AuthContext, id: string) {
  const p = await prisma.payslip.findFirst({ where: { AND: [accessWhere(auth), { id }] }, include });
  if (!p) throw notFound('Payslip');
  const [org, settings] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: p.organisationId } }),
    getPayrollSettings(p.organisationId),
  ]);
  const item = shapeItem(p.payrollItem);
  return {
    id: p.id,
    payslipNumber: p.payslipNumber,
    period: periodLabel(p.year, p.month),
    year: p.year,
    month: p.month,
    generatedAt: p.generatedAt,
    status: p.payrollItem.payroll.status,
    paidAt: p.payrollItem.payroll.paidAt,
    organisation: {
      name: org.name,
      legalName: org.legalName,
      address: [org.address, org.municipality, org.district, org.province].filter(Boolean).join(', '),
      phone: org.phone,
      email: org.email,
      panNumber: org.panNumber,
      hasLogo: Boolean(org.logoPath),
      currency: org.currency,
    },
    employee: {
      id: p.employee.id,
      employeeCode: item.employeeCode,
      name: item.employeeName,
      department: item.departmentName,
      designation: item.designationName,
      panNumber: p.employee.panNumber,
      ssfNumber: p.employee.ssfNumber,
      joinDate: p.employee.joinDate,
    },
    payment: { method: settings.paymentMethod, bankName: item.bankName, bankAccountNumber: item.bankAccountNumber ? `••••${item.bankAccountNumber.slice(-4)}` : null },
    attendance: { workingDays: item.workingDays, payableDays: item.payableDays, presentDays: item.presentDays, paidLeaveDays: item.paidLeaveDays, unpaidDays: item.unpaidDays, overtimeHours: Math.round((item.overtimeMinutes / 60) * 10) / 10 },
    earnings: item.components.filter((c) => c.type === 'EARNING').map((c) => ({ name: c.name, amount: c.amount })),
    deductions: item.components.filter((c) => c.type === 'DEDUCTION').map((c) => ({ name: c.name, amount: c.amount })),
    basicSalary: item.basicSalary,
    grossSalary: item.grossSalary,
    totalDeductions: item.totalDeductions,
    netSalary: item.netSalary,
    netInWords: amountInWords(item.netSalary, org.currency),
    taxNote: 'Tax is calculated from the tax rules configured by your organisation.',
    logoPath: org.logoPath,
  };
}

const money = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function renderPdf(p: Awaited<ReturnType<typeof get>>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Payslip ${p.payslipNumber}`, Author: p.organisation.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 80;
    const teal = '#0F766E';
    const muted = '#64748B';

    // Header
    let headerX = 40;
    if (p.logoPath) {
      try {
        const logo = resolveUploadPath(p.logoPath);
        if (fs.existsSync(logo) && !logo.endsWith('.webp')) {
          doc.image(logo, 40, 40, { fit: [56, 56] });
          headerX = 108;
        }
      } catch {
        // A missing or unreadable logo should never block a payslip.
      }
    }
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0F172A').text(p.organisation.name, headerX, 42, { width: W - (headerX - 40) - 150 });
    doc.font('Helvetica').fontSize(8.5).fillColor(muted);
    if (p.organisation.address) doc.text(p.organisation.address, headerX, doc.y + 2, { width: W - (headerX - 40) - 150 });
    const contact = [p.organisation.phone, p.organisation.email, p.organisation.panNumber ? `PAN ${p.organisation.panNumber}` : null].filter(Boolean).join('  ·  ');
    if (contact) doc.text(contact, headerX, doc.y + 1, { width: W - (headerX - 40) - 150 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(teal).text('PAYSLIP', 40, 42, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(p.period, 40, 60, { width: W, align: 'right' }).text(p.payslipNumber, 40, 72, { width: W, align: 'right' });

    let y = 112;
    doc.moveTo(40, y).lineTo(40 + W, y).strokeColor('#E2E8F0').lineWidth(1).stroke();
    y += 12;

    // Employee block
    const pairs: [string, string][] = [
      ['Employee', p.employee.name],
      ['Employee ID', p.employee.employeeCode],
      ['Department', p.employee.department ?? '—'],
      ['Designation', p.employee.designation ?? '—'],
      ['PAN', p.employee.panNumber ?? '—'],
      ['Join date', formatDateOnly(p.employee.joinDate)],
      ['Working days', String(p.attendance.workingDays)],
      ['Payable days', String(p.attendance.payableDays)],
      ['Paid leave', `${p.attendance.paidLeaveDays} day(s)`],
      ['Unpaid days', String(p.attendance.unpaidDays)],
    ];
    const colW = W / 2;
    pairs.forEach(([k, v], i) => {
      const x = 40 + (i % 2) * colW;
      const rowY = y + Math.floor(i / 2) * 16;
      doc.font('Helvetica').fontSize(8.5).fillColor(muted).text(k, x, rowY, { width: 90 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A').text(v, x + 92, rowY, { width: colW - 100 });
    });
    y += Math.ceil(pairs.length / 2) * 16 + 14;

    // Earnings / deductions tables side by side
    const tableW = (W - 16) / 2;
    const drawTable = (x: number, title: string, rows: { name: string; amount: number }[], total: number, totalLabel: string) => {
      let ty = y;
      doc.rect(x, ty, tableW, 20).fill(teal);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF').text(title, x + 8, ty + 6).text(p.organisation.currency, x, ty + 6, { width: tableW - 8, align: 'right' });
      ty += 20;
      for (const r of rows) {
        doc.font('Helvetica').fontSize(9).fillColor('#0F172A').text(r.name, x + 8, ty + 5, { width: tableW - 100 });
        doc.text(money(r.amount), x, ty + 5, { width: tableW - 8, align: 'right' });
        ty += 18;
        doc.moveTo(x, ty).lineTo(x + tableW, ty).strokeColor('#F1F5F9').stroke();
      }
      return { endY: ty, total, totalLabel };
    };
    const left = drawTable(40, 'Earnings', p.earnings, p.grossSalary, 'Gross salary');
    const right = drawTable(40 + tableW + 16, 'Deductions', p.deductions, p.totalDeductions, 'Total deductions');
    const totalsY = Math.max(left.endY, right.endY) + 2;
    for (const [x, t] of [[40, left], [40 + tableW + 16, right]] as const) {
      doc.rect(x, totalsY, tableW, 22).fill('#F1F5F9');
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0F172A').text(t.totalLabel, x + 8, totalsY + 7).text(money(t.total), x, totalsY + 7, { width: tableW - 8, align: 'right' });
    }
    y = totalsY + 36;

    // Net pay
    doc.roundedRect(40, y, W, 54, 6).fill('#F0FDFA');
    doc.font('Helvetica').fontSize(9).fillColor(teal).text('NET PAY', 56, y + 10);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0F172A').text(`${p.organisation.currency} ${money(p.netSalary)}`, 56, y + 23);
    doc.font('Helvetica').fontSize(8.5).fillColor(muted).text(p.netInWords, 40, y + 18, { width: W - 16, align: 'right' });
    y += 70;

    const pay = [p.payment.method, p.payment.bankName, p.payment.bankAccountNumber ? `A/C ${p.payment.bankAccountNumber}` : null].filter(Boolean).join('  ·  ');
    doc.font('Helvetica').fontSize(8.5).fillColor(muted).text(`Payment: ${pay}`, 40, y);
    doc.text(p.taxNote, 40, y + 14);
    doc.text(`Generated on ${formatDateOnly(p.generatedAt)} by Sprasa HR. This is a computer-generated payslip and does not need a signature.`, 40, doc.page.height - 60, { width: W, align: 'center' });
    doc.end();
  });
}
